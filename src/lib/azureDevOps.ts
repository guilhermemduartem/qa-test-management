/* ═══════════════════════════════════════════════════════════
   azureDevOps.ts — Cliente REST para Azure DevOps API.
   Autenticação via PAT (Personal Access Token).
   ═══════════════════════════════════════════════════════════ */
import type { AzureWorkItemField, AzureComment } from '../types/azure';

export interface AzureApiConfig {
  organization: string;
  project: string;
  pat: string;
}

function authHeader(pat: string): string {
  return 'Basic ' + btoa(':' + pat);
}

async function get<T>(url: string, pat: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: authHeader(pat), 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Azure ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(url: string, pat: string, body: unknown, contentType = 'application/json'): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(pat), 'Content-Type': contentType },
    body: contentType === 'application/octet-stream' ? (body as BodyInit) : JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Azure ${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(url: string, pat: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: authHeader(pat), 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Azure ${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/* ── Utilitário: achata hierarquia de nós em paths completos ── */
function flattenNodes(node: { name: string; children?: unknown[] }, prefix = ''): string[] {
  const path = prefix ? `${prefix}\\${node.name}` : node.name;
  const result = [path];
  if (node.children) {
    for (const child of node.children as typeof node[]) {
      result.push(...flattenNodes(child, path));
    }
  }
  return result;
}

/* ── Listar tipos de work item disponíveis no projeto (exclui tipos de sistema) ── */
const SYSTEM_WIT = new Set([
  'Test Plan', 'Test Suite', 'Test Case', 'Shared Steps', 'Shared Parameter',
  'Code Review Request', 'Code Review Response', 'Feedback Request', 'Feedback Response',
]);
export async function fetchWorkItemTypes(cfg: AzureApiConfig): Promise<string[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitemtypes?api-version=7.1`;
  const data = await get<{ value: { name: string; isDisabled?: boolean }[] }>(url, cfg.pat);
  return data.value
    .filter((t) => !t.isDisabled && !SYSTEM_WIT.has(t.name))
    .map((t) => t.name);
}

/* ── Listar campos de qualquer tipo de work item (genérico) ── */
export async function fetchWorkItemFields(cfg: AzureApiConfig, type: string): Promise<AzureWorkItemField[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/fields?api-version=7.1`;
  const data = await get<{ value: Record<string, unknown>[] }>(url, cfg.pat);

  const fields: AzureWorkItemField[] = data.value.map((f) => ({
    referenceName: String(f.referenceName ?? ''),
    name: String(f.name ?? ''),
    type: String(f.type ?? 'string'),
    isCustomField: String(f.referenceName ?? '').startsWith('Custom.'),
    allowedValues: Array.isArray(f.allowedValues) ? (f.allowedValues as string[]) : [],
  }));

  await Promise.all(
    fields
      .filter((f) => f.isCustomField && f.allowedValues.length === 0)
      .map(async (field) => {
        try {
          const fieldUrl = `https://dev.azure.com/${cfg.organization}/_apis/wit/fields/${encodeURIComponent(field.referenceName)}?api-version=7.1`;
          const def = await get<{ picklistId?: string; allowedValues?: string[] }>(fieldUrl, cfg.pat);
          if (Array.isArray(def.allowedValues) && def.allowedValues.length > 0) {
            field.allowedValues = def.allowedValues;
          } else if (def.picklistId) {
            const listUrl = `https://dev.azure.com/${cfg.organization}/_apis/work/processes/lists/${def.picklistId}?api-version=7.1`;
            const list = await get<{ items: string[] }>(listUrl, cfg.pat);
            field.allowedValues = (list.items ?? []).filter(Boolean);
          }
        } catch { /* picklist indisponível */ }
      }),
  );

  return fields;
}

/* ── Listar estados disponíveis para qualquer tipo ── */
export async function fetchWorkItemStates(cfg: AzureApiConfig, type: string): Promise<string[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.1`;
  const data = await get<{ value: { name: string }[] }>(url, cfg.pat);
  return data.value.map((s) => s.name);
}

/* ── Criar work item de qualquer tipo (JSON-Patch) ── */
export async function createWorkItem(cfg: AzureApiConfig, type: string, fields: Record<string, unknown>): Promise<number> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`;
  const patchOps = Object.entries(fields).map(([key, value]) => ({ op: 'add', path: `/fields/${key}`, value }));
  const data = await post<{ id: number }>(url, cfg.pat, patchOps, 'application/json-patch+json');
  return data.id;
}

/* ── Aliases para retrocompatibilidade ── */
export const fetchBugFields = (cfg: AzureApiConfig) => fetchWorkItemFields(cfg, 'Bug');
export const fetchBugStates = (cfg: AzureApiConfig) => fetchWorkItemStates(cfg, 'Bug');

/* ── Áreas do projeto (hierarquia achatada) ── */
export async function fetchAreas(cfg: AzureApiConfig): Promise<string[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/classificationnodes/Areas?$depth=20&api-version=7.1`;
  const data = await get<{ name: string; children?: unknown[] }>(url, cfg.pat);
  return flattenNodes(data);
}

/* ── Iterações do projeto (hierarquia achatada) ── */
export async function fetchIterations(cfg: AzureApiConfig): Promise<string[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/classificationnodes/Iterations?$depth=20&api-version=7.1`;
  const data = await get<{ name: string; children?: unknown[] }>(url, cfg.pat);
  return flattenNodes(data);
}

/* ── Criar Bug (JSON-Patch) ── */
export async function createBug(cfg: AzureApiConfig, fields: Record<string, unknown>): Promise<number> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitems/$Bug?api-version=7.1`;
  const patchOps = Object.entries(fields).map(([key, value]) => ({ op: 'add', path: `/fields/${key}`, value }));
  const data = await post<{ id: number }>(url, cfg.pat, patchOps, 'application/json-patch+json');
  return data.id;
}

/* ── Buscar IDs de Work Items via WIQL ── */
export async function queryWorkItemIds(cfg: AzureApiConfig, wiql: string): Promise<number[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/wiql?api-version=7.1`;
  const data = await post<{ workItems?: { id: number }[] }>(url, cfg.pat, { query: wiql });
  return (data.workItems ?? []).map((w) => w.id);
}

/* ── Buscar detalhes de vários Work Items em lote (máx. 200 por chamada) ── */
export interface AzureWorkItemSummary {
  id: number;
  title: string;
  state: string;
  severity: string | null;
  reproSteps: string | null;
  description: string | null;
  /** ID do work item pai (ex.: User Story do bug), quando houver. */
  parentId: number | null;
  /** Tipo do work item no Azure (Bug, User Story, Task, Feature, etc.). */
  workItemType: string;
  /** HTML bruto da descrição e dos repro steps (com <img> apontando p/ anexos Azure). */
  descriptionHtml: string;
  reproStepsHtml: string;
}

/* ── Extrair <img> de um HTML: src bruto (como está) + URL decodificada p/ download ── */
export function extractImgTags(html: string): { raw: string; url: string }[] {
  const out: { raw: string; url: string }[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push({ raw: m[1], url: m[1].replace(/&amp;/gi, '&') });
  }
  return out;
}

/* ── Só URLs de imagem (decodificadas) ── */
function extractImageUrls(html: string): string[] {
  return [...new Set(extractImgTags(html).map((t) => t.url))];
}

/* ── Nome de arquivo a partir da URL do anexo ── */
function attachmentFileName(url: string): string {
  try {
    const u = new URL(url);
    const fn = u.searchParams.get('fileName');
    if (fn) return fn;
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || 'imagem.png';
  } catch {
    return 'imagem.png';
  }
}

const BUG_SUMMARY_FIELDS = [
  'System.Id', 'System.Title', 'System.State', 'System.Parent', 'System.WorkItemType',
  'Microsoft.VSTS.Common.Severity', 'Microsoft.VSTS.TCM.ReproSteps', 'System.Description',
];

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getWorkItemsBatch(cfg: AzureApiConfig, ids: number[]): Promise<AzureWorkItemSummary[]> {
  const url = `https://dev.azure.com/${cfg.organization}/_apis/wit/workitemsbatch?api-version=7.1`;
  const data = await post<{ value: { id: number; fields: Record<string, unknown> }[] }>(
    url, cfg.pat, { ids, fields: BUG_SUMMARY_FIELDS },
  );
  return (data.value ?? []).map((w) => {
    const f = w.fields;
    const repro = typeof f['Microsoft.VSTS.TCM.ReproSteps'] === 'string' ? f['Microsoft.VSTS.TCM.ReproSteps'] as string : '';
    const desc = typeof f['System.Description'] === 'string' ? f['System.Description'] as string : '';
    return {
      id: w.id,
      title: String(f['System.Title'] ?? ''),
      state: String(f['System.State'] ?? ''),
      severity: f['Microsoft.VSTS.Common.Severity'] != null ? String(f['Microsoft.VSTS.Common.Severity']) : null,
      reproSteps: repro ? stripHtml(repro) : null,
      description: desc ? stripHtml(desc) : null,
      parentId: f['System.Parent'] != null ? Number(f['System.Parent']) : null,
      workItemType: String(f['System.WorkItemType'] ?? ''),
      descriptionHtml: desc,
      reproStepsHtml: repro,
    };
  });
}

async function summariesForIds(cfg: AzureApiConfig, ids: number[]): Promise<AzureWorkItemSummary[]> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return [];
  const batches: number[][] = [];
  for (let i = 0; i < uniq.length; i += 200) batches.push(uniq.slice(i, i + 200));
  const results = await Promise.all(batches.map((b) => getWorkItemsBatch(cfg, b)));
  return results.flat();
}

/* ── Cláusula WIQL de tipo: aceita 1+ tipos (IN). ── */
function typeClause(onlyTypes?: string[]): string {
  const list = (onlyTypes ?? []).filter(Boolean);
  if (list.length === 0) return '';
  const vals = list.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
  return ` AND [System.WorkItemType] IN (${vals})`;
}

/* ── Buscar work items abertos do projeto (opcionalmente filtrando por tipos) ── */
export async function fetchWorkItemsFromAzure(
  cfg: AzureApiConfig,
  opts: { onlyTypes?: string[]; openOnly?: boolean; max?: number } = {},
): Promise<AzureWorkItemSummary[]> {
  const { onlyTypes, openOnly = true, max = 200 } = opts;
  const stateF = openOnly ? ` AND [System.State] NOT IN ('Closed', 'Done', 'Resolved', 'Removed')` : '';
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project${typeClause(onlyTypes)}${stateF} ORDER BY [System.ChangedDate] DESC`;
  const ids = (await queryWorkItemIds(cfg, wiql)).slice(0, max);
  return summariesForIds(cfg, ids);
}

/* ── Buscar work items por 1+ IDs de card (filhos via System.Parent) ou pelo próprio ID ── */
export async function fetchWorkItemsByCardIds(
  cfg: AzureApiConfig,
  cardIds: number[],
  opts: { onlyTypes?: string[] } = {},
): Promise<AzureWorkItemSummary[]> {
  const ids = [...new Set(cardIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return [];
  const inList = ids.join(', ');
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project${typeClause(opts.onlyTypes)} AND ([System.Parent] IN (${inList}) OR [System.Id] IN (${inList})) ORDER BY [System.ChangedDate] DESC`;
  const found = await queryWorkItemIds(cfg, wiql);
  return summariesForIds(cfg, found);
}
export const fetchWorkItemsByCard = (cfg: AzureApiConfig, cardId: number, opts: { onlyTypes?: string[] } = {}) =>
  fetchWorkItemsByCardIds(cfg, [cardId], opts);

/* ── Atalhos para bugs (retrocompat): inclui Bug + sub_bug ── */
export const BUG_WORK_ITEM_TYPES = ['Bug', 'sub_bug'];
export const fetchBugsFromAzure = (cfg: AzureApiConfig, max = 200) => fetchWorkItemsFromAzure(cfg, { onlyTypes: BUG_WORK_ITEM_TYPES, openOnly: true, max });
export const fetchBugsByCard = (cfg: AzureApiConfig, cardId: number) => fetchWorkItemsByCard(cfg, cardId, { onlyTypes: BUG_WORK_ITEM_TYPES });

/* ── Baixar um anexo do Azure (precisa do PAT) como Blob ── */
export async function downloadAttachment(cfg: AzureApiConfig, url: string): Promise<Blob> {
  const res = await fetch(url, { headers: { Authorization: authHeader(cfg.pat) } });
  if (!res.ok) throw new Error(`Azure ${res.status}`);
  return res.blob();
}

/** Nome de arquivo sugerido para um anexo (exportado p/ reuso). */
export function attachmentNameFromUrl(url: string): string {
  return attachmentFileName(url);
}

/* ── Substitui imagens de anexos Azure (protegidas por PAT) por blob URLs,
      para exibir inline dentro de cada comentário. `trackUrl` recebe cada blob
      URL criado para que o chamador possa revogá-lo (URL.revokeObjectURL). ── */
export async function inlineCommentImages(
  cfg: AzureApiConfig,
  comments: AzureComment[],
  trackUrl: (u: string) => void,
): Promise<AzureComment[]> {
  return Promise.all(comments.map(async (cm) => {
    const tags = extractImgTags(cm.text ?? '').filter((t) => /_apis\/wit\/attachments/i.test(t.url));
    if (tags.length === 0) return cm;
    let text = cm.text;
    for (const { raw, url } of tags) {
      try {
        const blob = await downloadAttachment(cfg, url);
        const obj = URL.createObjectURL(blob);
        trackUrl(obj);
        text = text.split(raw).join(obj);
      } catch { /* mantém original */ }
    }
    return { ...cm, text };
  }));
}

/* ── URLs de imagens presentes nos comentários de um work item ── */
export async function fetchCommentImageUrls(cfg: AzureApiConfig, workItemId: number): Promise<string[]> {
  try {
    const comments = await getComments(cfg, workItemId);
    const urls = comments.flatMap((c) => extractImageUrls(c.text ?? ''));
    return [...new Set(urls)];
  } catch {
    return [];
  }
}

/* ── Histórico de mudanças de estado de um Work Item (API de updates) ── */
export interface WorkItemStateChange { from: string | null; to: string; by: string; at: string }
export async function fetchWorkItemStateHistory(cfg: AzureApiConfig, id: number): Promise<WorkItemStateChange[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workItems/${id}/updates?api-version=7.1`;
  const data = await get<{ value?: Array<{ revisedBy?: { displayName?: string }; revisedDate?: string; fields?: Record<string, { oldValue?: unknown; newValue?: unknown }> }> }>(url, cfg.pat);
  const out: WorkItemStateChange[] = [];
  for (const u of data.value ?? []) {
    const sf = u.fields?.['System.State'];
    if (!sf || sf.newValue == null) continue;
    const byField = u.fields?.['System.ChangedBy']?.newValue as { displayName?: string } | string | undefined;
    const by = u.revisedBy?.displayName
      ?? (typeof byField === 'object' ? byField?.displayName : byField)
      ?? 'Azure';
    const at = (u.fields?.['System.ChangedDate']?.newValue as string | undefined) ?? u.revisedDate ?? '';
    out.push({ from: sf.oldValue != null ? String(sf.oldValue) : null, to: String(sf.newValue), by: String(by), at: String(at) });
  }
  return out;
}

/* ── Obter Work Item (para sincronização) ── */
export async function getWorkItem(cfg: AzureApiConfig, id: number): Promise<{ state: string; fields: Record<string, unknown> }> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitems/${id}?api-version=7.1`;
  const data = await get<{ fields: Record<string, unknown> }>(url, cfg.pat);
  return { state: String(data.fields['System.State'] ?? ''), fields: data.fields };
}

/* ── Upload de anexo ── */
export async function uploadAttachment(cfg: AzureApiConfig, fileName: string, content: Blob): Promise<string> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&api-version=7.1`;
  const data = await post<{ url: string }>(url, cfg.pat, content, 'application/octet-stream');
  return data.url;
}

/* ── Vincular anexo ao Work Item ── */
export async function linkAttachment(cfg: AzureApiConfig, workItemId: number, attachmentUrl: string): Promise<void> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
  await patch(url, cfg.pat, [{ op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url: attachmentUrl } }]);
}

/* ── Listar usuários da organização (para campo Owner/AssignedTo) ── */
export interface AzureUser {
  displayName: string;
  principalName: string;
}
export async function fetchUsers(cfg: AzureApiConfig): Promise<AzureUser[]> {
  const url = `https://vssps.dev.azure.com/${cfg.organization}/_apis/graph/users?api-version=7.1-preview.1`;
  try {
    const data = await get<{ value: { displayName: string; principalName: string }[] }>(url, cfg.pat);
    return (data.value ?? []).map((u) => ({ displayName: u.displayName ?? '', principalName: u.principalName ?? '' }));
  } catch {
    return [];
  }
}

/* ── Atualizar campos de um Work Item existente (PATCH) ── */
export async function updateWorkItemFields(cfg: AzureApiConfig, workItemId: number, fields: Record<string, unknown>): Promise<void> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
  const ops = Object.entries(fields).map(([key, value]) => ({ op: 'add', path: `/fields/${key}`, value }));
  await patch(url, cfg.pat, ops);
}

/* ── Adicionar comentário ── */
export async function addComment(cfg: AzureApiConfig, workItemId: number, text: string): Promise<AzureComment> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`;
  return post<AzureComment>(url, cfg.pat, { text });
}

/* ── Listar comentários ── */
export async function getComments(cfg: AzureApiConfig, workItemId: number): Promise<AzureComment[]> {
  const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(cfg.project)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`;
  const data = await get<{ comments: AzureComment[] }>(url, cfg.pat);
  return data.comments ?? [];
}

/* ── Usuário autenticado pelo PAT ── */
export async function getMyAzureId(cfg: AzureApiConfig): Promise<string | null> {
  try {
    const url = `https://dev.azure.com/${cfg.organization}/_apis/connectionData`;
    const data = await get<{ authenticatedUser?: { id?: string } }>(url, cfg.pat);
    return data.authenticatedUser?.id ?? null;
  } catch {
    return null;
  }
}

/* ── Teste de conexão ── */
export async function testConnection(cfg: AzureApiConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetchBugStates(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Estados "fechados" no Azure ── */
export const AZURE_CLOSED_STATES = new Set(['Closed', 'Done', 'Resolved', 'Removed']);
