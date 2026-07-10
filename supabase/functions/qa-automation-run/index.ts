// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: qa-automation-run
// ─────────────────────────────────────────────────────────────────────────────
// Recebe os disparos da automação de testes (um por cenário) e mantém UMA
// execução (run) automatizada ABERTA por projeto, atualizando os resultados
// caso a caso conforme os cenários vão rodando.
//
// Três tipos de mensagem (todas POST, todas exigem `token`):
//
//   1) Abrir/retest:  { "status": "New", "project": "TalentTrack",
//                       "run_id": "<ignorado p/ roteamento>", "token": "..." }
//      → fecha qualquer run aberta da série do projeto e cria um NOVO ciclo
//        (cycle = anterior+1, status in_progress), semeando um result
//        'untested' para cada caso type=automated do projeto.
//
//   2) Cenário:       { "token": "...", "payload": { "project": "...",
//                       "scenario": { "name","status","durationMs",
//                       "comment","evidence": { "fileName","url" } } }, ... }
//      → acha a run aberta do projeto e casa scenario.name com o title de um
//        caso (normalizado + similaridade ≥ 98%, case-insensitive). Se casar,
//        grava status/comentário/evidência no result. Se NÃO casar, ignora.
//
//   3) Fechar:        { "status": "end", "project": "TalentTrack",
//                       "run_id": "...", "token": "..." }
//      → fecha a run aberta do projeto (idempotente; ok mesmo sem run aberta).
//
// ROTEAMENTO: a chave é o PROJETO (campo `project`), não o `run_id` — o run_id
// enviado muda a cada cenário, então não serve como identificador estável.
//
// AUTH (fase de teste): token mockado no body. Trocar `EXPECTED_TOKEN` /
// migrar para header/secret antes de produção.
//
// Deploy:  supabase functions deploy qa-automation-run --no-verify-jwt
//   (--no-verify-jwt porque a automação não manda JWT de usuário Supabase;
//    a autorização é feita pelo token mockado abaixo.)
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem no projeto).
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ───────────────────────────────────────────────────────────────────
const EXPECTED_TOKEN = 'TESTE!!!@@@@';        // TODO: trocar antes de produção
const MATCH_THRESHOLD = 0.98;                  // similaridade mínima do nome
const SERIES_PREFIX = 'autorun_';              // série fixa por projeto

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Utils ──────────────────────────────────────────────────────────────────
// Mesmo gerador de id do front (testManagement.genId).
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Normaliza um nome para comparação: minúsculas, sem acentos, sem prefixo
// "TCxx -", sem pontuação redundante e com espaços colapsados.
function normalize(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '') // remove acentos (marcas combinantes Unicode)
    .toLowerCase()
    .replace(/^\s*tc\s*\d+\s*[-–—:]\s*/i, '')          // remove "TC01 - " etc
    .replace(/\s+/g, ' ')
    .trim();
}

// Distância de Levenshtein → razão de similaridade em [0,1].
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  const dist = prev[n];
  return 1 - dist / Math.max(m, n);
}

// "Passed" → "passed" etc. Default seguro: 'failed' quando desconhecido.
function mapStatus(raw: unknown): 'passed' | 'failed' | 'blocked' | 'skipped' {
  const s = String(raw ?? '').toLowerCase().trim();
  if (['passed', 'pass', 'ok', 'success', 'sucesso', 'aprovado'].includes(s)) return 'passed';
  if (['blocked', 'bloqueado'].includes(s)) return 'blocked';
  if (['skipped', 'skip', 'ignorado', 'pulado'].includes(s)) return 'skipped';
  return 'failed';
}

// ── Tipos mínimos das linhas que tocamos ──────────────────────────────────
type ProjectRow = { id: string; name: string };
type CaseRow = { id: string; title: string };
type RunRow = { id: string; cycle: number | null; status: string };

// Resolve o projeto pelo nome (case-insensitive) ou pelo id.
async function resolveProject(db: any, project: string): Promise<ProjectRow | null> {
  if (!project) return null;
  const byName = await db.from('qa_test_projects').select('id,name').ilike('name', project).limit(1);
  if (byName.data?.length) return byName.data[0];
  const byId = await db.from('qa_test_projects').select('id,name').eq('id', project).limit(1);
  return byId.data?.length ? byId.data[0] : null;
}

// Fecha todas as runs não-fechadas da série do projeto.
async function closeOpenRuns(db: any, seriesId: string): Promise<number> {
  const { data } = await db.from('qa_test_runs')
    .select('id').eq('series_id', seriesId).neq('status', 'closed');
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  if (ids.length) {
    await db.from('qa_test_runs').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', ids);
  }
  return ids.length;
}

// Cria um novo ciclo (run) para o projeto e semeia results 'untested' para
// cada caso type=automated. Retorna a run criada.
async function openNewCycle(db: any, proj: ProjectRow): Promise<{ run: RunRow; seeded: number }> {
  const seriesId = SERIES_PREFIX + proj.id;
  await closeOpenRuns(db, seriesId);

  const { data: prev } = await db.from('qa_test_runs')
    .select('cycle').eq('series_id', seriesId).order('cycle', { ascending: false }).limit(1);
  const cycle = ((prev?.[0]?.cycle as number) ?? 0) + 1;

  const runId = genId();
  const now = new Date().toISOString();
  const name = `Automação ${proj.name} — ciclo ${cycle} (${now.slice(0, 10)})`;
  await db.from('qa_test_runs').insert([{
    id: runId, project_id: proj.id, plan_id: null, name, status: 'in_progress',
    assigned_to: 'automation', created_at: now, closed_at: null, series_id: seriesId, cycle,
  }]);

  const { data: cases } = await db.from('qa_test_cases')
    .select('id').eq('project_id', proj.id).eq('type', 'automated');
  const rows = (cases ?? []).map((c: { id: string }, i: number) => ({
    id: genId(), run_id: runId, case_id: c.id, status: 'untested',
    executed_by: null, executed_at: null, elapsed_seconds: 0, comment: '',
    evidence: [], position: i, step_results: [],
  }));
  if (rows.length) await db.from('qa_test_run_results').insert(rows);

  return { run: { id: runId, cycle, status: 'in_progress' }, seeded: rows.length };
}

// Acha a run aberta mais recente do projeto (ou null).
async function findOpenRun(db: any, projId: string): Promise<RunRow | null> {
  const { data } = await db.from('qa_test_runs')
    .select('id,cycle,status').eq('series_id', SERIES_PREFIX + projId)
    .neq('status', 'closed').order('created_at', { ascending: false }).limit(1);
  return data?.length ? data[0] : null;
}

// Resolve uma run do painel pelo seu id real (qa_test_runs.id).
type FullRun = { id: string; project_id: string; series_id: string | null; cycle: number | null; status: string; name: string };
async function resolveRunById(db: any, runId: string): Promise<FullRun | null> {
  if (!runId) return null;
  const { data } = await db.from('qa_test_runs')
    .select('id,project_id,series_id,cycle,status,name').eq('id', runId).limit(1);
  return data?.length ? data[0] : null;
}

// Resolve a SÉRIE (o "pai") a partir de um id que pode ser o próprio
// series_id (id do pai) OU o id de qualquer ciclo dela. Retorna o series_id
// canônico e os ciclos ordenados por cycle desc (o mais novo primeiro).
async function seriesRuns(db: any, id: string): Promise<{ seriesId: string; runs: FullRun[] } | null> {
  if (!id) return null;
  const direct = await db.from('qa_test_runs')
    .select('id,project_id,series_id,cycle,status,name').eq('series_id', id).order('cycle', { ascending: false });
  if (direct.data?.length) return { seriesId: id, runs: direct.data as FullRun[] };
  // id pode ser o de um ciclo específico → descobre a série e recarrega
  const r = await resolveRunById(db, id);
  if (!r) return null;
  const sid = r.series_id ?? r.id;
  const q = await db.from('qa_test_runs')
    .select('id,project_id,series_id,cycle,status,name').eq('series_id', sid).order('cycle', { ascending: false });
  return { seriesId: sid, runs: (q.data ?? []) as FullRun[] };
}

// Ciclo aberto (status != closed) de uma série, ou null.
const openCycleOf = (runs: FullRun[]): FullRun | null => runs.find((r) => r.status !== 'closed') ?? null;

// Casos (com título) que pertencem ao conjunto de results de uma run.
async function loadRunCases(db: any, runId: string): Promise<{ caseId: string; title: string }[]> {
  const { data: results } = await db.from('qa_test_run_results').select('case_id').eq('run_id', runId);
  const ids = (results ?? []).map((r: { case_id: string }) => r.case_id);
  if (!ids.length) return [];
  const { data: cases } = await db.from('qa_test_cases').select('id,title').in('id', ids);
  return (cases ?? []).map((c: CaseRow) => ({ caseId: c.id, title: c.title }));
}

// Cria um novo ciclo (retest) clonando o conjunto de casos de uma run existente.
async function retestClone(db: any, run: FullRun): Promise<{ run: RunRow; seeded: number; clonedFrom: string }> {
  const seriesId = run.series_id ?? run.id;
  await closeOpenRuns(db, seriesId);                 // mantém 1 ciclo aberto por série
  const { data: prev } = await db.from('qa_test_runs')
    .select('cycle').eq('series_id', seriesId).order('cycle', { ascending: false }).limit(1);
  const cycle = ((prev?.[0]?.cycle as number) ?? 0) + 1;

  const newId = genId();
  const now = new Date().toISOString();
  await db.from('qa_test_runs').insert([{
    id: newId, project_id: run.project_id, plan_id: null, name: run.name, status: 'in_progress',
    assigned_to: 'automation', created_at: now, closed_at: null, series_id: seriesId, cycle,
  }]);
  const cases = await loadRunCases(db, run.id);
  const rows = cases.map((c, i) => ({
    id: genId(), run_id: newId, case_id: c.caseId, status: 'untested',
    executed_by: null, executed_at: null, elapsed_seconds: 0, comment: '', evidence: [], position: i, step_results: [],
  }));
  if (rows.length) await db.from('qa_test_run_results').insert(rows);
  return { run: { id: newId, cycle, status: 'in_progress' }, seeded: rows.length, clonedFrom: run.id };
}

// ── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(400, { error: 'JSON inválido' }); }

  // Auth: token mockado em todas as chamadas.
  if (String(body.token ?? '') !== EXPECTED_TOKEN) {
    return json(401, { error: 'Token inválido' });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const topStatus = String(body.status ?? '').toLowerCase();
  const projectName = String(body.project ?? body?.payload?.project ?? '');

  try {
    // ── 0) Lookup (somente leitura) — descobre o id das runs de um projeto ─
    // Uso: { "status": "lookup", "project": "TalentTrack", "token": "..." }
    if (topStatus === 'lookup') {
      const proj = await resolveProject(db, projectName);
      if (!proj) return json(404, { error: `Projeto não encontrado: "${projectName}"` });
      const { data: runs } = await db.from('qa_test_runs')
        .select('id,name,status,cycle,series_id,created_at')
        .eq('project_id', proj.id).order('created_at', { ascending: false });
      // anexa contagem de casos por run
      const out = [];
      for (const r of (runs ?? [])) {
        const { count } = await db.from('qa_test_run_results')
          .select('id', { count: 'exact', head: true }).eq('run_id', r.id);
        // parentId = id do PAI/série (é o que se usa na automação).
        out.push({ parentId: r.series_id ?? r.id, ...r, cases: count ?? 0 });
      }
      return json(200, { ok: true, project: proj.name, runs: out });
    }

    // run_id enviado pela automação = id do PAI (série). Pode ser também o id
    // de um ciclo específico — seriesRuns resolve os dois casos.
    const parentId = String(body.run_id ?? '');

    // ── 0b) Cleanup (TEMPORÁRIO) — remove runs de teste / zera resultados ──
    // Uso: { "status":"cleanup", "token":"...", "deleteRuns":["id",...],
    //        "resetRun":"id", "setCycle":1 }
    // REMOVER esta ação após a limpeza (endpoint destrutivo).
    if (topStatus === 'cleanup') {
      const toDelete: string[] = Array.isArray(body.deleteRuns) ? body.deleteRuns.map(String) : [];
      const deleteSeries = String(body.deleteSeries ?? '');
      const resetRunId = String(body.resetRun ?? '');
      const result: Record<string, unknown> = {};
      if (deleteSeries) {
        // Deleta TODA a série informada (critério estável; não depende de ids).
        const { data: doomed } = await db.from('qa_test_runs').select('id').eq('series_id', deleteSeries);
        const ids = (doomed ?? []).map((r: { id: string }) => r.id);
        if (ids.length) await db.from('qa_test_runs').delete().eq('series_id', deleteSeries); // cascata
        result.deletedSeries = deleteSeries;
        result.deletedSeriesRuns = ids;
      }
      if (toDelete.length) {
        await db.from('qa_test_runs').delete().in('id', toDelete); // results em cascata
        result.deleted = toDelete;
      }
      if (resetRunId) {
        await db.from('qa_test_run_results').update({
          status: 'untested', comment: '', evidence: [], executed_by: null,
          executed_at: null, elapsed_seconds: 0, step_results: [],
        }).eq('run_id', resetRunId);
        const patch: Record<string, unknown> = { status: 'in_progress', closed_at: null };
        if (body.setCycle != null) patch.cycle = Number(body.setCycle);
        await db.from('qa_test_runs').update(patch).eq('id', resetRunId);
        result.reset = resetRunId;
      }
      return json(200, { ok: true, action: 'cleanup', ...result });
    }

    // ── 1) Abrir / retest ────────────────────────────────────────────────
    if (topStatus === 'new') {
      // Série existe → cria um novo ciclo (retest) clonando os casos do ciclo
      // mais recente. O pai (series_id) se mantém.
      const ser = await seriesRuns(db, parentId);
      if (ser?.runs.length) {
        const { run, seeded, clonedFrom } = await retestClone(db, ser.runs[0]);
        return json(200, { ok: true, action: 'retest', parentId: ser.seriesId, runId: run.id, cycle: run.cycle, clonedFrom, seeded });
      }
      // Sem série conhecida → cria um ciclo autorun do projeto (casos automated).
      const proj = await resolveProject(db, projectName);
      if (!proj) return json(404, { error: `Pai/projeto não encontrado (run_id="${parentId}", project="${projectName}")` });
      const { run, seeded } = await openNewCycle(db, proj);
      return json(200, { ok: true, action: 'opened', project: proj.name, parentId: run.id, runId: run.id, cycle: run.cycle, seeded });
    }

    // ── 3) Fechar ────────────────────────────────────────────────────────
    if (topStatus === 'end') {
      const ser = await seriesRuns(db, parentId);
      if (ser) {
        const closed = await closeOpenRuns(db, ser.seriesId);
        return json(200, { ok: true, action: 'closed', parentId: ser.seriesId, closedRuns: closed });
      }
      const proj = await resolveProject(db, projectName);
      if (!proj) return json(404, { error: `Pai/projeto não encontrado (run_id="${parentId}", project="${projectName}")` });
      const closed = await closeOpenRuns(db, SERIES_PREFIX + proj.id);
      return json(200, { ok: true, action: 'closed', project: proj.name, closedRuns: closed });
    }

    // ── 2) Cenário ───────────────────────────────────────────────────────
    const scenario = body?.payload?.scenario;
    if (!scenario || !scenario.name) {
      return json(400, { error: 'Mensagem desconhecida: sem status New/end e sem payload.scenario.name' });
    }

    // Alvo da gravação: o ciclo ABERTO da série indicada pelo pai (run_id);
    // senão, a run aberta (autorun) do projeto.
    let runId: string;
    let runCases: { caseId: string; title: string }[];
    let autoOpened = false;
    let projName = '';
    let resolvedParent = '';
    const ser = await seriesRuns(db, parentId);
    if (ser) {
      resolvedParent = ser.seriesId;
      const cycle = openCycleOf(ser.runs);
      if (!cycle) {
        // Série sem ciclo aberto (a automação pulou o 'New') → cria um retest.
        const { run } = await retestClone(db, ser.runs[0]);
        runId = run.id; autoOpened = true;
      } else {
        runId = cycle.id;
      }
      runCases = await loadRunCases(db, runId);  // casa SÓ com os casos do ciclo
    } else {
      const proj = await resolveProject(db, projectName);
      if (!proj) return json(404, { error: `Pai/projeto não encontrado (run_id="${parentId}", project="${projectName}")` });
      projName = proj.name;
      let run = await findOpenRun(db, proj.id);
      if (!run) { run = (await openNewCycle(db, proj)).run; autoOpened = true; }
      runId = run.id;
      const { data: cases } = await db.from('qa_test_cases')
        .select('id,title').eq('project_id', proj.id).eq('type', 'automated');
      runCases = (cases ?? []).map((c: CaseRow) => ({ caseId: c.id, title: c.title }));
    }

    // Casa o nome do cenário com os casos da run (≥ 98%, normalizado).
    const targetName = normalize(scenario.name);
    let best: { caseId: string; title: string; score: number } | null = null;
    for (const c of runCases) {
      const score = similarity(targetName, normalize(c.title));
      if (!best || score > best.score) best = { caseId: c.caseId, title: c.title, score };
    }

    if (!best || best.score < MATCH_THRESHOLD) {
      return json(200, {
        ok: true, action: 'ignored', reason: 'sem caso correspondente na run',
        scenario: scenario.name, bestMatch: best?.title ?? null,
        similarity: best ? Number(best.score.toFixed(4)) : 0,
        parentId: resolvedParent || undefined, runId, autoOpened,
      });
    }

    // Monta o patch do result.
    const ev = scenario.evidence;
    const evidence = ev?.url ? [{ name: ev.fileName ?? ev.url, url: ev.url }] : [];
    const execDate = body?.payload?.executionDate ?? body.recordedAt ?? new Date().toISOString();
    const caseStatus = mapStatus(scenario.status);

    // Marca cada PASSO do caso. A automação só conhece o resultado no nível do
    // cenário; quando o cenário PASSOU, todos os passos passaram, então marca
    // todos como 'passed' (a tela exibe os checks — 1 entrada por step, alinhado
    // por índice aos steps do caso). Em falha/bloqueio/pulado o passo culpado é
    // ambíguo, então os passos ficam 'untested' para um humano apontar qual
    // quebrou. Sem isso, step_results fica [] e os passos aparecem 'untested'
    // mesmo com o caso "Passou".
    const { data: caseRow } = await db.from('qa_test_cases')
      .select('steps').eq('id', best.caseId).limit(1);
    const steps = Array.isArray(caseRow?.[0]?.steps) ? caseRow[0].steps : [];
    const stepStatus = caseStatus === 'passed' ? 'passed' : 'untested';
    const stepResults = steps.map(() => ({ status: stepStatus, comment: '', evidence: [] }));

    const patch = {
      status: caseStatus,
      comment: scenario.comment ?? '',
      evidence,
      executed_by: 'automation',
      executed_at: execDate,
      elapsed_seconds: scenario.durationMs ? Math.round(Number(scenario.durationMs) / 1000) : 0,
      step_results: stepResults,
    };

    // Atualiza o result existente (run+caso) ou cria um se faltar.
    const { data: existing } = await db.from('qa_test_run_results')
      .select('id').eq('run_id', runId).eq('case_id', best.caseId).limit(1);
    if (existing?.length) {
      await db.from('qa_test_run_results').update(patch).eq('id', existing[0].id);
    } else {
      const { data: maxPos } = await db.from('qa_test_run_results')
        .select('position').eq('run_id', runId).order('position', { ascending: false }).limit(1);
      await db.from('qa_test_run_results').insert([{
        id: genId(), run_id: runId, case_id: best.caseId, position: ((maxPos?.[0]?.position as number) ?? -1) + 1,
        ...patch,
      }]);
    }

    return json(200, {
      ok: true, action: 'updated', project: projName || undefined,
      parentId: resolvedParent || undefined, runId,
      matchedCase: best.title, similarity: Number(best.score.toFixed(4)),
      status: patch.status, autoOpened,
    });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
