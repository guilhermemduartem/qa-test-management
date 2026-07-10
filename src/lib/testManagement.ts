/* ═══════════════════════════════════════════════════════════
   testManagement.ts — Camada de acesso a dados do módulo de
   Gestão de Testes. CRUD tipado por entidade sobre Supabase.

   Persistência ÚNICA: Supabase (sem cache local). Enquanto não
   houver Supabase Auth real, as tabelas qa_test_* ficam atrás de
   RLS (authenticated-only) — ver migration 20260603..._create_qa_test_management.sql.
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';
import { showToast } from './toast';
import { currentUser } from './auth';
import type {
  TestProject, TestSuite, TestCase, TestCaseVersion, Milestone, Sprint, Card, TestPlan,
  TestRun, TestRunResult, Requirement, CaseRequirement, Defect, ExploratorySession,
  TestStep, Evidence, ExploratoryNote, StepResult,
} from '../types/tests';

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

let warned = false;
function fail(scope: string, message: string): void {
  console.warn(`[tests:${scope}] ${message}`);
  if (!warned) {
    warned = true;
    showToast('Supabase indisponível ou sem permissão para o módulo de Testes.', 'warning');
  }
}

export function currentUserId(): string | null {
  return (currentUser() as { id?: string } | null)?.id ?? null;
}

/* ───────────────────────── Projetos ───────────────────────── */
const PROJECT_COLS = 'id,name,description,created_by,created_at';
type ProjectRow = { id: string; name: string; description: string | null; created_by: string | null; created_at: string };
const fromProject = (r: ProjectRow): TestProject => ({ id: r.id, name: r.name, description: r.description ?? '', createdBy: r.created_by, createdAt: r.created_at });
const toProject = (p: TestProject): ProjectRow => ({ id: p.id, name: p.name, description: p.description || null, created_by: p.createdBy, created_at: p.createdAt });

export async function listProjects(): Promise<TestProject[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_projects').select(PROJECT_COLS).order('created_at', { ascending: true });
  if (error) { fail('projects', error.message); return []; }
  return (data as ProjectRow[]).map(fromProject);
}
export async function saveProject(p: TestProject): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_projects').upsert([toProject(p)], { onConflict: 'id' });
  if (error) { fail('projects', error.message); return false; }
  return true;
}
export async function deleteProject(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_projects').delete().eq('id', id);
  if (error) { fail('projects', error.message); return false; }
  return true;
}

/* ───────────────────────── Suítes ───────────────────────── */
const SUITE_COLS = 'id,project_id,parent_id,name,"order",created_at';
type SuiteRow = { id: string; project_id: string; parent_id: string | null; name: string; order: number; created_at: string };
const fromSuite = (r: SuiteRow): TestSuite => ({ id: r.id, projectId: r.project_id, parentId: r.parent_id, name: r.name, order: r.order, createdAt: r.created_at });
const toSuite = (s: TestSuite): SuiteRow => ({ id: s.id, project_id: s.projectId, parent_id: s.parentId, name: s.name, order: s.order, created_at: s.createdAt });

export async function listSuites(projectId: string): Promise<TestSuite[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_suites').select(SUITE_COLS).eq('project_id', projectId).order('order', { ascending: true });
  if (error) { fail('suites', error.message); return []; }
  return (data as SuiteRow[]).map(fromSuite);
}
export async function saveSuite(s: TestSuite): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_suites').upsert([toSuite(s)], { onConflict: 'id' });
  if (error) { fail('suites', error.message); return false; }
  return true;
}
export async function deleteSuite(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_suites').delete().eq('id', id);
  if (error) { fail('suites', error.message); return false; }
  return true;
}

/* ───────────────────────── Casos ───────────────────────── */
const CASE_COLS = 'id,suite_id,project_id,plan_id,title,type,priority,status,preconditions,steps,expected_result,tags,custom_fields,created_by,created_at,updated_at';
type CaseRow = {
  id: string; suite_id: string | null; project_id: string; plan_id: string | null; title: string; type: TestCase['type'];
  priority: TestCase['priority']; status: TestCase['status']; preconditions: string | null;
  steps: TestStep[] | null; expected_result: string | null; tags: string[] | null;
  custom_fields: Record<string, unknown> | null; created_by: string | null; created_at: string; updated_at: string | null;
};
const fromCase = (r: CaseRow): TestCase => ({
  id: r.id, suiteId: r.suite_id, projectId: r.project_id, planId: r.plan_id ?? null, title: r.title, type: r.type,
  priority: r.priority, status: r.status, preconditions: r.preconditions ?? '',
  steps: r.steps ?? [], expectedResult: r.expected_result ?? '', tags: r.tags ?? [],
  customFields: r.custom_fields ?? {}, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toCase = (x: TestCase): CaseRow => ({
  id: x.id, suite_id: x.suiteId, project_id: x.projectId, plan_id: x.planId ?? null, title: x.title, type: x.type,
  priority: x.priority, status: x.status, preconditions: x.preconditions || null,
  steps: x.steps, expected_result: x.expectedResult || null, tags: x.tags,
  custom_fields: x.customFields, created_by: x.createdBy, created_at: x.createdAt, updated_at: x.updatedAt,
});

export async function listCases(projectId: string): Promise<TestCase[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_cases').select(CASE_COLS).eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('cases', error.message); return []; }
  return (data as CaseRow[]).map(fromCase);
}
export async function saveCase(x: TestCase): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_cases').upsert([toCase(x)], { onConflict: 'id' });
  if (error) { fail('cases', error.message); return false; }
  return true;
}
export async function deleteCase(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_cases').delete().eq('id', id);
  if (error) { fail('cases', error.message); return false; }
  return true;
}
export async function bulkUpsertCases(rows: TestCase[]): Promise<boolean> {
  const c = getSupabaseClient(); if (!c || !rows.length) return false;
  const { error } = await c.from('qa_test_cases').upsert(rows.map(toCase), { onConflict: 'id' });
  if (error) { fail('cases', error.message); return false; }
  return true;
}

/* ── Versões de caso (histórico) ── */
type VersionRow = { id: string; case_id: string; snapshot: Partial<TestCase>; saved_by: string | null; saved_at: string };
export async function listCaseVersions(caseId: string): Promise<TestCaseVersion[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_case_versions').select('id,case_id,snapshot,saved_by,saved_at').eq('case_id', caseId).order('saved_at', { ascending: false });
  if (error) { fail('versions', error.message); return []; }
  return (data as VersionRow[]).map((r) => ({ id: r.id, caseId: r.case_id, snapshot: r.snapshot, savedBy: r.saved_by, savedAt: r.saved_at }));
}
export async function addCaseVersion(caseId: string, snapshot: Partial<TestCase>): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const row: VersionRow = { id: genId(), case_id: caseId, snapshot, saved_by: currentUserId(), saved_at: new Date().toISOString() };
  const { error } = await c.from('qa_test_case_versions').insert([row]);
  if (error) { fail('versions', error.message); return false; }
  return true;
}

/* ───────────────────────── Milestones ───────────────────────── */
type MilestoneRow = { id: string; project_id: string; name: string; due_date: string | null; status: Milestone['status']; created_at: string };
const fromMilestone = (r: MilestoneRow): Milestone => ({ id: r.id, projectId: r.project_id, name: r.name, dueDate: r.due_date, status: r.status, createdAt: r.created_at });
const toMilestone = (m: Milestone): MilestoneRow => ({ id: m.id, project_id: m.projectId, name: m.name, due_date: m.dueDate, status: m.status, created_at: m.createdAt });
export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_milestones').select('id,project_id,name,due_date,status,created_at').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('milestones', error.message); return []; }
  return (data as MilestoneRow[]).map(fromMilestone);
}
export async function saveMilestone(m: Milestone): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_milestones').upsert([toMilestone(m)], { onConflict: 'id' });
  if (error) { fail('milestones', error.message); return false; }
  return true;
}
export async function deleteMilestone(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_milestones').delete().eq('id', id);
  if (error) { fail('milestones', error.message); return false; }
  return true;
}

/* ───────────────────────── Sprints ───────────────────────── */
type SprintRow = { id: string; project_id: string; milestone_id: string | null; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string };
const fromSprint = (r: SprintRow): Sprint => ({ id: r.id, projectId: r.project_id, milestoneId: r.milestone_id ?? null, name: r.name, status: (r.status as Sprint['status']) ?? 'planejada', startDate: r.start_date ?? null, endDate: r.end_date ?? null, createdAt: r.created_at });
const toSprint = (s: Sprint): SprintRow => ({ id: s.id, project_id: s.projectId, milestone_id: s.milestoneId, name: s.name, status: s.status, start_date: s.startDate ?? null, end_date: s.endDate ?? null, created_at: s.createdAt });
export async function listSprints(projectId: string): Promise<Sprint[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_sprints').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('sprints', error.message); return []; }
  return (data as SprintRow[]).map(fromSprint);
}
export async function saveSprint(s: Sprint): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_sprints').upsert([toSprint(s)], { onConflict: 'id' });
  if (error) { fail('sprints', error.message); return false; }
  return true;
}
export async function deleteSprint(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_sprints').delete().eq('id', id);
  if (error) { fail('sprints', error.message); return false; }
  return true;
}

/* ───────────────────────── Cards ───────────────────────── */
type CardRow = { id: string; project_id: string; sprint_id: string | null; milestone_id: string | null; azure_id: number | null; title: string; objetivo: string | null; resumo: string | null; repro_steps: string | null; status: Card['status']; created_at: string };
const fromCard = (r: CardRow): Card => ({ id: r.id, projectId: r.project_id, sprintId: r.sprint_id ?? null, milestoneId: r.milestone_id ?? null, azureId: r.azure_id ?? null, title: r.title, objetivo: r.objetivo ?? '', resumo: r.resumo ?? '', checklist: r.repro_steps ?? '', status: r.status, createdAt: r.created_at });
const toCard = (d: Card): CardRow => ({ id: d.id, project_id: d.projectId, sprint_id: d.sprintId, milestone_id: d.milestoneId, azure_id: d.azureId, title: d.title, objetivo: d.objetivo || null, resumo: d.resumo || null, repro_steps: d.checklist || null, status: d.status, created_at: d.createdAt });
export async function listCards(projectId: string): Promise<Card[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_cards').select('id,project_id,sprint_id,milestone_id,azure_id,title,objetivo,resumo,repro_steps,status,created_at').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('cards', error.message); return []; }
  return (data as CardRow[]).map(fromCard);
}
export async function saveCard(d: Card): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_cards').upsert([toCard(d)], { onConflict: 'id' });
  if (error) { fail('cards', error.message); return false; }
  return true;
}
export async function deleteCard(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_cards').delete().eq('id', id);
  if (error) { fail('cards', error.message); return false; }
  return true;
}

/* ───────────────────────── Planos ───────────────────────── */
type PlanRow = { id: string; project_id: string; milestone_id: string | null; sprint_id: string | null; card_id: string | null; name: string; scope: string | null; status: string; created_by: string | null; created_at: string };
const fromPlan = (r: PlanRow): TestPlan => ({ id: r.id, projectId: r.project_id, milestoneId: r.milestone_id, sprintId: r.sprint_id ?? null, cardId: r.card_id ?? null, name: r.name, scope: r.scope ?? '', status: (r.status as TestPlan['status']) ?? 'pendente', createdBy: r.created_by, createdAt: r.created_at });
const toPlan = (p: TestPlan): PlanRow => ({ id: p.id, project_id: p.projectId, milestone_id: p.milestoneId, sprint_id: p.sprintId ?? null, card_id: p.cardId ?? null, name: p.name, scope: p.scope || null, status: p.status, created_by: p.createdBy, created_at: p.createdAt });
export async function listPlans(projectId: string): Promise<TestPlan[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_plans').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('plans', error.message); return []; }
  return (data as PlanRow[]).map(fromPlan);
}
export async function savePlan(p: TestPlan): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_plans').upsert([toPlan(p)], { onConflict: 'id' });
  if (error) { fail('plans', error.message); return false; }
  return true;
}
export async function deletePlan(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_plans').delete().eq('id', id);
  if (error) { fail('plans', error.message); return false; }
  return true;
}

/* ───────────────────────── Execuções (runs) ───────────────────────── */
type RunRow = { id: string; project_id: string; plan_id: string | null; name: string; status: TestRun['status']; assigned_to: string | null; created_at: string; closed_at: string | null; series_id: string | null; cycle: number | null; ambiente: string | null; company: string | null; versao_backoffice: string | null; versao_b2b: string | null };
const fromRun = (r: RunRow): TestRun => ({ id: r.id, projectId: r.project_id, planId: r.plan_id, name: r.name, status: r.status, assignedTo: r.assigned_to, createdAt: r.created_at, closedAt: r.closed_at, seriesId: r.series_id ?? r.id, cycle: r.cycle ?? 1, ambiente: r.ambiente ?? null, company: r.company ?? null, versaoBackoffice: r.versao_backoffice ?? null, versaoB2b: r.versao_b2b ?? null });
const toRun = (r: TestRun): RunRow => ({ id: r.id, project_id: r.projectId, plan_id: r.planId, name: r.name, status: r.status, assigned_to: r.assignedTo, created_at: r.createdAt, closed_at: r.closedAt, series_id: r.seriesId, cycle: r.cycle, ambiente: r.ambiente ?? null, company: r.company ?? null, versao_backoffice: r.versaoBackoffice ?? null, versao_b2b: r.versaoB2b ?? null });
export async function listRuns(projectId: string): Promise<TestRun[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_runs').select('id,project_id,plan_id,name,status,assigned_to,created_at,closed_at,series_id,cycle,ambiente,company,versao_backoffice,versao_b2b').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('runs', error.message); return []; }
  return (data as RunRow[]).map(fromRun);
}
export async function saveRun(r: TestRun): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_runs').upsert([toRun(r)], { onConflict: 'id' });
  if (error) { fail('runs', error.message); return false; }
  return true;
}
export async function deleteRun(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_runs').delete().eq('id', id);
  if (error) { fail('runs', error.message); return false; }
  return true;
}

/* ── Resultados de run ── */
type ResultRow = { id: string; run_id: string; case_id: string; status: TestRunResult['status']; executed_by: string | null; executed_at: string | null; elapsed_seconds: number; comment: string | null; evidence: Evidence[] | null; position: number | null; step_results: StepResult[] | null };
const fromResult = (r: ResultRow): TestRunResult => ({ id: r.id, runId: r.run_id, caseId: r.case_id, status: r.status, executedBy: r.executed_by, executedAt: r.executed_at, elapsedSeconds: r.elapsed_seconds, comment: r.comment ?? '', evidence: r.evidence ?? [], position: r.position ?? 0, stepResults: r.step_results ?? [] });
const toResult = (r: TestRunResult): ResultRow => ({ id: r.id, run_id: r.runId, case_id: r.caseId, status: r.status, executed_by: r.executedBy, executed_at: r.executedAt, elapsed_seconds: r.elapsedSeconds, comment: r.comment || null, evidence: r.evidence, position: r.position, step_results: r.stepResults });
export async function listRunResults(runId: string): Promise<TestRunResult[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_test_run_results').select('id,run_id,case_id,status,executed_by,executed_at,elapsed_seconds,comment,evidence,position,step_results').eq('run_id', runId).order('position', { ascending: true });
  if (error) { fail('results', error.message); return []; }
  return (data as ResultRow[]).map(fromResult);
}
export async function saveRunResult(r: TestRunResult): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_run_results').upsert([toResult(r)], { onConflict: 'id' });
  if (error) { fail('results', error.message); return false; }
  return true;
}
export async function bulkInsertRunResults(rows: TestRunResult[]): Promise<boolean> {
  const c = getSupabaseClient(); if (!c || !rows.length) return false;
  const { error } = await c.from('qa_test_run_results').insert(rows.map(toResult));
  if (error) { fail('results', error.message); return false; }
  return true;
}
export async function deleteRunResult(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_run_results').delete().eq('id', id);
  if (error) { fail('results', error.message); return false; }
  return true;
}

/* ── Evidências (upload real no Supabase Storage, bucket qa-evidence) ── */
const EVIDENCE_BUCKET = 'qa-evidence';
export async function uploadEvidence(runId: string, file: File): Promise<Evidence | null> {
  const c = getSupabaseClient(); if (!c) return null;
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${runId}/${genId()}_${safe}`;
  const { error } = await c.storage.from(EVIDENCE_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) { fail('evidence', error.message); return null; }
  const { data } = c.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
  return { name: file.name, url: data.publicUrl };
}

/* ───────────────────────── Requisitos / Rastreabilidade ───────────────────────── */
type ReqRow = { id: string; project_id: string; external_key: string | null; title: string; description: string | null; created_at: string };
const fromReq = (r: ReqRow): Requirement => ({ id: r.id, projectId: r.project_id, externalKey: r.external_key ?? '', title: r.title, description: r.description ?? '', createdAt: r.created_at });
const toReq = (r: Requirement): ReqRow => ({ id: r.id, project_id: r.projectId, external_key: r.externalKey || null, title: r.title, description: r.description || null, created_at: r.createdAt });
export async function listRequirements(projectId: string): Promise<Requirement[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_requirements').select('id,project_id,external_key,title,description,created_at').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('requirements', error.message); return []; }
  return (data as ReqRow[]).map(fromReq);
}
export async function saveRequirement(r: Requirement): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_requirements').upsert([toReq(r)], { onConflict: 'id' });
  if (error) { fail('requirements', error.message); return false; }
  return true;
}
export async function deleteRequirement(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_requirements').delete().eq('id', id);
  if (error) { fail('requirements', error.message); return false; }
  return true;
}
export async function listCaseRequirements(projectCaseIds: string[]): Promise<CaseRequirement[]> {
  const c = getSupabaseClient(); if (!c || !projectCaseIds.length) return [];
  const { data, error } = await c.from('qa_test_case_requirements').select('case_id,requirement_id').in('case_id', projectCaseIds);
  if (error) { fail('traceability', error.message); return []; }
  return (data as { case_id: string; requirement_id: string }[]).map((r) => ({ caseId: r.case_id, requirementId: r.requirement_id }));
}
export async function linkCaseRequirement(caseId: string, requirementId: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_case_requirements').upsert([{ case_id: caseId, requirement_id: requirementId }], { onConflict: 'case_id,requirement_id' });
  if (error) { fail('traceability', error.message); return false; }
  return true;
}
export async function unlinkCaseRequirement(caseId: string, requirementId: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_test_case_requirements').delete().eq('case_id', caseId).eq('requirement_id', requirementId);
  if (error) { fail('traceability', error.message); return false; }
  return true;
}

/* ───────────────────────── Defeitos ───────────────────────── */
type DefectRow = {
  id: string; project_id: string; kind: string | null; run_result_id: string | null; card_id: string | null; plan_id: string | null; title: string; description: string | null;
  severity: Defect['severity']; status: Defect['status']; external_key: string | null;
  created_by: string | null; created_at: string; evidence: Evidence[] | null;
  azure_work_item_id: number | null; azure_config_id: string | null; azure_template_id: string | null;
  azure_state: string | null; azure_synced_at: string | null; azure_custom_fields: Record<string, unknown> | null;
};
const fromDefect = (r: DefectRow): Defect => ({
  id: r.id, projectId: r.project_id, kind: (r.kind as Defect['kind']) ?? 'bug', runResultId: r.run_result_id, cardId: r.card_id ?? null, planId: r.plan_id ?? null, title: r.title, description: r.description ?? '',
  severity: r.severity, status: r.status, externalKey: r.external_key, createdBy: r.created_by, createdAt: r.created_at, evidence: r.evidence ?? [],
  azureWorkItemId: r.azure_work_item_id ?? null, azureConfigId: r.azure_config_id ?? null, azureTemplateId: r.azure_template_id ?? null,
  azureState: r.azure_state ?? null, azureSyncedAt: r.azure_synced_at ?? null, azureCustomFields: r.azure_custom_fields ?? {},
});
const toDefect = (d: Defect): DefectRow => ({
  id: d.id, project_id: d.projectId, kind: d.kind ?? 'bug', run_result_id: d.runResultId, card_id: d.cardId ?? null, plan_id: d.planId ?? null, title: d.title, description: d.description || null,
  severity: d.severity, status: d.status, external_key: d.externalKey, created_by: d.createdBy, created_at: d.createdAt, evidence: d.evidence,
  azure_work_item_id: d.azureWorkItemId, azure_config_id: d.azureConfigId, azure_template_id: d.azureTemplateId,
  azure_state: d.azureState, azure_synced_at: d.azureSyncedAt, azure_custom_fields: d.azureCustomFields,
});
export async function listDefects(projectId: string): Promise<Defect[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_defects').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('defects', error.message); return []; }
  return (data as DefectRow[]).map(fromDefect);
}
export async function saveDefect(d: Defect): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const row = toDefect(d);
  const { error } = await c.from('qa_defects').upsert([row], { onConflict: 'id' });
  if (error) {
    /* migration not yet applied: plan_id and/or kind columns missing */
    if (error.message.includes('plan_id') || error.message.includes('kind')) {
      const { plan_id: _p, kind: _k, ...rowWithout } = row as DefectRow & Record<string, unknown>;
      const { error: e2 } = await c.from('qa_defects').upsert([rowWithout], { onConflict: 'id' });
      if (e2) { fail('defects', e2.message); return false; }
      return true;
    }
    /* CHECK constraint on status not yet updated — retry with 'open' */
    if (error.message.includes('qa_defects_status_check') || error.message.includes('violates check constraint')) {
      const fallbackRow = { ...row, status: row.status === 'pending_azure' ? 'open' : row.status };
      const { error: e3 } = await c.from('qa_defects').upsert([fallbackRow], { onConflict: 'id' });
      if (e3) { fail('defects', e3.message); return false; }
      return true;
    }
    fail('defects', error.message); return false;
  }
  return true;
}
export async function deleteDefect(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_defects').delete().eq('id', id);
  if (error) { fail('defects', error.message); return false; }
  return true;
}

/* ───────────────────────── Sessões exploratórias ───────────────────────── */
type SessionRow = { id: string; project_id: string; charter: string | null; notes: (ExploratoryNote & { _planId?: string })[] | null; duration_seconds: number; created_by: string | null; created_at: string };
type SessionMeta = { _planId?: string; _ambiente?: string; _company?: string; _bo?: string; _b2b?: string; _status?: string };
const META_KEYS = ['_planId', '_ambiente', '_company', '_bo', '_b2b', '_status'] as const;
const isMeta = (n: object) => META_KEYS.some((k) => k in n);
const fromSession = (r: SessionRow): ExploratorySession => {
  const raw = r.notes ?? [];
  const meta = raw.find(isMeta) as (SessionMeta & { at: string; text: string }) | undefined;
  return {
    id: r.id, projectId: r.project_id, charter: r.charter ?? '',
    planId: meta?._planId ?? null,
    ambiente: meta?._ambiente ?? null,
    company: meta?._company ?? null,
    versaoBackoffice: meta?._bo ?? null,
    versaoB2b: meta?._b2b ?? null,
    notes: raw.filter((n) => !isMeta(n)),
    durationSeconds: r.duration_seconds,
    status: (meta?._status as 'open' | 'closed') ?? 'open',
    createdBy: r.created_by, createdAt: r.created_at,
  };
};
const toSession = (s: ExploratorySession): SessionRow => {
  const hasMeta = s.planId || s.ambiente || s.company || s.versaoBackoffice || s.versaoB2b || s.status;
  const metaArr = hasMeta ? [{
    at: s.createdAt, text: '',
    _planId: s.planId ?? undefined, _ambiente: s.ambiente ?? undefined,
    _company: s.company ?? undefined, _bo: s.versaoBackoffice ?? undefined, _b2b: s.versaoB2b ?? undefined,
    _status: s.status ?? undefined,
  }] : [];
  return { id: s.id, project_id: s.projectId, charter: s.charter || null, notes: [...metaArr, ...s.notes], duration_seconds: s.durationSeconds, created_by: s.createdBy, created_at: s.createdAt };
};
export async function listSessions(projectId: string): Promise<ExploratorySession[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_exploratory_sessions').select('id,project_id,charter,notes,duration_seconds,created_by,created_at').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) { fail('sessions', error.message); return []; }
  return (data as SessionRow[]).map(fromSession);
}
export async function saveSession(s: ExploratorySession): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_exploratory_sessions').upsert([toSession(s)], { onConflict: 'id' });
  if (error) { fail('sessions', error.message); return false; }
  return true;
}
export async function deleteSession(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_exploratory_sessions').delete().eq('id', id);
  if (error) { fail('sessions', error.message); return false; }
  return true;
}
