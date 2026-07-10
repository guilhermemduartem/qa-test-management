import { useState, useMemo, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { ApisLayout } from './ApisLayout';
import { loadApisConfig, fetchSharedApisConfig } from '../../lib/apisStorage';
import CodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import type { ApisConfig, ApiHost, ApiEndpoint } from '../../types/apis';
import { buildFolderTree, filterByFolder } from './folderTree';
import type { FolderNode } from './folderTree';
import {
  listBulkTemplates, saveBulkTemplate, deleteBulkTemplate,
  listBulkFolders, saveBulkFolder, deleteBulkFolderTree,
} from '../../lib/bulkTemplateStorage';
import { currentUser } from '../../lib/auth';
import { getSupabaseClient } from '../../lib/supabase';

/* ═══════════════════════════════════════════════════════════════════════════
   Suporte → Importação Massiva
   Dispara N chamadas de importação (uma por idfile) contra File/External/Import.
   - Body editável com placeholders {{var}} (inclui {{FileExternalId}} e {{token}})
   - Validação de JSON antes de permitir o envio
   - Ambiente de produção bloqueado (cadeado) — futura permissão
   - Host editável; "Forçar" injeta "Source": "ImportAnyway"
   - Modos: sequencial (um após o outro) ou paralelo (limite de 5 simultâneos)
   ═══════════════════════════════════════════════════════════════════════════ */

const CONCURRENCY = 5;

type ItemStatus = 'pending' | 'running' | 'done' | 'error';

interface ImportItem {
  uid: string;
  id: string;            // valor da iteração
  apiName: string;       // nome da API de importação
  status: ItemStatus;
  httpStatus: number;
  elapsed: number;
  request: string;       // body efetivamente enviado
  response: string;
  url: string;           // URL de destino
  envName: string;
  company: string;       // Company.Id extraído do body
  ok: boolean;
}

type ResultFilter = 'all' | 'ok' | 'error';

/** Tipo de variável do body:
 *  - `list`   → quebra de linha: cada linha é um item (driver da iteração).
 *  - `custom` → valor único fixo (igual variável de pré-condição). */
type BodyVarType = 'list' | 'custom';

interface BodyVar {
  id: string;
  name: string;
  type: BodyVarType;
  value: string;   // list: texto multilinha · custom: valor único
}

type KVPair = { key: string; value: string };

/** Regra de extração: cria uma variável a partir da resposta de uma pré-condição. */
interface ExtractRule {
  varName: string;                 // nome da variável → usada como {{varName}}
  mode: 'path' | 'script';
  path: string;                    // modo "campo": ex. data.access_token  ou  tokens[0].value
  script: string;                  // modo "script": corpo de função; recebe (response, raw); use return
}

/** Requisição de pré-condição encadeada (ex.: login). */
interface PreRequest {
  id: string;
  name: string;
  enabled: boolean;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  hostId: string;
  baseUrl: string;
  path: string;
  headers: KVPair[];
  body: string;
  extracts: ExtractRule[];
  runMode: 'once' | 'each';        // uma vez por lote  |  antes de cada chamada
}

/** Resultado da execução de uma pré-condição. */
interface PreResult {
  uid: string;
  name: string;
  status: ItemStatus;
  httpStatus: number;
  elapsed: number;
  request: string;
  response: string;
  url: string;
  ok: boolean;
  extracted: { name: string; value: string }[];
  error?: string;
}

interface PersistedState {
  envId: string;
  importRequests: PreRequest[];
  bodyVars: BodyVar[];
  mode: 'seq' | 'par';
  preRequests: PreRequest[];
  selTemplId?: string | null;
  // formato antigo (migração)
  hostId?: string;
  baseUrl?: string;
  path?: string;
  bodyTemplate?: string;
  importHeaders?: KVPair[];
  iterVarName?: string;
  idsText?: string;
  varValues?: Record<string, string>;
}

function loadState(key: string): Partial<PersistedState> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}

/* ── Templates (persistência global, não por usuário) ─────────────────────── */
export interface BulkTemplate {
  id: string;
  name: string;
  folder: string;
  envId: string;
  preRequests: PreRequest[];
  importRequests: PreRequest[];
  bodyVars: BodyVar[];
  mode: 'seq' | 'par';
}

// Leitura do localStorage antigo — usada apenas para a migração one-time p/ Supabase.
const TEMPLATES_KEY = 'bulk_templates_v1';
function loadTemplates(): BulkTemplate[] {
  try { const a = JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
const TEMPLATE_FOLDERS_KEY = 'bulk_template_folders_v1';
function loadFolders(): string[] {
  try { const a = JSON.parse(localStorage.getItem(TEMPLATE_FOLDERS_KEY) ?? '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

function envIsProd(name: string, id: string) {
  return id === 'prod' || name.toLowerCase().includes('prod');
}

function envColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('prod')) return { bg: 'rgba(255,85,85,.18)', border: '#ff5555', text: '#ff5555' };
  if (n.includes('stg') || n.includes('staging')) return { bg: 'rgba(189,147,249,.18)', border: '#bd93f9', text: '#bd93f9' };
  if (n.includes('qa')) return { bg: 'rgba(241,250,140,.18)', border: '#f1fa8c', text: '#c8a800' };
  if (n.includes('tst') || n.includes('test') || n.includes('azul')) return { bg: 'rgba(255,184,108,.18)', border: '#ffb86c', text: '#e07b00' };
  if (n.includes('dev')) return { bg: 'rgba(139,233,253,.18)', border: '#8be9fd', text: '#0097b2' };
  return { bg: 'rgba(80,250,123,.18)', border: '#50fa7b', text: '#1a8a3d' };
}

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

const METHODS: PreRequest['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHOD_COLOR: Record<string, string> = { GET: '#50fa7b', POST: '#ffb86c', PUT: '#8be9fd', PATCH: '#f1fa8c', DELETE: '#ff5555' };

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function beautify(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

/** Quebra uma URL em base (origin) e path (+query). */
function splitUrl(url: string): { base: string; path: string } {
  try { const u = new URL(url); return { base: u.origin, path: u.pathname + u.search }; }
  catch { return { base: url, path: '' }; }
}

/** Parser de comando cURL → { method, url, headers, body }. */
function parseCurl(input: string): { method: string; url: string; headers: KVPair[]; body: string } {
  const tokens: string[] = [];
  const re = /'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) tokens.push(m[1] ?? m[2] ?? m[3] ?? '');

  let method = ''; let url = ''; let body = '';
  const headers: KVPair[] = [];
  const VALUE_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode']);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'curl') continue;
    if (t === '-X' || t === '--request') { method = (tokens[++i] ?? '').toUpperCase(); }
    else if (t === '-H' || t === '--header') {
      const h = tokens[++i] ?? ''; const idx = h.indexOf(':');
      if (idx > 0) headers.push({ key: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() });
    }
    else if (VALUE_FLAGS.has(t)) { body = tokens[++i] ?? ''; }
    else if (t === '--url') { url = tokens[++i] ?? ''; }
    else if (t.startsWith('-')) { /* flag sem valor (—location, -s, -k, …) — ignora */ }
    else if (!url && /^https?:\/\//i.test(t)) { url = t; }
  }
  if (!method) method = body ? 'POST' : 'GET';
  return { method, url, headers, body };
}

function kvToRecord(pairs: KVPair[]): Record<string, string> {
  const rec: Record<string, string> = {};
  pairs.forEach(({ key, value }) => { if (key.trim()) rec[key.trim()] = value; });
  return rec;
}

/** Acessa um valor por caminho seguro (dot + [index]) — sem eval. */
function getByPath(obj: unknown, path: string): unknown {
  if (obj == null || !path.trim()) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').map((p) => p.trim()).filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Executa as regras de extração contra o corpo da resposta, gravando em `vars`. Retorna erros. */
function applyExtracts(extracts: ExtractRule[], rawText: string, vars: Record<string, string>): string[] {
  let parsed: unknown;
  try { parsed = JSON.parse(rawText); } catch { parsed = undefined; }
  const errs: string[] = [];
  for (const ex of extracts) {
    const name = ex.varName.trim();
    if (!name) continue;
    let val: unknown;
    // Segurança: o modo "script" (eval via new Function) foi REMOVIDO — templates
    // são compartilhados (Supabase) e executar JS arbitrário no navegador de quem
    // roda seria injeção de código. Só o modo "campo" (caminho seguro) é suportado.
    if (ex.mode === 'script') {
      errs.push(`${name}: extração por script foi desabilitada por segurança — use "Campo" (ex.: data.token)`);
      continue;
    }
    try {
      val = getByPath(parsed, ex.path);
    } catch (e) {
      errs.push(`${name}: ${(e as Error).message}`);
      continue;
    }
    if (val === undefined || val === null) { errs.push(`${name}: não encontrado`); continue; }
    vars[name] = typeof val === 'string' ? val : JSON.stringify(val);
  }
  return errs;
}

/** POST/GET via proxy CORS — retorna status, ok, corpo e tempo. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BG_POLL_INTERVAL_MS = 1500;
const BG_MAX_WAIT_MS = 15 * 60 * 1000; // 15 min (limite da Background Function)

async function doFetch(method: string, target: string, headers: Record<string, string>, body?: string) {
  const t0 = Date.now();
  // Dev: proxy do vite (sem limite de 30s do Lambda).
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(`/cors-proxy/${encodeURIComponent(target)}`, { method, headers, body: body || undefined });
      const text = await res.text();
      return { status: res.status, ok: res.ok, text, elapsed: Date.now() - t0 };
    } catch (err) {
      return { status: 0, ok: false, text: String(err), elapsed: Date.now() - t0 };
    }
  }
  // Prod: Background Function + polling no Supabase — sem o teto de 30s.
  return doFetchBackground(method, target, headers, body, t0);
}

async function doFetchBackground(method: string, target: string, headers: Record<string, string>, body: string | undefined, t0: number) {
  const c = getSupabaseClient();
  const user = currentUser();
  const fail = (text: string) => ({ status: 0, ok: false, text, elapsed: Date.now() - t0 });

  // Sem Supabase/sessão não dá pra rastrear o resultado: cai no proxy síncrono.
  if (!c || !user) {
    try {
      const res = await fetch(`${window.location.origin}/api/proxy/${encodeURIComponent(target)}`, { method, headers, body: body || undefined });
      const text = await res.text();
      return { status: res.status, ok: res.ok, text, elapsed: Date.now() - t0 };
    } catch (err) { return fail(String(err)); }
  }

  const jobId = (crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const cleanup = () => { void c.from('qa_bulk_proxy_results').delete().eq('id', jobId); };

  // 1) Linha pendente. Omitimos user_id de propósito: o default `auth.uid()`
  //    preenche e casa com o with_check do RLS (evita divergência com a sessão em cache).
  const ins = await c.from('qa_bulk_proxy_results').insert({ id: jobId, status: 'pending' });
  if (ins.error) return fail(`Erro ao registrar job: ${ins.error.message}`);

  // 2) Dispara a Background Function (202 imediato; ela processa em background).
  try {
    await fetch('/.netlify/functions/proxy-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, target, method, headers, body: body || undefined }),
    });
  } catch (err) { cleanup(); return fail(`Falha ao iniciar importação: ${String(err)}`); }

  // 3) Polling até a function gravar o resultado (até 15 min).
  const deadline = Date.now() + BG_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(BG_POLL_INTERVAL_MS);
    const { data, error } = await c
      .from('qa_bulk_proxy_results')
      .select('status, ok, http_status, body')
      .eq('id', jobId)
      .maybeSingle();
    if (error) continue; // erro transitório de leitura — tenta de novo
    if (data && data.status !== 'pending') {
      cleanup();
      return { status: (data.http_status as number) ?? 0, ok: !!data.ok, text: (data.body as string) ?? '', elapsed: Date.now() - t0 };
    }
  }
  cleanup();
  return fail('[Timeout: 15 min sem resposta da importação]');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Motor de execução em nível de MÓDULO (singleton por usuário).
   Sobrevive à navegação entre páginas: o componente apenas observa o estado.
   Persiste em localStorage para restaurar resultados após reload completo.
   ═══════════════════════════════════════════════════════════════════════════ */
function substituteTpl(tpl: string, iterVal: string, iteratorName: string, customVars: Record<string, string>, extra?: Record<string, string>): string {
  return tpl.replace(VAR_RE, (_full, name: string) => {
    if (extra && name in extra) return extra[name];
    if (iteratorName && name === iteratorName) return iterVal;
    return customVars[name] ?? '';
  });
}

interface RunState {
  running: boolean;
  items: ImportItem[];
  preResults: PreResult[];
  eachResults: Record<string, { count: number; last: PreResult }>;
  activeVars: Record<string, string>;
}

interface RunPlan {
  ids: string[];
  enabledImports: PreRequest[];
  preRequests: PreRequest[];
  customVars: Record<string, string>;
  iteratorName: string;
  mode: 'seq' | 'par';
  envName: string;
}

const EMPTY_RUN: RunState = { running: false, items: [], preResults: [], eachResults: {}, activeVars: {} };

class BulkRunner {
  private state: RunState;
  private listeners = new Set<() => void>();
  private stopFlag = false;
  private engineActive = false;
  private readonly key: string;

  constructor(private readonly userId: string) {
    this.key = `qar_bulk_run_${userId}`;
    this.state = this.hydrate();
  }

  private hydrate(): RunState {
    // Itens que estavam em andamento quando o motor morreu (reload) ficam marcados como interrompidos.
    const markInterrupted = (items: ImportItem[]): ImportItem[] => items.map((it) =>
      (it.status === 'running' || it.status === 'pending')
        ? { ...it, status: 'error', ok: false, response: it.response || '[Interrompido — página recarregada durante a execução]' }
        : it);
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const p = JSON.parse(raw) as RunState;
        // Após reload completo o motor não está mais ativo → running=false.
        return { ...EMPTY_RUN, ...p, items: markInterrupted(p.items ?? []), running: false };
      }
    } catch { /**/ }
    // Migração do histórico antigo (somente itens).
    try {
      const old = localStorage.getItem(`qar_bulk_import_hist_${this.userId}`);
      if (old) { const items = JSON.parse(old); if (Array.isArray(items)) return { ...EMPTY_RUN, items }; }
    } catch { /**/ }
    return { ...EMPTY_RUN };
  }

  getSnapshot = (): RunState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };

  private emit() { for (const l of this.listeners) l(); }
  // Escrita no localStorage com throttle (evita O(n²) e estouro de quota em lotes grandes).
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistNow() {
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch { /**/ }
  }
  private persistThrottled() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persistNow(); }, 800);
  }
  private set(patch: Partial<RunState>) { this.state = { ...this.state, ...patch }; this.persistThrottled(); this.emit(); }
  private patchItems(fn: (items: ImportItem[]) => ImportItem[]) { this.state = { ...this.state, items: fn(this.state.items) }; this.persistThrottled(); this.emit(); }

  get isRunning() { return this.engineActive; }

  clear() {
    if (this.engineActive) return;
    this.state = { ...EMPTY_RUN };
    this.persistNow();
    this.emit();
  }

  stop() { this.stopFlag = true; }

  async start(plan: RunPlan) {
    if (this.engineActive) return;
    this.engineActive = true;
    this.stopFlag = false;
    this.set({ running: true, preResults: [], eachResults: {}, activeVars: {}, items: [] });

    const { ids, enabledImports, preRequests, customVars, iteratorName, mode, envName } = plan;
    const sub = (tpl: string, iterVal: string, extra?: Record<string, string>) =>
      substituteTpl(tpl, iterVal, iteratorName, customVars, extra);
    const companyOf = (imp: PreRequest) => {
      try { const o = JSON.parse(sub(imp.body, '__preview__')); return o?.Company?.Id != null ? String(o.Company.Id) : ''; } catch { return ''; }
    };

    const runPre = async (pre: PreRequest, vars: Record<string, string>, fileId: string): Promise<PreResult> => {
      const base = pre.baseUrl.replace(/\/$/, '');
      const target = (base.match(/^https?:\/\//) ? base : base ? `https://${base}` : '') + pre.path;
      const body = pre.body.trim() ? sub(pre.body, fileId, vars) : '';
      const headers = kvToRecord(pre.headers.map((h) => ({ key: h.key, value: sub(h.value, fileId, vars) })));
      if (body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      const res = await doFetch(pre.method, target, headers, body || undefined);
      const errs = res.ok ? applyExtracts(pre.extracts, res.text, vars) : [];
      const extracted = pre.extracts.filter((e) => e.varName.trim()).map((e) => ({ name: e.varName.trim(), value: vars[e.varName.trim()] ?? '—' }));
      const error = !res.ok ? `HTTP ${res.status || 'ERR'}` : (errs.length ? errs.join(' · ') : undefined);
      return {
        uid: pre.id, name: pre.name || '(sem nome)', status: res.ok && !errs.length ? 'done' : 'error',
        httpStatus: res.status, ok: res.ok && !errs.length, elapsed: res.elapsed,
        request: body || `(${pre.method} sem corpo)`, response: res.text, url: target, extracted, error,
      };
    };

    const execImportReq = async (uid: string, imp: PreRequest, iterVal: string, vars: Record<string, string>) => {
      const t0 = Date.now();
      let body = ''; let target = '';
      try {
        body = JSON.stringify(JSON.parse(sub(imp.body, iterVal, vars)));
        const base = imp.baseUrl.replace(/\/$/, '');
        target = (base.match(/^https?:\/\//) ? base : `https://${base}`) + imp.path;
      } catch { /* validado por canRun */ }
      this.patchItems((prev) => prev.map((it) => it.uid === uid ? { ...it, status: 'running', request: body, url: target } : it));
      const headers = { 'Content-Type': 'application/json', ...kvToRecord(imp.headers.map((h) => ({ key: h.key, value: sub(h.value, iterVal, vars) }))) };
      const res = await doFetch(imp.method, target, headers, body || undefined);
      this.patchItems((prev) => prev.map((it) => it.uid === uid ? {
        ...it, status: res.ok ? 'done' : 'error', httpStatus: res.status, ok: res.ok, elapsed: Date.now() - t0, response: res.text,
      } : it));
    };

    const baseVars: Record<string, string> = { ...customVars };

    // 1) Pré-condições "uma vez por lote"
    const oncePres = preRequests.filter((p) => p.enabled && p.runMode === 'once');
    const log: PreResult[] = [];
    for (const pre of oncePres) {
      if (this.stopFlag) break;
      const r = await runPre(pre, baseVars, '');
      log.push(r);
      this.set({ preResults: [...log] });
      if (!r.ok) { this.stopFlag = true; break; }
    }
    this.set({ activeVars: { ...baseVars } });
    if (this.stopFlag) { this.set({ running: false }); this.engineActive = false; this.persistNow(); return; }

    // 2) Itens = cada valor × cada API de import
    this.set({ items: ids.flatMap((val, vi) => enabledImports.map((imp, ii) => ({
      uid: `${vi}_${ii}`, id: val, apiName: imp.name || '(sem nome)', status: 'pending' as ItemStatus,
      httpStatus: 0, elapsed: 0, request: '', response: '', url: '', envName, company: companyOf(imp), ok: false,
    }))) });

    const eachPres = preRequests.filter((p) => p.enabled && p.runMode === 'each');

    const runJob = async (val: string, vi: number) => {
      const itemVars = { ...baseVars };
      for (const pre of eachPres) {
        if (this.stopFlag) return;
        const r = await runPre(pre, itemVars, val);
        this.set({ eachResults: { ...this.state.eachResults, [pre.id]: { count: (this.state.eachResults[pre.id]?.count ?? 0) + 1, last: r } } });
        if (!r.ok) {
          this.patchItems((prev) => prev.map((it) => (it.id === val && it.uid.startsWith(`${vi}_`)) ? {
            ...it, status: 'error', httpStatus: r.httpStatus, ok: false, elapsed: r.elapsed,
            request: r.request, url: r.url, response: `[Pré-condição "${r.name}" falhou: ${r.error ?? 'erro'}]\n\n${r.response}`,
          } : it));
          return;
        }
      }
      for (let ii = 0; ii < enabledImports.length; ii++) {
        if (this.stopFlag) return;
        await execImportReq(`${vi}_${ii}`, enabledImports[ii], val, itemVars);
      }
    };

    if (mode === 'seq') {
      for (let vi = 0; vi < ids.length; vi++) {
        if (this.stopFlag) break;
        await runJob(ids[vi], vi);
      }
    } else {
      let next = 0;
      const worker = async () => {
        while (next < ids.length && !this.stopFlag) {
          const vi = next++;
          await runJob(ids[vi], vi);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()));
    }
    this.set({ running: false });
    this.engineActive = false;
    this.persistNow();
  }
}

const bulkRunners = new Map<string, BulkRunner>();
function getBulkRunner(userId: string): BulkRunner {
  let r = bulkRunners.get(userId);
  if (!r) { r = new BulkRunner(userId); bulkRunners.set(userId, r); }
  return r;
}

function emptyPre(): PreRequest {
  return {
    id: genId(), name: '', enabled: true, method: 'POST', hostId: '', baseUrl: '', path: '',
    headers: [], body: '', runMode: 'once',
    extracts: [{ varName: '', mode: 'path', path: '', script: '' }],
  };
}

function emptyImport(): PreRequest {
  return {
    id: genId(), name: '', enabled: true, method: 'POST', hostId: '', baseUrl: '', path: '',
    headers: [], body: '', runMode: 'once', extracts: [],
  };
}

/* ── Card de uma pré-condição (controlado) ─────────────────────────────── */
function PreRequestCard({ pre, index, total, open, running, result, labelStyle, envId, envName, hosts, variant = 'pre', bodyVarsSlot, onToggle, onUpdate, onRemove, onMove }: {
  pre: PreRequest;
  index: number;
  total: number;
  open: boolean;
  running: boolean;
  result?: PreResult;
  labelStyle: React.CSSProperties;
  envId: string;
  envName: string;
  hosts: ApiHost[];
  variant?: 'pre' | 'import';
  bodyVarsSlot?: React.ReactNode;
  onToggle: () => void;
  onUpdate: (patch: Partial<PreRequest>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const isImport = variant === 'import';
  const [curlOpen, setCurlOpen] = useState(false);
  const setExtract = (i: number, patch: Partial<ExtractRule>) =>
    onUpdate({ extracts: pre.extracts.map((e, j) => j === i ? { ...e, ...patch } : e) });
  const addExtract = () => onUpdate({ extracts: [...pre.extracts, { varName: '', mode: 'path', path: '', script: '' }] });
  const removeExtract = (i: number) => onUpdate({ extracts: pre.extracts.filter((_, j) => j !== i) });
  const setHeader = (i: number, patch: Partial<KVPair>) =>
    onUpdate({ headers: pre.headers.map((h, j) => j === i ? { ...h, ...patch } : h) });

  const onSelectHost = (hid: string) => {
    const h = hosts.find((x) => x.id === hid);
    onUpdate({ hostId: hid, baseUrl: h ? (h.envUrls[envId] ?? '').replace(/\/$/, '') : pre.baseUrl });
  };
  const applyCurl = (text: string) => {
    const p = parseCurl(text);
    const { base, path } = splitUrl(p.url);
    onUpdate({
      method: (p.method as PreRequest['method']) || pre.method,
      hostId: '', baseUrl: base || pre.baseUrl, path: base ? path : pre.path,
      headers: p.headers.length ? p.headers : pre.headers,
      body: p.body ? beautify(p.body) : pre.body,
    });
    setCurlOpen(false);
  };

  const dot = result ? (result.status === 'done' ? '#50fa7b' : '#ff5555') : (pre.enabled ? 'var(--divider)' : 'var(--text-muted)');

  return (
    <div style={{ border: '1px solid var(--divider)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)', opacity: pre.enabled ? 1 : 0.6 }}>
      {/* Header — clicar abre/fecha */}
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'var(--surface-alt)', cursor: 'pointer' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--text-muted)' }}><path d="M9 18l6-6-6-6" /></svg>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={pre.enabled} disabled={running} onChange={(e) => onUpdate({ enabled: e.target.checked })} /> Ativa
        </label>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: pre.name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {pre.name || (isImport ? 'Importação' : 'Login')}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }} disabled={running}
          onClick={(e) => { e.stopPropagation(); setCurlOpen((v) => !v); if (!open) onToggle(); }}>cURL</button>
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px', lineHeight: 1, opacity: index === 0 ? .3 : 1 }} disabled={running || index === 0} onClick={() => onMove(-1)} title="Subir">▲</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px', lineHeight: 1, opacity: index === total - 1 ? .3 : 1 }} disabled={running || index === total - 1} onClick={() => onMove(1)} title="Descer">▼</button>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} disabled={running} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', color: '#ff5555', flexShrink: 0 }} title="Remover">✕</button>
      </div>

      {/* Erro da pré-condição (sem variáveis extraídas) */}
      {result && result.error && (
        <div style={{ padding: '5px 12px', borderTop: '1px solid var(--divider)', fontSize: 11, color: '#ff5555' }}>
          ⚠ {result.error}
        </div>
      )}

      {/* Corpo expandido */}
      {open && (
        <div style={{ padding: 12, borderTop: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Nome editável */}
          <input className="input" style={{ width: '100%', fontSize: 13, fontWeight: 600 }}
            value={pre.name} disabled={running} placeholder={isImport ? 'Nome (ex.: Importação)' : 'Nome (ex.: Login)'}
            onChange={(e) => onUpdate({ name: e.target.value })} />

          {/* runMode toggle — apenas pré-condições */}
          {!isImport && (
            <div style={{ display: 'flex', border: '1px solid var(--divider)', borderRadius: 6, overflow: 'hidden', alignSelf: 'flex-start' }}>
              {(['once', 'each'] as const).map((rm) => (
                <button key={rm} type="button" disabled={running} onClick={() => onUpdate({ runMode: rm })}
                  title={rm === 'once' ? 'Roda uma vez por lote' : 'Roda antes de cada chamada'}
                  style={{ fontSize: 10, fontWeight: 600, padding: '5px 9px', border: 'none', cursor: 'pointer',
                    background: pre.runMode === rm ? 'var(--accent)' : 'transparent', color: pre.runMode === rm ? '#fff' : 'var(--text-muted)' }}>
                  {rm === 'once' ? 'Uma vez' : 'A cada'}
                </button>
              ))}
            </div>
          )}

          {curlOpen && (
            <textarea autoFocus className="input" style={{ width: '100%', minHeight: 70, fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
              placeholder="Cole o comando cURL aqui — aplica automaticamente"
              disabled={running}
              onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/curl/i.test(t)) { e.preventDefault(); applyCurl(t); } }}
              onChange={(e) => { if (/curl\s/i.test(e.target.value)) applyCurl(e.target.value); }} />
          )}

          {/* Linha method + host + base */}
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="input" style={{ width: 80, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: METHOD_COLOR[pre.method], flexShrink: 0 }}
              value={pre.method} disabled={running} onChange={(e) => onUpdate({ method: e.target.value as PreRequest['method'] })}>
              {METHODS.map((m) => <option key={m} value={m} style={{ color: METHOD_COLOR[m] }}>{m}</option>)}
            </select>
            <select className="input" style={{ width: 120, fontSize: 11, flexShrink: 0 }} value={pre.hostId} disabled={running} onChange={(e) => onSelectHost(e.target.value)}>
              <option value="">Host…</option>
              {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <input className="input" style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12 }}
              value={pre.baseUrl} disabled={running} placeholder="https://sell-api.qapolarisk8.miketec.com.br"
              onChange={(e) => onUpdate({ baseUrl: e.target.value, hostId: '' })} />
          </div>
          <input className="input" style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            value={pre.path} disabled={running} placeholder="/Auth/Login" onChange={(e) => onUpdate({ path: e.target.value })} />

          {/* Headers */}
          <div>
            <label style={labelStyle}>Headers</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pre.headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input className="input" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} placeholder="Chave" value={h.key} disabled={running} onChange={(e) => setHeader(i, { key: e.target.value })} />
                  <input className="input" style={{ flex: 2, fontSize: 12, fontFamily: 'monospace' }} placeholder="Valor ({{var}} permitido)" value={h.value} disabled={running} onChange={(e) => setHeader(i, { value: e.target.value })} />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 8px' }} disabled={running} onClick={() => onUpdate({ headers: pre.headers.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, alignSelf: 'flex-start' }} disabled={running} onClick={() => onUpdate({ headers: [...pre.headers, { key: '', value: '' }] })}>+ Header</button>
            </div>
          </div>

          {/* Body */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, margin: 0 }}>Body</label>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} disabled={running || !pre.body.trim()} onClick={() => onUpdate({ body: beautify(pre.body) })}>Formatar JSON</button>
            </div>
            <div style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden', background: '#1e1e2e' }}>
              <CodeEditor value={pre.body} onValueChange={(v) => onUpdate({ body: v })} disabled={running}
                highlight={(c) => c ? Prism.highlight(c, Prism.languages.json, 'json') : ''} padding={10}
                placeholder='{ "email": "...", "senha": "..." }'
                style={{ fontFamily: '"Fira Code", monospace', fontSize: 12, lineHeight: 1.6, minHeight: 70, background: 'transparent', color: '#cdd6f4' }} />
            </div>
          </div>

          {/* Variáveis (injetadas pelo pai — só no import) */}
          {bodyVarsSlot}

          {/* Extrações (só pré-condição) */}
          {!isImport && (
          <div>
            <label style={labelStyle}>Extrair variáveis da resposta</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pre.extracts.map((ex, i) => (
                <div key={i} style={{ border: '1px solid var(--divider)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#bd93f9', flexShrink: 0 }}>{`{{${ex.varName || 'nome'}}}`}</span>
                    <input className="input" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} placeholder="nome da variável" value={ex.varName} disabled={running} onChange={(e) => setExtract(i, { varName: e.target.value })} />
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 5, background: 'var(--surface-alt)', color: 'var(--text-muted)', border: '1px solid var(--divider)', flexShrink: 0 }}>Campo</span>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 8px', color: '#ff5555' }} disabled={running} onClick={() => removeExtract(i)}>✕</button>
                  </div>
                  <input className="input" style={{ width: '100%', fontSize: 12, fontFamily: 'monospace' }} placeholder="caminho — ex.: data.access_token  ou  tokens[0].value" value={ex.path} disabled={running} onChange={(e) => setExtract(i, { mode: 'path', path: e.target.value })} />
                  {ex.mode === 'script' && (
                    <span style={{ fontSize: 10.5, color: '#ff5555' }}>⚠ Extração por script foi desabilitada por segurança. Preencha o caminho acima (ex.: <code>data.token</code>).</span>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, alignSelf: 'flex-start' }} disabled={running} onClick={addExtract}>+ Variável</button>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              <strong>Campo</strong>: caminho seguro no JSON, sem código (ex.: <code>data.access_token</code> ou <code>tokens[0].value</code>).
              Headers só repassam <code>Authorization</code> e <code>Content-Type</code> pelo proxy.
            </p>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Nó de pasta na árvore de templates (sem "Todas"/"Sem pasta") ── */
function TplFolderNode({ node, depth, selected, onSelect, onDelete }: {
  node: FolderNode; depth: number; selected: string;
  onSelect: (p: string) => void; onDelete?: (p: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isActive = selected === node.fullPath;
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div className={`casos-tree-item${isActive ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        {hasChildren ? (
          <button className={`casos-tree-toggle${open ? ' open' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label={open ? 'Recolher' : 'Expandir'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        ) : <span className="casos-tree-toggle-spacer" />}
        <button className="casos-tree-label" onClick={() => onSelect(node.fullPath)}>
          <span style={{ flexShrink: 0, marginRight: 4, color: 'var(--text-muted)', display: 'flex' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </span>
          <span className="casos-tree-label-text">{node.segment}</span>
          <span className="casos-count">{node.totalCount}</span>
        </button>
        {onDelete && (
          <button className="casos-tree-del" onClick={(e) => { e.stopPropagation(); onDelete(node.fullPath); }} title="Excluir pasta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        )}
      </div>
      {open && node.children.map((c) => (
        <TplFolderNode key={c.fullPath} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} onDelete={onDelete} />
      ))}
    </div>
  );
}

export function BulkImportPage({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [config, setConfig] = useState<ApisConfig>(() => loadApisConfig());

  // Carrega a config COMPARTILHADA (mesma para todos os usuários).
  useEffect(() => {
    let cancelled = false;
    fetchSharedApisConfig().then((remote) => {
      if (!cancelled && remote) setConfig(remote);
    });
    return () => { cancelled = true; };
  }, []);
  // Chaves de persistência por usuário (sessão não é compartilhada)
  const userId = currentUser()?.id ?? 'anon';
  const storeKey = `qar_bulk_import_${userId}`;
  const saved = useRef(loadState(storeKey)).current;

  // Primeiro ambiente não-prod como padrão
  const firstUsableEnv = config.environments.find((e) => !envIsProd(e.name, e.id)) ?? config.environments[0];

  const [envId, setEnvId] = useState(saved.envId ?? firstUsableEnv?.id ?? '');
  const [importRequests, setImportRequests] = useState<PreRequest[]>(() => {
    if (saved.importRequests?.length) return saved.importRequests;
    return [];
  });
  const [bodyVars, setBodyVars] = useState<BodyVar[]>(() => {
    if (saved.bodyVars?.length) return saved.bodyVars;
    const migrated: BodyVar[] = [];
    if (saved.iterVarName || saved.idsText) migrated.push({ id: genId(), name: saved.iterVarName || 'FileExternalId', type: 'list', value: saved.idsText ?? '' });
    if (saved.varValues) for (const [k, v] of Object.entries(saved.varValues)) migrated.push({ id: genId(), name: k, type: 'custom', value: v });
    return migrated.length ? migrated : [{ id: genId(), name: 'FileExternalId', type: 'list', value: '' }];
  });
  const [mode, setMode] = useState<'seq' | 'par'>(saved.mode ?? 'seq');
  const [preRequests, setPreRequests] = useState<PreRequest[]>(saved.preRequests ?? []);
  const [expandedPre, setExpandedPre] = useState<Record<string, boolean>>({});
  const [expandedImport, setExpandedImport] = useState<Record<string, boolean>>({});
  const [varsDrawerOpen, setVarsDrawerOpen] = useState(false);

  // ── Estado de execução: vive no runner singleton (sobrevive à navegação) ──
  const runner = useMemo(() => getBulkRunner(userId), [userId]);
  const runState = useSyncExternalStore(runner.subscribe, runner.getSnapshot);
  const { running, items, preResults, eachResults, activeVars } = runState;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [reqOpen, setReqOpen] = useState<Record<string, boolean>>({});  // request colapsável (fechado por padrão)
  const [resOpen, setResOpen] = useState<Record<string, boolean>>({});  // response colapsável (aberto por padrão)
  const [filter, setFilter] = useState<ResultFilter>('all');

  // ── Templates (fonte: Supabase; carregados no mount) ──
  const [templates, setTemplates] = useState<BulkTemplate[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selTemplId, setSelTemplId] = useState<string | null>(saved.selTemplId ?? null);
  const [tplFolder, setTplFolder] = useState<'all' | 'none' | string>('all');
  const [folders, setFolders] = useState<string[]>([]);
  const [folderModal, setFolderModal] = useState<{ open: boolean; name: string; parent: string }>({ open: false, name: '', parent: '' });
  const [saveModal, setSaveModal] = useState<{ open: boolean; name: string; folder: string; editingId: string | null }>({ open: false, name: '', folder: '', editingId: null });
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; message: string; confirmLabel: string; danger: boolean; onConfirm: () => void } | null>(null);

  // Ref sempre atualizado com o estado atual do formulário — evita closure stale no handleSaveButton
  const formRef = useRef({ selTemplId: null as string | null, envId, preRequests, importRequests, bodyVars, mode });
  useEffect(() => { formRef.current = { selTemplId, envId, preRequests, importRequests, bodyVars, mode }; },
    [selTemplId, envId, preRequests, importRequests, bodyVars, mode]);
  const templatesRef = useRef(templates);
  useEffect(() => { templatesRef.current = templates; }, [templates]);
  const foldersRef = useRef(folders);
  useEffect(() => { foldersRef.current = folders; }, [folders]);

  // ── Carrega templates/pastas do Supabase no mount (+ migração one-time do localStorage) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingData(true);
      let [remote, remoteFolders] = await Promise.all([listBulkTemplates(), listBulkFolders()]);
      // Migração: se o backend está vazio mas há dados locais antigos, sobe-os.
      const localT = loadTemplates();
      const localF = loadFolders();
      if (remote.length === 0 && localT.length > 0) {
        await Promise.all(localT.map(saveBulkTemplate));
        remote = localT;
      }
      if (remoteFolders.length === 0 && localF.length > 0) {
        await Promise.all(localF.map(saveBulkFolder));
        remoteFolders = localF;
      }
      if (!alive) return;
      setTemplates(remote);
      setFolders(remoteFolders);
      // Limpa vínculo se o template selecionado não existir mais.
      setSelTemplId((cur) => (cur && remote.some((t) => t.id === cur) ? cur : null));
      setLoadingData(false);
    })();
    return () => { alive = false; };
  }, []);

  // ── Persistência do rascunho do formulário (por usuário, local) ──
  useEffect(() => {
    const state: PersistedState = { envId, importRequests, bodyVars, mode, preRequests, selTemplId };
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch { /**/ }
  }, [storeKey, envId, importRequests, bodyVars, mode, preRequests, selTemplId]);

  const deleteHistory = useCallback(() => {
    runner.clear();
    setExpanded({}); setReqOpen({}); setResOpen({}); setFilter('all');
  }, [runner]);

  // ── CRUD das pré-condições ──
  const addPre = useCallback(() => {
    const pre = emptyPre();
    setPreRequests((p) => [...p, pre]);
    setExpandedPre((p) => ({ ...p, [pre.id]: true }));
  }, []);
  const updatePre = useCallback((id: string, patch: Partial<PreRequest>) => {
    setPreRequests((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
  }, []);
  const removePre = useCallback((id: string) => {
    setPreRequests((p) => p.filter((x) => x.id !== id));
  }, []);
  const movePre = useCallback((id: string, dir: -1 | 1) => {
    setPreRequests((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const selEnv = config.environments.find((e) => e.id === envId);
  const prodLocked = selEnv ? envIsProd(selEnv.name, selEnv.id) : false;
  const eColor = selEnv ? envColor(selEnv.name) : { bg: 'var(--surface-alt)', border: 'var(--divider)', text: 'var(--text-muted)' };

  // ── Troca de ambiente: re-deriva a base URL de imports e pré-condições com host ──
  const changeEnv = useCallback((newEnvId: string) => {
    setEnvId(newEnvId);
    const reHost = (list: PreRequest[]) => list.map((p) => {
      if (!p.hostId) return p;
      const host = config.hosts.find((h) => h.id === p.hostId);
      return host ? { ...p, baseUrl: (host.envUrls[newEnvId] ?? '').replace(/\/$/, '') } : p;
    });
    setPreRequests(reHost);
    setImportRequests(reHost);
  }, [config.hosts]);

  // ── CRUD das APIs de importação ──
  const addImport = useCallback(() => {
    const imp = emptyImport();
    setImportRequests((p) => [...p, imp]);
    setExpandedImport((p) => ({ ...p, [imp.id]: true }));
  }, []);
  const updateImport = useCallback((id: string, patch: Partial<PreRequest>) => {
    setImportRequests((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
  }, []);
  const removeImport = useCallback((id: string) => {
    setImportRequests((p) => p.filter((x) => x.id !== id));
  }, []);
  const moveImport = useCallback((id: string, dir: -1 | 1) => {
    setImportRequests((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  // ── Variável que dirige a iteração (primeira do tipo "list" com nome) ──
  // ── Folders de templates (explícitas + derivadas dos templates) ──
  const tplAsEp = useMemo(() => templates as unknown as ApiEndpoint[], [templates]);
  const tplFolderRoots = useMemo(() => buildFolderTree(tplAsEp, folders), [tplAsEp, folders]);
  const tplFolders = useMemo(() => {
    const set = new Set<string>(folders);
    templates.forEach((t) => { if (t.folder) set.add(t.folder); });
    return Array.from(set).sort();
  }, [templates, folders]);

  const visibleTemplates = useMemo(() => {
    const filtered = filterByFolder(tplAsEp, tplFolder) as unknown as BulkTemplate[];
    return filtered;
  }, [tplAsEp, tplFolder]);

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === selTemplId) ?? null, [templates, selTemplId]);

  const iteratorVar = useMemo(() => bodyVars.find((v) => v.type === 'list' && v.name.trim()), [bodyVars]);
  const iteratorName = iteratorVar?.name.trim() ?? '';

  // ── Mapa das variáveis "custom" (valor único) ──
  const customVars = useMemo(() => {
    const rec: Record<string, string> = {};
    bodyVars.forEach((v) => { if (v.type === 'custom' && v.name.trim()) rec[v.name.trim()] = v.value; });
    return rec;
  }, [bodyVars]);

  // ── ids (itens da iteração — uma linha por item). Sem lista/linhas → 1 chamada. ──
  const ids = useMemo(() => {
    if (!iteratorVar) return [''];
    const lines = iteratorVar.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return lines.length ? lines : [''];
  }, [iteratorVar]);

  // ── APIs de importação ativas ──
  const enabledImports = useMemo(() => importRequests.filter((p) => p.enabled), [importRequests]);

  // ── Todos os nomes de variáveis (definidos + referenciados {{}} + extraídos) ──
  const allVarNames = useMemo(() => {
    const set = new Set<string>();
    const scan = (s: string) => { if (!s) return; let m: RegExpExecArray | null; VAR_RE.lastIndex = 0; while ((m = VAR_RE.exec(s)) !== null) set.add(m[1]); };
    bodyVars.forEach((v) => { if (v.name.trim()) set.add(v.name.trim()); });
    importRequests.forEach((imp) => { scan(imp.body); scan(imp.path); imp.headers.forEach((h) => scan(h.value)); });
    preRequests.forEach((pre) => { scan(pre.body); scan(pre.path); pre.headers.forEach((h) => scan(h.value)); pre.extracts.forEach((e) => { if (e.varName.trim()) set.add(e.varName.trim()); }); });
    return Array.from(set);
  }, [bodyVars, importRequests, preRequests]);

  // Define/atualiza o valor de uma variável "custom" pelo nome (cria se não existir)
  const setVarValueByName = useCallback((name: string, value: string) => {
    setBodyVars((p) => {
      const i = p.findIndex((x) => x.name.trim() === name);
      if (i >= 0) return p.map((x, j) => j === i ? { ...x, value } : x);
      return [...p, { id: genId(), name, type: 'custom', value }];
    });
  }, []);

  // ── Company.Id de um import (preview) ──
  // ── Validação por import (JSON + URL) ──
  const importValidation = useMemo(() => {
    // Para validar apenas a ESTRUTURA do JSON, todo {{placeholder}} vira `0`
    // (válido dentro ou fora de aspas) — assim {{company}} usado como inteiro não quebra.
    const previewBody = (tpl: string) => tpl.replace(VAR_RE, '0');
    const map: Record<string, { jsonError: string | null; urlInvalid: boolean }> = {};
    importRequests.forEach((imp) => {
      let jsonError: string | null = null;
      try { if (imp.body.trim()) JSON.parse(previewBody(imp.body)); } catch (e) { jsonError = (e as Error).message; }
      const base = imp.baseUrl.replace(/\/$/, '');
      const url = (base.match(/^https?:\/\//) ? base : base ? `https://${base}` : '') + imp.path;
      map[imp.id] = { jsonError, urlInvalid: !url.startsWith('http') };
    });
    return map;
  }, [importRequests]);

  const importsValid = enabledImports.length > 0 && enabledImports.every((imp) => {
    const v = importValidation[imp.id];
    return v && !v.jsonError && !v.urlInvalid;
  });

  const canRun = ids.length > 0 && importsValid && !prodLocked && !running;

  // ── Dispara a execução no runner singleton (sobrevive à navegação). ──
  const run = useCallback(() => {
    if (!canRun) return;
    setExpanded({});
    setFilter('all');
    void runner.start({
      ids, enabledImports, preRequests, customVars, iteratorName, mode, envName: selEnv?.name ?? '',
    });
  }, [canRun, runner, ids, enabledImports, preRequests, customVars, iteratorName, mode, selEnv]);

  const stop = useCallback(() => { runner.stop(); }, [runner]);

  // ── Funções de template (persistem no Supabase) ──
  // Cria novo (chamado apenas pelo modal)
  const doSaveTemplate = useCallback(async () => {
    const { envId: eid, preRequests: pr, importRequests: ir, bodyVars: bv, mode: m } = formRef.current;
    const tpl: BulkTemplate = {
      id: genId(), name: saveModal.name.trim() || 'Template', folder: saveModal.folder.trim(),
      envId: eid, preRequests: pr, importRequests: ir, bodyVars: bv, mode: m,
    };
    setSaveModal({ open: false, name: '', folder: '', editingId: null });
    const ok = await saveBulkTemplate(tpl);
    if (!ok) return;
    setTemplates((prev) => [...prev, tpl]);
    setSelTemplId(tpl.id);
  }, [saveModal]);

  // Atualiza existente OU abre modal para criar novo — lê sempre do ref (zero stale closure)
  const handleSaveButton = useCallback(() => {
    const { selTemplId: sid } = formRef.current;
    if (!sid) {
      setSaveModal({ open: true, name: '', folder: '', editingId: null });
      return;
    }
    const tpl = templatesRef.current.find((t) => t.id === sid);
    setConfirmDlg({
      title: 'Salvar template',
      message: `Salvar alterações em "${tpl?.name ?? 'template'}"?`,
      confirmLabel: 'Salvar', danger: false,
      onConfirm: () => {
        const { envId: eid, preRequests: pr, importRequests: ir, bodyVars: bv, mode: m } = formRef.current;
        const base = templatesRef.current.find((t) => t.id === sid);
        if (!base) return;
        const updated: BulkTemplate = { ...base, envId: eid, preRequests: pr, importRequests: ir, bodyVars: bv, mode: m };
        void saveBulkTemplate(updated).then((ok) => {
          if (ok) setTemplates((prev) => prev.map((t) => t.id === sid ? updated : t));
        });
      },
    });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    const tpl = templatesRef.current.find((t) => t.id === id);
    setConfirmDlg({
      title: 'Excluir template',
      message: `Excluir "${tpl?.name ?? 'template'}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir', danger: true,
      onConfirm: () => {
        void deleteBulkTemplate(id).then((ok) => {
          if (!ok) return;
          setTemplates((prev) => prev.filter((t) => t.id !== id));
          setSelTemplId((cur) => (cur === id ? null : cur));
        });
      },
    });
  }, []);

  // ── Cria pasta explícita (raiz ou dentro de um pai) ──
  const createFolder = useCallback(async () => {
    const name = folderModal.name.trim().replace(/\//g, '');
    if (!name) return;
    const path = folderModal.parent ? `${folderModal.parent}/${name}` : name;
    setFolderModal({ open: false, name: '', parent: '' });
    if (foldersRef.current.includes(path)) { setTplFolder(path); return; }
    const ok = await saveBulkFolder(path);
    if (!ok) return;
    setFolders((prev) => prev.includes(path) ? prev : [...prev, path].sort());
    setTplFolder(path);
  }, [folderModal]);

  const deleteFolder = useCallback((folderPath: string) => {
    const inFolder = (f: string) => f === folderPath || f.startsWith(folderPath + '/');
    const affected = templatesRef.current.filter((t) => inFolder(t.folder));
    setConfirmDlg({
      title: 'Excluir pasta',
      message: affected.length
        ? `Excluir a pasta "${folderPath}"? ${affected.length} template(s) ${affected.length === 1 ? 'será movido' : 'serão movidos'} para a raiz.`
        : `Excluir a pasta "${folderPath}"?`,
      confirmLabel: 'Excluir pasta', danger: true,
      onConfirm: () => {
        void (async () => {
          // Move templates da pasta (e subpastas) para a raiz no backend.
          await Promise.all(affected.map((t) => saveBulkTemplate({ ...t, folder: '' })));
          const ok = await deleteBulkFolderTree(folderPath);
          if (!ok) return;
          setTemplates((prev) => prev.map((t) => inFolder(t.folder) ? { ...t, folder: '' } : t));
          setFolders((prev) => prev.filter((f) => !inFolder(f)));
          setTplFolder((cur) => (typeof cur === 'string' && inFolder(cur)) ? 'all' : cur);
        })();
      },
    });
  }, []);

  const loadTemplate = useCallback((tpl: BulkTemplate) => {
    setEnvId(tpl.envId);
    setPreRequests(tpl.preRequests);
    setImportRequests(tpl.importRequests);
    setBodyVars(tpl.bodyVars);
    setMode(tpl.mode);
    setSelTemplId(tpl.id);
    runner.clear();
  }, [runner]);

  // ── Sumário ──
  const summary = useMemo(() => {
    const done = items.filter((i) => i.status === 'done').length;
    const error = items.filter((i) => i.status === 'error').length;
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'running').length;
    const totalMs = items.reduce((acc, i) => acc + i.elapsed, 0);
    return { done, error, pending, totalMs };
  }, [items]);

  const labelStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '.5px' };

  const filteredItems = useMemo(() => {
    if (filter === 'ok') return items.filter((i) => i.status === 'done');
    if (filter === 'error') return items.filter((i) => i.status === 'error');
    return items;
  }, [items, filter]);

  const prettyJson = (s: string) => {
    if (!s) return '';
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  };
  const hl = (s: string) => {
    const p = prettyJson(s);
    try { return Prism.highlight(p, Prism.languages.json, 'json'); } catch { return p.replace(/</g, '&lt;'); }
  };

  // Editor de variáveis (renderizado DENTRO do card da 1ª API de importação)
  const variablesEditor = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ ...labelStyle, margin: 0 }}>Variáveis</label>
        <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} disabled={running}
          onClick={() => setBodyVars((p) => [...p, { id: genId(), name: '', type: 'custom', value: '' }])}>+ Variável</button>
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
        Usadas como <code>{'{{nome}}'}</code> aqui, nas outras APIs e nas pré-condições (compartilhadas).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bodyVars.map((bv) => {
          const isIterator = bv.id === iteratorVar?.id;
          const count = bv.type === 'list' ? bv.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length : 0;
          return (
            <div key={bv.id} style={{ border: `1px solid ${isIterator ? 'var(--accent)' : 'var(--divider)'}`, borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#bd93f9', flexShrink: 0 }}>{`{{${bv.name || 'nome'}}}`}</span>
                <input className="input" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} placeholder="nome" value={bv.name} disabled={running}
                  onChange={(e) => setBodyVars((p) => p.map((x) => x.id === bv.id ? { ...x, name: e.target.value.trim() } : x))} />
                <select className="input" style={{ width: 168, fontSize: 11, flexShrink: 0 }} value={bv.type} disabled={running}
                  onChange={(e) => setBodyVars((p) => p.map((x) => x.id === bv.id ? { ...x, type: e.target.value as BodyVarType } : x))}>
                  <option value="list">Quebra de linha (itera)</option>
                  <option value="custom">Custom (valor único)</option>
                </select>
                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 8px', color: '#ff5555' }} disabled={running}
                  onClick={() => setBodyVars((p) => p.filter((x) => x.id !== bv.id))}>✕</button>
              </div>
              {bv.type === 'list' ? (
                <>
                  <textarea className="input" style={{ width: '100%', minHeight: 90, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
                    placeholder={'1234567\n7654321\n...'} value={bv.value} disabled={running}
                    onChange={(e) => setBodyVars((p) => p.map((x) => x.id === bv.id ? { ...x, value: e.target.value } : x))} />
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {count} {count === 1 ? 'item' : 'itens'}{isIterator ? ' · dirige a iteração' : ' · (apenas a 1ª lista itera)'}
                  </span>
                </>
              ) : (
                <input className="input" style={{ width: '100%', fontSize: 12, fontFamily: 'monospace' }} placeholder="valor"
                  value={bv.value} disabled={running}
                  onChange={(e) => setBodyVars((p) => p.map((x) => x.id === bv.id ? { ...x, value: e.target.value } : x))} />
              )}
            </div>
          );
        })}
        {bodyVars.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma variável. Adicione ao menos uma "Quebra de linha" para iterar.</span>}
      </div>
    </div>
  );

  const topActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {selectedTemplate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 12px', borderRadius: 22,
          background: 'color-mix(in srgb, var(--accent) 11%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 32%, transparent)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            {selectedTemplate.folder && <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4, color: 'color-mix(in srgb, var(--accent) 75%, var(--text-muted))' }}>{selectedTemplate.folder}</span>}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTemplate.name}</span>
          </div>
          {!readOnly && (
            <button type="button" onClick={() => setSelTemplId(null)} title="Desvincular"
              style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent)', padding: 3, borderRadius: '50%', opacity: .65 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      )}
      {!readOnly && (
        <button className="btn btn-primary" disabled={running} onClick={handleSaveButton}
          style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>
          </svg>
          {selTemplId ? 'Salvar alterações' : 'Salvar como template'}
        </button>
      )}
    </div>
  );

  return (
    <ApisLayout title={readOnly ? 'Runs' : 'Importação Massiva'} activeApi={readOnly ? 'bulk-import-runs' : 'bulk-import'} actions={topActions} fluid loading={loadingData}>
      <style>{`
        .bulk-import-form .input,
        .bulk-import-form select.input,
        .bulk-import-form textarea.input {
          padding: 9px 11px;
          border-radius: 8px;
          border: 1px solid var(--divider);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 13px;
          transition: border-color .15s, box-shadow .15s;
        }
        .bulk-import-form .input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        .bulk-import-form .input:disabled { opacity: .6; cursor: not-allowed; }
        .bulk-import-form .field-card {
          border: 1px solid var(--divider);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
          background: var(--surface-alt);
        }
        @keyframes bulkFlash { 0% { background: color-mix(in srgb, var(--accent) 45%, transparent); } 100% { background: transparent; } }
        .bulk-flash { animation: bulkFlash .6s ease-out; }
        .bulk-import-form .field-card-title {
          font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .6px; color: var(--text-secondary); margin-bottom: 12px;
        }
      `}</style>
      <div style={{ display: 'flex', flex: 1, width: '100%', overflow: 'hidden', position: 'relative' }}>

        {/* ── Painel esquerdo — Templates ── */}
        <aside className="casos-tree" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="casos-tree-head">
            <button onClick={() => setTplFolder('all')} title="Mostrar todos"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: tplFolder === 'all' ? 'var(--accent)' : 'inherit', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Templates ({templates.length})
            </button>
            {!readOnly && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} disabled={running}
                onClick={() => setFolderModal({ open: true, name: '', parent: typeof tplFolder === 'string' && tplFolder !== 'all' && tplFolder !== 'none' ? tplFolder : '' })}>
                + Pasta
              </button>
            )}
          </div>

          {/* Árvore de pastas (sem "Todas"/"Sem pasta") */}
          {tplFolderRoots.map((node) => (
            <TplFolderNode key={node.fullPath} node={node} depth={0} selected={typeof tplFolder === 'string' ? tplFolder : ''}
              onSelect={setTplFolder} onDelete={readOnly ? undefined : deleteFolder} />
          ))}

          {(tplFolderRoots.length > 0 && visibleTemplates.length > 0) && <div className="casos-tree-divider" />}

          {/* Templates da seleção atual */}
          {visibleTemplates.map((t) => (
            <div key={t.id} className={`casos-tree-item${selTemplId === t.id ? ' active' : ''}`}>
              <span className="casos-tree-toggle-spacer" />
              <button className="casos-tree-label" onClick={() => loadTemplate(t)}>
                <span className="casos-tree-label-text">{t.name}</span>
              </button>
              {!readOnly && (
                <button className="casos-tree-del" onClick={() => deleteTemplate(t.id)} title="Remover">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
          {visibleTemplates.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              {templates.length === 0 ? 'Nenhum template.' : 'Nenhum template aqui.'}
            </p>
          )}
        </aside>

        {/* ── Coluna de configuração ── */}
        <div className="bulk-import-form" style={{ flex: '0 0 44%', minWidth: 0, borderRight: '1px solid var(--divider)', overflowY: 'auto', background: 'var(--bg-card)', padding: 16 }}>

          {/* ── Execução ── */}
          <div className="field-card">
            <div className="field-card-title">Execução</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>Ambiente</label>
                <select
                  className="input"
                  style={{ width: '100%', border: `2px solid ${eColor.border}`, background: eColor.bg, color: eColor.text, fontWeight: 700 }}
                  value={envId}
                  disabled={running}
                  onChange={(e) => changeEnv(e.target.value)}
                >
                  {config.environments.map((e) => {
                    const locked = envIsProd(e.name, e.id);
                    return (
                      <option key={e.id} value={e.id} disabled={locked}>
                        {locked ? `🔒 ${e.name}` : e.name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div style={{ flexShrink: 0 }}>
                <label style={labelStyle}>Modo</label>
                <div style={{ display: 'flex', border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
                  {(['seq', 'par'] as const).map((m) => (
                    <button key={m} type="button" disabled={running} onClick={() => setMode(m)}
                      title={m === 'seq' ? 'Uma chamada após a outra' : `Até ${CONCURRENCY} simultâneas`}
                      style={{ fontSize: 12, fontWeight: 600, padding: '9px 14px', border: 'none', cursor: running ? 'default' : 'pointer',
                        background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)' }}>
                      {m === 'seq' ? 'Sequencial' : `Paralelo (${CONCURRENCY})`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {prodLocked && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,85,85,.12)', border: '1px solid #ff5555', color: '#ff5555', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Ambiente de produção bloqueado. Disponível futuramente via permissão.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {!running ? (
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={!canRun} onClick={run}>
                  Executar
                </button>
              ) : (
                <button className="btn" style={{ flex: 1, background: '#ff5555', color: '#fff' }} onClick={stop}>
                  Parar
                </button>
              )}
            </div>
          </div>

          {/* ── Pré-condições ── */}
          <div className="field-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="field-card-title" style={{ margin: 0 }}>Pré-condições (encadeadas)</div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} disabled={running} onClick={addPre}>+ Adicionar</button>
            </div>
            {preRequests.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Nenhuma pré-condição. Opcional.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preRequests.map((pre, i) => (
                  <PreRequestCard
                    key={pre.id}
                    pre={pre}
                    index={i}
                    total={preRequests.length}
                    open={!!expandedPre[pre.id]}
                    running={running}
                    result={preResults.find((r) => r.uid === pre.id)}
                    labelStyle={labelStyle}
                    envId={envId}
                    envName={selEnv?.name ?? ''}
                    hosts={config.hosts}
                    onToggle={() => setExpandedPre((p) => ({ ...p, [pre.id]: !p[pre.id] }))}
                    onUpdate={(patch) => updatePre(pre.id, patch)}
                    onRemove={() => removePre(pre.id)}
                    onMove={(dir) => movePre(pre.id, dir)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── APIs de importação ── */}
          <div className="field-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="field-card-title" style={{ margin: 0 }}>APIs de importação</div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} disabled={running} onClick={addImport}>+ Adicionar</button>
            </div>
            {importRequests.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Nenhuma API. Adicione ao menos uma.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {importRequests.map((imp, i) => {
                  const v = importValidation[imp.id];
                  return (
                    <div key={imp.id}>
                      <PreRequestCard
                        pre={imp}
                        index={i}
                        total={importRequests.length}
                        open={!!expandedImport[imp.id]}
                        running={running}
                        labelStyle={labelStyle}
                        envId={envId}
                        envName={selEnv?.name ?? ''}
                        hosts={config.hosts}
                        variant="import"
                        bodyVarsSlot={i === 0 ? variablesEditor : undefined}
                        onToggle={() => setExpandedImport((p) => ({ ...p, [imp.id]: !p[imp.id] }))}
                        onUpdate={(patch) => updateImport(imp.id, patch)}
                        onRemove={() => removeImport(imp.id)}
                        onMove={(dir) => moveImport(imp.id, dir)}
                      />
                      {imp.enabled && v && (v.jsonError || v.urlInvalid) && (
                        <div style={{ fontSize: 11, color: 'var(--error,#ef4444)', margin: '4px 0 0 6px' }}>
                          {v.urlInvalid ? 'URL inválida. ' : ''}{v.jsonError ? `JSON inválido: ${v.jsonError}` : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Coluna de resultados ── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bg-card)', padding: 16 }}>

          {/* Pré-condições executadas */}
          {preResults.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Pré-condições</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {preResults.map((pr) => {
                  const isOpen = !!expanded[`pre_${pr.uid}`];
                  return (
                    <div key={pr.uid} style={{ border: `1px solid ${pr.ok ? 'var(--divider)' : '#ff5555'}`, borderRadius: 8, overflow: 'hidden' }}>
                      <button type="button" onClick={() => setExpanded((p) => ({ ...p, [`pre_${pr.uid}`]: !p[`pre_${pr.uid}`] }))}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-card)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: pr.ok ? '#50fa7b' : '#ff5555', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.name}</span>
                        {pr.extracted.map((x) => (
                          <span key={x.name} style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(189,147,249,.14)', color: '#7c4dff', border: '1px solid rgba(189,147,249,.4)', flexShrink: 0 }}>
                            {x.name}
                          </span>
                        ))}
                        <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: pr.ok ? '#50fa7b' : '#ff5555', flexShrink: 0 }}>{pr.httpStatus || 'ERR'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{pr.elapsed} ms</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--text-muted)' }}><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                      {pr.error && <div style={{ padding: '0 12px 8px 31px', fontSize: 11, color: '#ff5555' }}>⚠ {pr.error}</div>}
                      {isOpen && (
                        <div style={{ borderTop: '1px solid var(--divider)' }}>
                          <div style={{ padding: '7px 12px', background: 'var(--surface-alt)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                            <strong style={{ color: 'var(--text-secondary)' }}>{pr.name.toUpperCase()}</strong> {pr.url}
                          </div>
                          <div style={{ background: '#181825', maxHeight: 280, overflow: 'auto' }}>
                            <pre style={{ margin: 0, padding: 12, fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6, color: '#cdd6f4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                              dangerouslySetInnerHTML={{ __html: pr.response ? hl(pr.response) : '<em style="opacity:.4">Sem conteúdo</em>' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pré-condições "a cada" — ao vivo, piscam a cada chamada */}
          {Object.keys(eachResults).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Pré-condições por chamada (a cada)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(eachResults).map(([pid, er]) => {
                  const pr = er.last;
                  const isOpen = !!expanded[`each_${pid}`];
                  return (
                    <div key={pid} style={{ border: `1px solid ${pr.ok ? 'var(--divider)' : '#ff5555'}`, borderRadius: 8, overflow: 'hidden' }}>
                      <button type="button" onClick={() => setExpanded((p) => ({ ...p, [`each_${pid}`]: !p[`each_${pid}`] }))}
                        key={`${pid}_${er.count}`} className="bulk-flash"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: pr.ok ? '#50fa7b' : '#ff5555', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,184,108,.18)', color: '#e07b00', border: '1px solid #ffb86c', flexShrink: 0 }}>rodou {er.count}×</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: pr.ok ? '#50fa7b' : '#ff5555', flexShrink: 0 }}>{pr.httpStatus || 'ERR'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{pr.elapsed} ms</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--text-muted)' }}><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid var(--divider)' }}>
                          <div style={{ padding: '7px 12px', background: 'var(--surface-alt)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                            último: <strong style={{ color: 'var(--text-secondary)' }}>POST</strong> {pr.url}
                          </div>
                          <div style={{ padding: '6px 12px 4px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-muted)', background: '#1e1e2e' }}>Request (último)</div>
                          <div style={{ background: '#1e1e2e', maxHeight: 200, overflow: 'auto' }}>
                            <pre style={{ margin: 0, padding: '4px 12px 12px', fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.55, color: '#cdd6f4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                              dangerouslySetInnerHTML={{ __html: pr.request ? hl(pr.request) : '<em style="opacity:.4">—</em>' }} />
                          </div>
                          <div style={{ padding: '6px 12px 4px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-muted)', background: '#181825', borderTop: '1px solid rgba(255,255,255,.06)' }}>Response (último)</div>
                          <div style={{ background: '#181825', maxHeight: 240, overflow: 'auto' }}>
                            <pre style={{ margin: 0, padding: '4px 12px 12px', fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.55, color: '#cdd6f4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                              dangerouslySetInnerHTML={{ __html: pr.response ? hl(pr.response) : '<em style="opacity:.4">Sem conteúdo</em>' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {items.length === 0 ? (
            (preResults.length > 0 || Object.keys(eachResults).length > 0) ? null : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13 }}>Os resultados das importações aparecem aqui</span>
            </div>
            )
          ) : (
            <>
              {/* Sumário + filtro */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {([
                  { k: 'all' as const, label: `Todos ${items.length}`, color: 'var(--text-secondary)' },
                  { k: 'ok' as const, label: `OK ${summary.done}`, color: '#1a8a3d' },
                  { k: 'error' as const, label: `Erro ${summary.error}`, color: '#ff5555' },
                ]).map((f) => {
                  const active = filter === f.k;
                  return (
                    <button key={f.k} type="button" onClick={() => setFilter(f.k)}
                      style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                        border: `1px solid ${active ? f.color : 'var(--divider)'}`,
                        background: active ? f.color : 'transparent',
                        color: active ? '#fff' : f.color }}>
                      {f.label}
                    </button>
                  );
                })}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                  {summary.pending > 0 && <>{summary.pending} pendente · </>}Σ {summary.totalMs} ms
                </span>
                <button type="button" onClick={deleteHistory} disabled={running} title="Limpa o histórico salvo deste usuário"
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: running ? 'not-allowed' : 'pointer', border: '1px solid var(--divider)', background: 'transparent', color: '#ff5555', display: 'flex', alignItems: 'center', gap: 5, opacity: running ? .5 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Deletar histórico
                </button>
              </div>

              {/* Lista de itens */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredItems.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '10px 2px' }}>Nenhum resultado neste filtro.</p>
                )}
                {filteredItems.map((it) => {
                  const isOpen = !!expanded[it.uid];
                  const dot = it.status === 'done' ? '#50fa7b' : it.status === 'error' ? '#ff5555' : it.status === 'running' ? '#ffb86c' : 'var(--divider)';
                  const ec = it.envName ? envColor(it.envName) : null;
                  return (
                    <div key={it.uid} style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
                      <button type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [it.uid]: !p[it.uid] }))}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-card)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0, animation: it.status === 'running' ? 'pulse 1s infinite' : undefined }} />
                        {it.id && (
                          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{it.id}</span>
                        )}
                        {/* badges API + company + ambiente */}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, minWidth: 0 }}>
                          {it.apiName && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(139,233,253,.14)', color: '#0097b2', border: '1px solid rgba(139,233,253,.4)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                              {it.apiName}
                            </span>
                          )}
                          {it.company && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--surface-alt)', color: 'var(--text-muted)', flexShrink: 0 }}>
                              Company {it.company}
                            </span>
                          )}
                          {ec && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: ec.bg, color: ec.text, border: `1px solid ${ec.border}`, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                              {it.envName}
                            </span>
                          )}
                        </div>
                        {it.status !== 'pending' && it.status !== 'running' && (
                          <>
                            <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: it.ok ? '#50fa7b' : '#ff5555', flexShrink: 0 }}>{it.httpStatus || 'ERR'}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, minWidth: 48, textAlign: 'right' }}>{it.elapsed} ms</span>
                          </>
                        )}
                        {it.status === 'running' && <span style={{ fontSize: 11, color: '#ffb86c', flexShrink: 0 }}>executando…</span>}
                        {it.status === 'pending' && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>na fila</span>}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--text-muted)' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </button>
                      {isOpen && (() => {
                        const reqShown = reqOpen[it.uid] ?? false;   // request fechado por padrão
                        const resShown = resOpen[it.uid] ?? true;    // response aberto por padrão
                        const secChevron = (open: boolean) => (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                        );
                        return (
                          <div style={{ borderTop: '1px solid var(--divider)' }}>
                            {it.url && (
                              <div style={{ padding: '7px 12px', background: 'var(--surface-alt)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', borderBottom: '1px solid var(--divider)' }}>
                                <strong style={{ color: 'var(--text-secondary)' }}>POST</strong> {it.url}
                              </div>
                            )}

                            {/* Request enviado (colapsável) */}
                            <button type="button" onClick={() => setReqOpen((p) => ({ ...p, [it.uid]: !(p[it.uid] ?? false) }))}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-muted)', background: '#1e1e2e', border: 'none', cursor: 'pointer' }}>
                              {secChevron(reqShown)}
                              <span>Request enviado</span>
                            </button>
                            {reqShown && (
                              <div style={{ background: '#1e1e2e', maxHeight: 240, overflow: 'auto', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                                <pre style={{ margin: 0, padding: '8px 12px 12px', fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6, color: '#cdd6f4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                  dangerouslySetInnerHTML={{ __html: it.request ? hl(it.request) : '<em style="opacity:.4">—</em>' }} />
                              </div>
                            )}

                            {/* Response (colapsável) */}
                            <div style={{ display: 'flex', alignItems: 'center', background: '#181825', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                              <button type="button" onClick={() => setResOpen((p) => ({ ...p, [it.uid]: !(p[it.uid] ?? true) }))}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                {secChevron(resShown)}
                                <span>Response {it.httpStatus ? `· ${it.httpStatus}` : ''}</span>
                              </button>
                              <button type="button" onClick={() => navigator.clipboard.writeText(it.response || '')}
                                style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px' }}>Copiar</button>
                            </div>
                            {resShown && (
                              <div style={{ background: '#181825', maxHeight: 320, overflow: 'auto', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                                <pre style={{ margin: 0, padding: '8px 12px 12px', fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6, color: '#cdd6f4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                  dangerouslySetInnerHTML={{ __html: it.response ? hl(it.response) : '<em style="opacity:.4">Sem conteúdo no corpo da resposta</em>' }} />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Aba lateral: Variáveis & Consultas ── */}
        <button type="button" onClick={() => setVarsDrawerOpen((v) => !v)}
          title="Variáveis criadas"
          style={{ position: 'absolute', top: '50%', right: varsDrawerOpen ? 360 : 0, transform: 'translateY(-50%)', zIndex: 30,
            display: 'flex', alignItems: 'center', gap: 6, padding: '14px 7px', writingMode: 'vertical-rl',
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px 0 0 8px', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, letterSpacing: '.5px', boxShadow: '-2px 0 8px rgba(0,0,0,.15)', transition: 'right .2s' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: varsDrawerOpen ? 'rotate(180deg)' : 'none' }}><path d="M15 18l-6-6 6-6" /></svg>
          Variáveis{allVarNames.length ? ` (${allVarNames.length})` : ''}
        </button>

        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 360, zIndex: 29,
          transform: varsDrawerOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .2s',
          background: 'var(--bg-card)', borderLeft: '1px solid var(--divider)', overflowY: 'auto',
          boxShadow: varsDrawerOpen ? '-12px 0 32px rgba(0,0,0,.18)' : 'none' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
            <strong style={{ fontSize: 14 }}>Variáveis</strong>
            <button type="button" onClick={() => setVarsDrawerOpen(false)} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }}>✕</button>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Todas as variáveis <code>{'{{ }}'}</code> usadas. Edite o valor — vale para imports e pré-condições. Quem é extraída por pré-condição é sobrescrita ao rodar.
            </p>
            {allVarNames.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Nenhuma variável usada ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allVarNames.map((name) => {
                  const bv = bodyVars.find((x) => x.name.trim() === name);
                  const isList = bv?.type === 'list';
                  const listCount = isList ? bv!.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length : 0;
                  return (
                    <div key={name} style={{ border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#7c4dff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{`{{${name}}}`}</span>
                        {isList && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(80,250,123,.14)', color: '#1a8a3d', border: '1px solid rgba(80,250,123,.4)' }}>lista</span>}
                      </div>
                      {isList ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lista com {listCount} {listCount === 1 ? 'item' : 'itens'} — edite na API de importação.</div>
                      ) : (() => {
                        const runtimeVal = activeVars[name];
                        const hasRuntime = runtimeVal != null && (bv?.value ?? '') === '';
                        return (
                          <input className="input"
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: '7px 9px', borderRadius: 7, color: 'var(--text-primary)',
                              border: `1px solid ${hasRuntime ? '#50fa7b' : 'var(--divider)'}`, background: hasRuntime ? 'rgba(80,250,123,.08)' : 'var(--bg-card)' }}
                            placeholder="valor"
                            value={bv?.value ? bv.value : (runtimeVal ?? '')} disabled={running}
                            onChange={(e) => setVarValueByName(name, e.target.value)} />
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal salvar template ── */}
      {saveModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSaveModal({ open: false, name: '', folder: '', editingId: null })}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <strong style={{ fontSize: 15 }}>{saveModal.editingId ? 'Editar template' : 'Novo template'}</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4 }}>Nome</label>
              <input className="input" autoFocus placeholder="Ex.: Importação Miketec"
                value={saveModal.name} onChange={(e) => setSaveModal((p) => ({ ...p, name: e.target.value }))}
                style={{ fontSize: 13 }} onKeyDown={(e) => { if (e.key === 'Enter' && saveModal.name.trim()) doSaveTemplate(); }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4 }}>Pasta (opcional)</label>
              <input className="input" placeholder="Ex.: Miketec / Backoffice" list="tpl-folders-dl"
                value={saveModal.folder} onChange={(e) => setSaveModal((p) => ({ ...p, folder: e.target.value }))}
                style={{ fontSize: 13 }} />
              <datalist id="tpl-folders-dl">
                {tplFolders.map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setSaveModal({ open: false, name: '', folder: '', editingId: null })}>Cancelar</button>
              <button className="btn btn-primary" disabled={!saveModal.name.trim()} onClick={doSaveTemplate}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal criar pasta ── */}
      {folderModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFolderModal({ open: false, name: '', parent: '' })}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}
            onClick={(e) => e.stopPropagation()}>
            <strong style={{ fontSize: 15 }}>Nova pasta</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4 }}>Nome</label>
              <input className="input" autoFocus placeholder="Ex.: Backoffice"
                value={folderModal.name} onChange={(e) => setFolderModal((p) => ({ ...p, name: e.target.value }))}
                style={{ fontSize: 13 }} onKeyDown={(e) => { if (e.key === 'Enter' && folderModal.name.trim()) createFolder(); }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4 }}>Dentro de</label>
              <select className="input" value={folderModal.parent} onChange={(e) => setFolderModal((p) => ({ ...p, parent: e.target.value }))} style={{ fontSize: 13 }}>
                <option value="">(Raiz)</option>
                {tplFolders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {folderModal.name.trim() && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Criar: <code style={{ color: 'var(--accent)' }}>{(folderModal.parent ? folderModal.parent + '/' : '') + folderModal.name.trim().replace(/\//g, '')}</code>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setFolderModal({ open: false, name: '', parent: '' })}>Cancelar</button>
              <button className="btn btn-primary" disabled={!folderModal.name.trim()} onClick={createFolder}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação (salvar/excluir) ── */}
      {confirmDlg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)' }} onClick={() => setConfirmDlg(null)} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--divider)', boxShadow: '0 8px 40px rgba(0,0,0,.25)', padding: '24px 28px', maxWidth: 400, width: '90%', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: confirmDlg.danger ? '#ef4444' : 'var(--accent)', marginBottom: 6 }}>{confirmDlg.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{confirmDlg.message}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDlg(null)}>Cancelar</button>
              <button className="btn" onClick={() => { confirmDlg.onConfirm(); setConfirmDlg(null); }}
                style={confirmDlg.danger ? { background: '#ef4444', color: '#fff', border: 'none' } : { background: 'var(--accent)', color: '#fff', border: 'none' }}>
                {confirmDlg.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ApisLayout>
  );
}

export function BulkImportRunsPage() {
  return <BulkImportPage readOnly />;
}
