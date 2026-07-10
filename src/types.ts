/* ═══════════════════════════════════════════════════════════
   types.ts — Modelos de dados do QA Reporter
   ═══════════════════════════════════════════════════════════ */

export type Status = 'pending' | 'approved' | 'rejected' | 'partial';
export type Role =
  | 'viewer'
  | 'intern'
  | 'qa'
  | 'developer'
  | 'senior_developer'
  | 'tech_lead'
  | 'devops'
  | 'architect'
  | 'scrum_master'
  | 'product_owner'
  | 'product_manager'
  | 'engineering_manager'
  | 'director_engineering'
  | 'admin'
  | 'master_admin';

export interface ReportImage {
  id: string;
  dataUrl?: string;
  name: string;
  cacheKey?: string;
  /** Imagem já persistida no banco — não precisa de re-upload ao salvar. */
  dbStored?: boolean;
}

export interface Step {
  id: string;
  text: string;
}

export interface Criterion {
  id: string;
  title: string;
  description: string;
  expectedResult: string;
  steps: Step[];
  obtainedResult: string;
  status: Status;
  images: ReportImage[];
  collapsed: boolean;
}

export interface Report {
  id: string;
  createdAt: string;
  updatedAt: string;
  company: {
    name: string;
    logoUrl: string;
  };
  story: {
    id: string;
    title: string;
    description: string;
    system: string;
    module: string;
    sprint: string;
    environment: string;
  };
  criteria: Criterion[];
  additionalData: {
    responsible: string;
    testDate: string;
    versionBko: string;
    versionPortal: string;
    notes: string;
  };
  finalStatus: Status;
}

export interface Settings {
  theme: 'dark' | 'light';
}

/* ── Auth ── */
export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  createdAt: string;
  avatarUrl?: string;
}

export interface Session {
  id: string;
  nome: string;
  login: string;
  role: Role;
  /** Token opaco da sessão (anti-adulteração simples). */
  token: string;
  /** Epoch ms de criação da sessão. */
  issuedAt: number;
  /** Epoch ms de expiração (issuedAt + 8h). */
  expiresAt: number;
}

/* ── Templates / History ── */
export interface Template {
  id: string;
  name: string;
  savedAt: string;
  /** Data de criação (1ª vez). Pode faltar em templates legados → usar savedAt. */
  createdAt?: string;
  criteriaCount: number;
  snapshot: Report | null;
  createdBy?: string | null;
  /** Metadados da User Story denormalizados para listagem (sem carregar snapshot). */
  system?: string | null;
  module?: string | null;
  sprint?: string | null;
  environment?: string | null;
  finalStatus?: Status | null;
  /** Contagem de critérios por status, ex.: { pending: 5, approved: 3 }. */
  criteriaStatus?: Partial<Record<Status, number>> | null;
  fullSnapshot?: Report | null;
}

export interface HistoryEntry {
  id: string;
  savedAt: string;
  storyId: string;
  storyTitle: string;
  criteriaCount: number;
  snapshot: Report;
  createdBy?: string;
}

/* ── Report Data (passo a passo / ações) ── */
export interface ReportDataEntry {
  id: string;
  texto: string;
  acoes: string;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string | null;
}
