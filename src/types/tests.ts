/* ═══════════════════════════════════════════════════════════
   types/tests.ts — Tipos do módulo de Gestão de Testes.
   Isolado do src/types.ts (relatório) para não poluí-lo.
   ═══════════════════════════════════════════════════════════ */

export type TestType = 'manual' | 'automated' | 'api' | 'exploratory';
export type TestPriority = 'low' | 'medium' | 'high' | 'critical';
export type TestCaseStatus = 'draft' | 'active' | 'deprecated';
export type MilestoneStatus = 'open' | 'completed' | 'cancelled';
export type RunStatus = 'open' | 'in_progress' | 'closed';
export type ResultStatus = 'untested' | 'passed' | 'failed' | 'blocked' | 'skipped' | 'retest';
export type DefectSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DefectStatus = 'pending_azure' | 'open' | 'in_progress' | 'resolved' | 'closed';
/** Tipo do registro: bug (defeito) ou improvement (melhoria). Mesma tabela. */
export type DefectKind = 'bug' | 'improvement';

export interface TestProject {
  id: string;
  name: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface TestSuite {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: string;
}

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestCase {
  id: string;
  suiteId: string | null;
  projectId: string;
  planId: string | null;
  title: string;
  type: TestType;
  priority: TestPriority;
  status: TestCaseStatus;
  preconditions: string;
  steps: TestStep[];
  expectedResult: string;
  tags: string[];
  customFields: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface TestCaseVersion {
  id: string;
  caseId: string;
  snapshot: Partial<TestCase>;
  savedBy: string | null;
  savedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string | null;
  status: MilestoneStatus;
  createdAt: string;
}

export type SprintStatus = 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';

export interface Sprint {
  id: string;
  projectId: string;
  milestoneId: string | null;
  name: string;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export type CardStatus = 'pendente' | 'em_andamento' | 'concluida';

export interface Card {
  id: string;
  projectId: string;
  sprintId: string | null;
  milestoneId: string | null;
  azureId: number | null;
  title: string;
  objetivo: string;
  resumo: string;
  checklist: string;
  status: CardStatus;
  createdAt: string;
}

export type PlanStatus = 'pendente' | 'em_teste' | 'com_bug' | 'bloqueado' | 'finalizado' | 'cancelado';

export interface TestPlan {
  id: string;
  projectId: string;
  milestoneId: string | null;
  sprintId: string | null;
  cardId: string | null;
  name: string;
  scope: string;
  status: PlanStatus;
  createdBy: string | null;
  createdAt: string;
}

export interface TestRun {
  id: string;
  projectId: string;
  planId: string | null;
  name: string;
  status: RunStatus;
  assignedTo: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Série de re-testes: ciclos da mesma série compartilham o seriesId. */
  seriesId: string;
  /** Número do ciclo dentro da série (1, 2, 3…). */
  cycle: number;
  /** Ambiente em que a execução está sendo rodada (DEV ORION, TST, etc.). */
  ambiente: string | null;
  /** Company/cliente testada (Bedsonline, Cativa, Flot, Smiles, Azul). */
  company: string | null;
  /** Versão do backoffice testada. */
  versaoBackoffice: string | null;
  /** Versão do B2B testada. */
  versaoB2b: string | null;
}

export interface Evidence {
  name: string;
  url: string;
}

/** Resultado de um passo individual do cenário, dentro de um TestRunResult.
    Alinhado por índice aos steps do TestCase (stepResults[i] ↔ steps[i]). */
export interface StepResult {
  status: ResultStatus;
  comment: string;
  evidence: Evidence[];
}

export interface TestRunResult {
  id: string;
  runId: string;
  caseId: string;
  status: ResultStatus;
  executedBy: string | null;
  executedAt: string | null;
  elapsedSeconds: number;
  comment: string;
  evidence: Evidence[];
  /** Ordem de execução do caso dentro da execução. */
  position: number;
  /** Resultado por passo do cenário (1 entrada por step do caso). */
  stepResults: StepResult[];
}

export interface Requirement {
  id: string;
  projectId: string;
  externalKey: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface CaseRequirement {
  caseId: string;
  requirementId: string;
}

export interface Defect {
  id: string;
  projectId: string;
  /** bug (defeito) ou improvement (melhoria). */
  kind: DefectKind;
  runResultId: string | null;
  cardId: string | null;
  planId: string | null;
  title: string;
  description: string;
  severity: DefectSeverity;
  status: DefectStatus;
  externalKey: string | null;
  createdBy: string | null;
  createdAt: string;
  evidence: Evidence[];
  /* Azure DevOps integration (optional) */
  azureWorkItemId: number | null;
  azureConfigId: string | null;
  azureTemplateId: string | null;
  azureState: string | null;
  azureSyncedAt: string | null;
  azureCustomFields: Record<string, unknown>;
}

export type SessionStatus = 'open' | 'closed';

export type ExploratoryNoteType = 'note' | 'bug' | 'idea' | 'blocker' | 'improvement';

export interface ExploratoryNote {
  at: string;
  text: string;
  noteType?: ExploratoryNoteType;
  bugId?: string;
  evidence?: Evidence[];
}

export interface ExploratorySession {
  id: string;
  projectId: string;
  charter: string;
  planId: string | null;
  ambiente: string | null;
  company: string | null;
  versaoBackoffice: string | null;
  versaoB2b: string | null;
  notes: ExploratoryNote[];
  durationSeconds: number;
  status: SessionStatus;
  createdBy: string | null;
  createdAt: string;
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  open: 'Aberta', closed: 'Fechada',
};

export const SESSION_STATUS_COLOR: Record<SessionStatus, string> = {
  open: '#60a5fa', closed: '#10b981',
};

/* ── Rótulos PT-BR para enums (UI) ── */
export const TYPE_LABEL: Record<TestType, string> = {
  manual: 'Manual', automated: 'Automatizado', api: 'API', exploratory: 'Exploratório',
};
export const PRIORITY_LABEL: Record<TestPriority, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica',
};
export const CASE_STATUS_LABEL: Record<TestCaseStatus, string> = {
  draft: 'Rascunho', active: 'Ativo', deprecated: 'Descontinuado',
};
export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  open: 'Aberta', in_progress: 'Em andamento', closed: 'Fechada',
};
export const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  untested: 'Não testado', passed: 'Passou', failed: 'Falhou',
  blocked: 'Bloqueado', skipped: 'Pulado', retest: 'Reteste',
};
export const DEFECT_SEVERITY_LABEL: Record<DefectSeverity, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica',
};
export const DEFECT_STATUS_LABEL: Record<DefectStatus, string> = {
  pending_azure: 'Ag. Azure', open: 'Aberto', in_progress: 'Em andamento', resolved: 'Resolvido', closed: 'Fechado',
};
