/* ═══════════════════════════════════════════════════════════
   azureSync.ts — Sincronização em massa com o Azure DevOps.
   Percorre bugs/melhorias com Work Item ID, detecta o que mudou
   (status/estado, comentários novos) e itens novos no Azure ainda
   não importados. Resultado persiste por usuário (localStorage) e
   só é limpo no logout.
   ═══════════════════════════════════════════════════════════ */
import { listDefects, saveDefect } from './testManagement';
import { getWorkItem, getComments, fetchWorkItemStateHistory, type WorkItemStateChange } from './azureDevOps';
import type { AzureConfig } from '../types/azure';
import type { Defect, DefectKind, DefectStatus } from '../types/tests';

export interface SyncComment { author: string; text: string; date: string }
export type SyncStatusChange = WorkItemStateChange; // { from, to, by, at }

/** Uma novidade por item (bug/melhoria): histórico de mudanças de status e/ou comentários novos. */
export interface SyncItem {
  defectId: string;
  kind: DefectKind;
  azureId: number;
  /** ID do card pai no Azure (System.Parent), para agrupar. */
  cardId: number | null;
  title: string;
  /** Todas as transições de estado desde a última sincronização. */
  statusChanges?: SyncStatusChange[];
  comments?: SyncComment[];
}

export interface SyncResult {
  at: string;          // ISO da sincronização
  scanned: number;     // quantos itens com Azure ID foram verificados
  items: SyncItem[];
}

/* ── Persistência por usuário ── */
const KEY = (uid: string) => `qa_azure_sync_${uid}`;
export function loadSyncResult(uid: string): SyncResult | null {
  try {
    const r = localStorage.getItem(KEY(uid));
    if (!r) return null;
    const p = JSON.parse(r) as Partial<SyncResult>;
    // Descarta formato antigo/incompatível (ex.: sem `items`).
    if (!p || !Array.isArray(p.items)) { localStorage.removeItem(KEY(uid)); return null; }
    return p as SyncResult;
  } catch { return null; }
}
export function saveSyncResult(uid: string, r: SyncResult): void {
  try { localStorage.setItem(KEY(uid), JSON.stringify(r)); } catch { /* quota */ }
}
export function clearSyncResult(uid: string): void {
  try { localStorage.removeItem(KEY(uid)); } catch { /* noop */ }
}

/* ── Estado do Azure → status local ── */
function mapState(state: string | null): DefectStatus {
  const s = (state ?? '').toLowerCase();
  if (!s) return 'open';
  if (/(closed|done|removed|completed|fechad|conclu)/.test(s)) return 'closed';
  if (/(resolved|resolvid)/.test(s)) return 'resolved';
  if (/(progress|active|doing|committed|andamento|develop)/.test(s)) return 'in_progress';
  return 'open';
}

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

/** Parent (card) de um work item via fields. */
function parentOf(fields: Record<string, unknown>): number | null {
  const p = fields['System.Parent'];
  return p != null ? Number(p) : null;
}

/** Nome de uma identidade do Azure (string ou objeto { displayName }). */
function identityName(v: unknown): string {
  if (!v) return 'Azure';
  if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').trim() || 'Azure';
  if (typeof v === 'object' && 'displayName' in (v as Record<string, unknown>)) {
    return String((v as { displayName?: unknown }).displayName ?? 'Azure');
  }
  return 'Azure';
}

/* ── Executa a sincronização do projeto ──
   Só verifica itens que o usuário JÁ TEM (bugs/melhorias), não fechados, e
   opcionalmente restritos aos visíveis na tela (onlyDefectIds). Nada de buscar
   itens inexistentes no sistema. */
export async function runAzureSync(
  projectId: string,
  configs: AzureConfig[],
  pat: string,
  opts: { onlyDefectIds?: Set<string>; onProgress?: (done: number, total: number) => void } = {},
): Promise<SyncResult> {
  const { onlyDefectIds, onProgress } = opts;
  const at = new Date().toISOString();
  const items: SyncItem[] = [];
  const defects = await listDefects(projectId);
  const linked = defects.filter((d) =>
    d.azureWorkItemId != null && d.azureConfigId &&
    d.status !== 'closed' &&                                  // fechado não olha
    (!onlyDefectIds || onlyDefectIds.has(d.id)),              // só os visíveis/buscados
  );
  const cfgById = new Map(configs.map((c) => [c.id, c]));
  const total = linked.length;
  let done = 0;
  onProgress?.(0, total);

  for (const d of linked) {
    const cfg = cfgById.get(d.azureConfigId!);
    if (!cfg) { done++; onProgress?.(done, total); continue; }
    const apiCfg = { organization: cfg.organization, project: cfg.project, pat };
    try {
      const wi = await getWorkItem(apiCfg, d.azureWorkItemId!);
      const cardId = parentOf(wi.fields);
      const stateChanged = !!wi.state && wi.state !== d.azureState;

      const since = d.azureSyncedAt ? new Date(d.azureSyncedAt).getTime() : 0;

      /* Histórico de transições de estado desde a última sync. */
      let statusChanges: SyncStatusChange[] = [];
      if (stateChanged) {
        try {
          const hist = await fetchWorkItemStateHistory(apiCfg, d.azureWorkItemId!);
          statusChanges = hist.filter((h) => !h.at || new Date(h.at).getTime() > since);
        } catch { /* sem histórico */ }
        if (statusChanges.length === 0) {
          statusChanges = [{ from: d.azureState ?? null, to: wi.state, by: identityName(wi.fields['System.ChangedBy']), at: (wi.fields['System.ChangedDate'] as string) ?? at }];
        }
      }

      let newComments: SyncComment[] = [];
      try {
        const cms = await getComments(apiCfg, d.azureWorkItemId!);
        newComments = cms
          .filter((c) => c.createdDate && new Date(c.createdDate).getTime() > since)
          .map((c) => ({ author: c.createdBy?.displayName ?? 'Azure', text: stripTags(c.text), date: c.createdDate }));
      } catch { /* sem comentários */ }

      if (statusChanges.length > 0 || newComments.length > 0) {
        const item: SyncItem = { defectId: d.id, kind: d.kind, azureId: d.azureWorkItemId!, cardId, title: d.title };
        if (statusChanges.length > 0) item.statusChanges = statusChanges;
        if (newComments.length > 0) item.comments = newComments;
        items.push(item);
      }

      const updated: Defect = { ...d, azureSyncedAt: at };
      if (stateChanged) { updated.azureState = wi.state; updated.status = mapState(wi.state); }
      await saveDefect(updated);
    } catch { /* item falhou — segue */ }
    done++; onProgress?.(done, total);
  }

  return { at, scanned: total, items };
}
