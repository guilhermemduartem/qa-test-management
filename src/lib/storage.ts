/* ═══════════════════════════════════════════════════════════
   storage.ts — LocalStorage, History & Templates (porta de js/storage.js)
   Mantém a MESMA lógica/ordem das operações de imagens de template.
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';
import { showToast } from './toast';
import { currentUser } from './auth';
import { formatDateForFilename, generateId, stripBold } from './utils';
import type { Report, Settings, Template, HistoryEntry, Criterion, ReportImage } from '../types';

const STORAGE_KEYS = {
  CURRENT: 'qar_current',
  HISTORY: 'qar_history',
  TEMPLATES: 'qar_templates',
  SETTINGS: 'qar_settings',
};

const SUPABASE_TABLES = {
  TEMPLATES: 'qa_templates',
  TEMPLATE_IMAGES: 'qa_template_images',
};

let _supabaseTemplateWarned = false;

const IMAGE_CACHE_DB_NAME = 'qar_cache_db';
const IMAGE_CACHE_STORE = 'images';
const IMAGE_CACHE_VERSION = 1;
const CACHE_PURGED_FLAG = 'qar_cache_purged_v1';
const MAX_TEMPLATE_IMAGE_DATA_URL_LENGTH = 1200000;

const MAX_HISTORY = 50;
let _templatesMemory: Template[] | null = null;

function purgeNonReportCacheIfNeeded(): void {
  try {
    if (localStorage.getItem(CACHE_PURGED_FLAG) === '1') return;

    // Mantém apenas o cache do relatório atual (qar_current).
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    localStorage.removeItem(STORAGE_KEYS.TEMPLATES);

    if (window.indexedDB && typeof indexedDB.deleteDatabase === 'function') {
      indexedDB.deleteDatabase(IMAGE_CACHE_DB_NAME);
    }

    localStorage.setItem(CACHE_PURGED_FLAG, '1');
  } catch (e) {
    console.warn('Falha ao limpar caches antigos:', e);
  }
}

purgeNonReportCacheIfNeeded();

/* ─── Settings ─── */
export function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '') || { theme: 'dark' };
  } catch {
    return { theme: 'dark' };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

/* ─── Current Report ─── */
export function saveCurrentReport(report: Report): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS.CURRENT, JSON.stringify(report));
    return true;
  } catch (e) {
    console.warn('Storage full or unavailable:', e);
    return false;
  }
}

export function loadCurrentReport(): Report | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ─── History ─── */
export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]') || [];
  } catch {
    return [];
  }
}

export function saveHistory(history: HistoryEntry[]): boolean {
  const fallbackLimits = [history.length, 20, 10, 5, 2, 1];
  const tried = new Set<number>();

  for (const limit of fallbackLimits) {
    const safeLimit = Math.max(0, Math.min(limit, history.length));
    if (tried.has(safeLimit)) continue;
    tried.add(safeLimit);

    try {
      const payload = safeLimit === history.length ? history : history.slice(0, safeLimit);
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(payload));
      return true;
    } catch {
      // Try with fewer entries.
    }
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
  } catch {
    // No-op.
  }
  return false;
}

export function addToHistory(report: Report, createdBy?: string): void {
  const history = loadHistory();
  const existing = history.findIndex((h) => h.id === report.id);
  const entry: HistoryEntry = {
    id: report.id,
    savedAt: new Date().toISOString(),
    storyId: report.story.id || '',
    storyTitle: stripBold(report.story.title) || 'Sem título',
    criteriaCount: (report.criteria || []).length,
    snapshot: JSON.parse(JSON.stringify(report)),
  };
  if (createdBy) entry.createdBy = createdBy;

  if (existing >= 0) {
    history[existing] = entry;
  } else {
    history.unshift(entry);
  }

  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  saveHistory(history);
}

export function deleteFromHistory(id: string): void {
  const history = loadHistory().filter((h) => h.id !== id);
  saveHistory(history);
}

export function clearHistory(): void {
  saveHistory([]);
}

/* ─── Templates ─── */
export function loadTemplates(): Template[] {
  if (Array.isArray(_templatesMemory)) return _templatesMemory;

  try {
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATES) || '[]') || [];
    _templatesMemory = Array.isArray(legacy) ? legacy : [];
  } catch {
    _templatesMemory = [];
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
  } catch {
    /* no-op */
  }
  return _templatesMemory;
}

export function saveTemplates(templates: Template[]): boolean {
  _templatesMemory = Array.isArray(templates) ? templates : [];
  return true;
}

function _warnTemplateSync(message: string): void {
  if (_supabaseTemplateWarned) return;
  _supabaseTemplateWarned = true;
  showToast(message, 'warning');
}

interface RemoteTemplate {
  id: string;
  name: string;
  saved_at: string;
  created_at: string | null;
  criteria_count: number;
  snapshot: Report | null;
  created_by: string | null;
  system: string | null;
  module: string | null;
  sprint: string | null;
  environment: string | null;
  final_status: string | null;
  criteria_status: Record<string, number> | null;
}

function toRemoteTemplate(t: Template): RemoteTemplate {
  return {
    id: t.id,
    name: t.name,
    saved_at: t.savedAt,
    created_at: t.createdAt || t.savedAt,
    criteria_count: t.criteriaCount,
    snapshot: t.snapshot,
    created_by: t.createdBy || null,
    system: t.system || null,
    module: t.module || null,
    sprint: t.sprint || null,
    environment: t.environment || null,
    final_status: t.finalStatus || null,
    criteria_status: t.criteriaStatus || null,
  };
}

function fromRemoteTemplate(row: RemoteTemplate): Template {
  return {
    id: row.id,
    name: row.name,
    savedAt: row.saved_at,
    createdAt: row.created_at || row.saved_at,
    criteriaCount: row.criteria_count,
    snapshot: row.snapshot,
    createdBy: row.created_by || null,
    system: row.system || null,
    module: row.module || null,
    sprint: row.sprint || null,
    environment: row.environment || null,
    finalStatus: (row.final_status as Template['finalStatus']) || null,
    criteriaStatus: (row.criteria_status as Template['criteriaStatus']) || null,
  };
}

export async function syncTemplatesFromSupabase(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { data, error } = await client
    .from(SUPABASE_TABLES.TEMPLATES)
    .select('id,name,saved_at,created_at,criteria_count,snapshot,created_by,system,module,sprint,environment,final_status,criteria_status')
    .order('saved_at', { ascending: false });

  if (error) {
    console.warn('[storage] Falha ao sincronizar templates do Supabase:', error.message);
    _warnTemplateSync('Templates do Supabase indisponiveis. Usando dados locais.');
    return false;
  }

  saveTemplates((data || []).map(fromRemoteTemplate));
  return true;
}

export async function syncTemplateListFromSupabase(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { data, error } = await client
    .from(SUPABASE_TABLES.TEMPLATES)
    .select('id,name,saved_at,created_at,criteria_count,created_by,system,module,sprint,environment,final_status,criteria_status')
    .order('saved_at', { ascending: false });

  if (error) {
    console.warn('[storage] Falha ao sincronizar lista de templates do Supabase:', error.message);
    _warnTemplateSync('Templates do Supabase indisponiveis. Usando dados locais.');
    return false;
  }

  const current = loadTemplates();
  const byId = new Map(current.map((t) => [t.id, t]));
  const mapped: Template[] = (data || []).map((row: Omit<RemoteTemplate, 'snapshot'>) => {
    const prev = byId.get(row.id);
    return {
      id: row.id,
      name: row.name,
      savedAt: row.saved_at,
      createdAt: row.created_at || row.saved_at,
      criteriaCount: row.criteria_count,
      createdBy: row.created_by || null,
      system: row.system || null,
      module: row.module || null,
      sprint: row.sprint || null,
      environment: row.environment || null,
      finalStatus: (row.final_status as Template['finalStatus']) || null,
      criteriaStatus: (row.criteria_status as Template['criteriaStatus']) || null,
      snapshot: prev?.snapshot || null,
    };
  });

  saveTemplates(mapped);
  return true;
}

export async function fetchTemplateSnapshotFromSupabase(id: string): Promise<Report | null> {
  const client = getSupabaseClient();
  if (!client || !id) return null;

  const { data, error } = await client
    .from(SUPABASE_TABLES.TEMPLATES)
    .select('snapshot')
    .eq('id', id)
    .single();

  if (error) {
    console.warn('[storage] Falha ao buscar snapshot do template no Supabase:', error.message);
    return null;
  }

  const snapshot = (data?.snapshot as Report) || null;
  if (!snapshot) return null;

  return await attachTemplateImagesFromSupabase(id, snapshot);
}

interface ImageRow {
  template_id: string;
  criterion_id: string;
  image_id: string;
  name: string | null;
  sort_order: number;
  data_url: string;
}

async function upsertTemplateToSupabase(
  template: Template,
  imageRows: ImageRow[] = [],
  onProgress?: (msg: string) => void,
  keepKeys?: Set<string>,
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const templateId = template?.id;
  // Usa snapshot sem imagens: imagens ficam em qa_template_images.
  // Salvar o snapshot completo (com dataUrls) na coluna do template causava timeout.
  const strippedSnapshot = template?.snapshot;
  const safeTemplate: Template = { ...template, snapshot: strippedSnapshot || null };

  const { error } = await client
    .from(SUPABASE_TABLES.TEMPLATES)
    .upsert([toRemoteTemplate(safeTemplate)], { onConflict: 'id' });

  if (error) {
    console.warn('[storage] Falha ao salvar template no Supabase:', error);
    showToast(`Erro ao salvar template: ${error.message} (${error.code})`, 'error');
    return false;
  }

  if (!templateId) return true;

  // 1. Upsert de imagens novas/modificadas
  if (Array.isArray(imageRows) && imageRows.length > 0) {
    const BATCH = 3;
    for (let idx = 0; idx < imageRows.length; idx += BATCH) {
      const batch = imageRows.slice(idx, idx + BATCH);
      const end = Math.min(idx + BATCH, imageRows.length);
      onProgress?.(`Salvando imagens ${idx + 1}–${end} de ${imageRows.length} no banco…`);
      const { error: insertImagesError } = await client
        .from(SUPABASE_TABLES.TEMPLATE_IMAGES)
        .upsert(batch, { onConflict: 'template_id,criterion_id,image_id' });

      if (insertImagesError) {
        console.warn('[storage] Falha ao salvar imagens do template no Supabase:', insertImagesError.message);
        showToast(`Falha ao salvar imagens no banco: ${insertImagesError.message} (${insertImagesError.code})`, 'error');
        return false;
      }
    }
  }

  // 2. Stale cleanup: remove imagens que foram deletadas do snapshot.
  //    Roda sempre que há imagens no banco (keepKeys presente) OU quando o
  //    template ficou sem imagens (keepKeys vazio → deleta tudo).
  const effectiveKeepKeys = keepKeys ?? new Set(imageRows.map((r) => `${r.criterion_id}::${r.image_id}`));

  if (effectiveKeepKeys.size > 0) {
    // Preserva imagens do keepKeys, remove as que saíram do snapshot.
    const { data: existingRows, error: existingRowsError } = await client
      .from(SUPABASE_TABLES.TEMPLATE_IMAGES)
      .select('criterion_id,image_id')
      .eq('template_id', templateId);

    if (existingRowsError) {
      console.warn('[storage] Falha ao listar imagens para limpeza:', existingRowsError.message);
      _warnTemplateSync('Template salvo, mas houve falha ao sincronizar limpeza de imagens no Supabase.');
      return false;
    }

    const staleRows = (existingRows || []).filter(
      (r: { criterion_id: string; image_id: string }) =>
        !effectiveKeepKeys.has(`${r.criterion_id}::${r.image_id}`),
    );

    for (const row of staleRows) {
      const { error: deleteStaleError } = await client
        .from(SUPABASE_TABLES.TEMPLATE_IMAGES)
        .delete()
        .eq('template_id', templateId)
        .eq('criterion_id', row.criterion_id)
        .eq('image_id', row.image_id);

      if (deleteStaleError) {
        console.warn('[storage] Falha ao remover imagem antiga do template:', deleteStaleError.message);
        _warnTemplateSync('Template salvo, mas houve falha ao remover imagens antigas no Supabase.');
        return false;
      }
    }
  } else {
    // Nenhuma imagem no snapshot → limpa tudo do banco.
    const { error: clearImagesError } = await client
      .from(SUPABASE_TABLES.TEMPLATE_IMAGES)
      .delete()
      .eq('template_id', templateId);

    if (clearImagesError) {
      console.warn('[storage] Falha ao limpar imagens do template sem imagens:', clearImagesError.message);
      _warnTemplateSync('Template salvo, mas houve falha ao limpar imagens no Supabase.');
      return false;
    }
  }

  // Só troca para snapshot enxuto depois de toda a sincronização de imagens ter dado certo.
  const finalTemplate: Template = { ...template, snapshot: strippedSnapshot || null };

  const { error: finalTemplateError } = await client
    .from(SUPABASE_TABLES.TEMPLATES)
    .upsert([toRemoteTemplate(finalTemplate)], { onConflict: 'id' });

  if (finalTemplateError) {
    console.warn('[storage] Falha ao finalizar snapshot enxuto do template no Supabase:', finalTemplateError.message);
    _warnTemplateSync('Template salvo, mas houve falha ao finalizar sincronizacao no Supabase.');
    return false;
  }

  return true;
}

async function deleteTemplateFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client.from(SUPABASE_TABLES.TEMPLATES).delete().eq('id', id);

  if (error) {
    console.warn('[storage] Falha ao excluir template no Supabase:', error.message);
    _warnTemplateSync('Nao foi possivel excluir template no Supabase. Alteracao local aplicada.');
    return false;
  }
  return true;
}

/* ─── IndexedDB image cache ─── */
function openImageCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB indisponivel'));
      return;
    }

    const request = indexedDB.open(IMAGE_CACHE_DB_NAME, IMAGE_CACHE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_CACHE_STORE)) {
        db.createObjectStore(IMAGE_CACHE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir cache de imagens'));
  });
}

export async function setCachedImageDataUrl(cacheKey: string, dataUrl: string): Promise<void> {
  try {
    const db = await openImageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
      const req = tx.objectStore(IMAGE_CACHE_STORE).put({ dataUrl }, cacheKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Falha ao salvar imagem no cache'));
    });
    db.close();
  } catch {
    // ignore cache write failures
  }
}

export async function getCachedImageDataUrl(cacheKey?: string): Promise<string | null> {
  if (!cacheKey) return null;

  try {
    const db = await openImageCacheDb();
    const record = await new Promise<{ dataUrl?: string } | null>((resolve, reject) => {
      const tx = db.transaction(IMAGE_CACHE_STORE, 'readonly');
      const req = tx.objectStore(IMAGE_CACHE_STORE).get(cacheKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Falha ao ler imagem do cache'));
    });

    db.close();
    return record?.dataUrl || null;
  } catch {
    return null;
  }
}

async function cacheTemplateSnapshotImages(snapshot: Report): Promise<Report> {
  const clone: Report = JSON.parse(JSON.stringify(snapshot));
  const criteria = clone.criteria || [];

  for (const c of criteria) {
    const originalImages = Array.isArray(c.images) ? c.images : [];
    const nextImages: ReportImage[] = [];

    for (const img of originalImages) {
      if (!img || typeof img !== 'object') continue;

      // Imagem do banco: passa adiante com o flag intacto para splitTemplateSnapshotImages
      // poder pular o re-upload. Sem esse early-return o flag seria apagado abaixo.
      if (img.dbStored) { nextImages.push(img); continue; }

      if (typeof img.dataUrl === 'string' && img.dataUrl.trim()) {
        nextImages.push({ id: img.id, name: img.name, dataUrl: img.dataUrl });
        continue;
      }

      if (img.cacheKey) {
        const dataUrl = await getCachedImageDataUrl(img.cacheKey);
        if (dataUrl) {
          nextImages.push({ id: img.id, name: img.name, dataUrl });
        }
      }
    }

    c.images = nextImages;
  }

  return clone;
}

async function optimizeDataUrlForDatabase(dataUrl: string): Promise<string> {
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) return '';
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrl.length <= MAX_TEMPLATE_IMAGE_DATA_URL_LENGTH) return dataUrl;

  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao preparar imagem para compressao'));
      img.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    let maxSide = 1600;
    let quality = 0.82;
    let output = dataUrl;

    for (let attempt = 0; attempt < 5; attempt++) {
      const largest = Math.max(source.width, source.height) || 1;
      const ratio = Math.min(1, maxSide / largest);
      canvas.width = Math.max(1, Math.floor(source.width * ratio));
      canvas.height = Math.max(1, Math.floor(source.height * ratio));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      output = canvas.toDataURL('image/jpeg', quality);
      if (output.length <= MAX_TEMPLATE_IMAGE_DATA_URL_LENGTH) return output;

      maxSide = Math.max(700, Math.floor(maxSide * 0.78));
      quality = Math.max(0.55, quality - 0.1);
    }

    return output;
  } catch {
    return dataUrl;
  }
}

function normalizeCriteriaIds(criteria: Criterion[]): Criterion[] {
  const list = Array.isArray(criteria) ? criteria : [];
  const used = new Set(list.map((c) => String(c.id || '').trim()).filter(Boolean));

  for (let i = 0; i < list.length; i++) {
    const c = list[i] || ({} as Criterion);
    const base = String(c.id || '').trim();
    if (!base) {
      const fallback = `criterion_${i + 1}`;
      let next = fallback;
      let suffix = 2;
      while (used.has(next)) {
        next = `${fallback}_${suffix}`;
        suffix++;
      }
      c.id = next;
      used.add(next);
      list[i] = c;
    }
  }
  return list;
}

function cloneSnapshotWithNormalizedCriteriaIds(snapshot: Report): Report {
  const clone: Report = JSON.parse(JSON.stringify(snapshot || {}));
  clone.criteria = normalizeCriteriaIds(clone.criteria || []);
  return clone;
}

/** Conta o total de imagens do relatório (todos os critérios). */
function countReportImages(report: Report): number {
  return (report.criteria || []).reduce(
    (n, c) => n + (Array.isArray(c.images) ? c.images.length : 0),
    0,
  );
}

async function splitTemplateSnapshotImages(
  templateId: string,
  snapshot: Report,
  onProgress?: (msg: string) => void,
): Promise<{ snapshot: Report; imageRows: ImageRow[]; keepKeys: Set<string> }> {
  const clone: Report = JSON.parse(JSON.stringify(snapshot));
  const criteria = normalizeCriteriaIds(clone.criteria || []);
  const rows: ImageRow[] = [];
  // Todas as imagens ainda presentes no snapshot (com ou sem dataUrl)
  // devem ser preservadas no banco — só deletamos as que o user removeu.
  const keepKeys = new Set<string>();

  const totalImages = criteria.reduce((n, c) => n + (Array.isArray(c.images) ? c.images.length : 0), 0);
  let processed = 0;

  for (const c of criteria) {
    const criterionId = String(c.id);
    const originalImages = Array.isArray(c.images) ? c.images : [];
    const strippedImages: ReportImage[] = [];

    for (let i = 0; i < originalImages.length; i++) {
      const img = originalImages[i];
      if (!img || typeof img !== 'object') continue;

      const imageId = String(img.id || `img_${i + 1}`);
      const imageName = typeof img.name === 'string' ? img.name : null;
      strippedImages.push({ id: imageId, name: imageName || '' });
      keepKeys.add(`${criterionId}::${imageId}`);

      // Imagem já persistida no banco sem modificação — preserva via keepKeys, sem re-upsert.
      if (img.dbStored) { processed++; continue; }

      let dataUrl = '';
      if (typeof img.dataUrl === 'string' && img.dataUrl.trim()) {
        dataUrl = img.dataUrl;
      } else if (img.cacheKey) {
        dataUrl = (await getCachedImageDataUrl(img.cacheKey)) || '';
      }

      if (!dataUrl) { processed++; continue; }

      processed++;
      onProgress?.(`Comprimindo imagem ${processed} de ${totalImages}…`);
      dataUrl = await optimizeDataUrlForDatabase(dataUrl);

      rows.push({
        template_id: templateId,
        criterion_id: criterionId,
        image_id: imageId,
        name: imageName,
        sort_order: i,
        data_url: dataUrl,
      });
    }

    c.images = strippedImages;
  }

  return { snapshot: clone, imageRows: rows, keepKeys };
}

async function attachTemplateImagesFromSupabase(
  templateId: string,
  snapshot: Report,
): Promise<Report> {
  const client = getSupabaseClient();
  if (!client || !templateId || !snapshot) return snapshot;

  const { data, error } = await client
    .from(SUPABASE_TABLES.TEMPLATE_IMAGES)
    .select('criterion_id,image_id,name,sort_order,data_url')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('[storage] Falha ao buscar imagens do template no Supabase:', error.message);
    return snapshot;
  }

  const clone: Report = JSON.parse(JSON.stringify(snapshot));
  const criteria = normalizeCriteriaIds(Array.isArray(clone.criteria) ? clone.criteria : []);
  const grouped = new Map<string, ReportImage[]>();

  for (const row of data || []) {
    const key = String(row.criterion_id || 'criterion');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      id: String(row.image_id || ''),
      name: row.name || '',
      dataUrl: row.data_url || '',
      dbStored: true,
    });
  }

  for (const c of criteria) {
    const key = String(c.id);
    const imgs = grouped.get(key) || [];
    c.images = imgs.filter((img) => img.dataUrl);
  }

  return clone;
}

export async function hydrateTemplateSnapshotImages(snapshot: Report): Promise<Report> {
  const clone: Report = JSON.parse(JSON.stringify(snapshot));
  const criteria = clone.criteria || [];

  for (const c of criteria) {
    const originalImages = Array.isArray(c.images) ? c.images : [];
    const nextImages: ReportImage[] = [];

    for (const img of originalImages) {
      if (!img || typeof img !== 'object') continue;

      if (typeof img.dataUrl === 'string' && img.dataUrl.trim()) {
        nextImages.push(img);
        continue;
      }

      if (img.cacheKey) {
        const dataUrl = await getCachedImageDataUrl(img.cacheKey);
        if (dataUrl) {
          nextImages.push({ ...img, dataUrl });
        }
      }
    }

    c.images = nextImages;
  }

  return clone;
}

async function normalizeReportImagesForExport(report: Report): Promise<Report> {
  const clone: Report = JSON.parse(JSON.stringify(report));
  const criteria = clone.criteria || [];

  for (const c of criteria) {
    const originalImages = Array.isArray(c.images) ? c.images : [];
    const nextImages: ReportImage[] = [];

    for (const img of originalImages) {
      if (!img || typeof img !== 'object') continue;

      if (typeof img.dataUrl === 'string' && img.dataUrl.trim()) {
        nextImages.push(img);
        continue;
      }

      if (img.cacheKey) {
        const dataUrl = await getCachedImageDataUrl(img.cacheKey);
        if (dataUrl) {
          nextImages.push({ ...img, dataUrl });
        }
      }
    }

    c.images = nextImages;
  }

  return clone;
}

export async function addTemplate(
  name: string,
  report: Report,
  ownerOverride?: { id: string | null },
  onProgress?: (msg: string) => void,
): Promise<Template | null> {
  const templates = loadTemplates();
  const normalize = (v: unknown) => String(v || '').trim().toLowerCase();
  const reportStoryId = normalize(report?.story?.id);
  const reportStoryTitle = normalize(report?.story?.title);
  const user = currentUser();
  // Em sessão compartilhada, o template pertence ao DONO da sessão (co-propriedade),
  // mesmo quando quem salva é um colaborador.
  const myId = ownerOverride ? ownerOverride.id : user?.id || null;

  // O "atualizar" só vale para os templates do PRÓPRIO usuário. Assim, ao usar
  // o template de outra pessoa e salvar, é criado um novo na pasta de quem salvou,
  // sem alterar o original.
  const isMine = (t: Template) => (t.createdBy || null) === myId;

  // Regra principal: mesma User Story (ID + Título) atualiza o template existente.
  const existingByStory = templates.findIndex((t) => {
    if (!isMine(t)) return false;
    const tStoryId = normalize(t?.snapshot?.story?.id);
    const tStoryTitle = normalize(t?.snapshot?.story?.title);
    return reportStoryId && reportStoryTitle && tStoryId === reportStoryId && tStoryTitle === reportStoryTitle;
  });

  // Fallback: mantém comportamento antigo por nome (também restrito ao dono).
  const existingByName = templates.findIndex((t) => isMine(t) && normalize(t.name) === normalize(name));
  const existing = existingByStory >= 0 ? existingByStory : existingByName;

  const totalImages = countReportImages(report);
  if (totalImages > 0) onProgress?.(`Preparando ${totalImages} imagem${totalImages !== 1 ? 'ns' : ''}…`);

  const cachedSnapshot = await cacheTemplateSnapshotImages(report);
  const normalizedSnapshot = cloneSnapshotWithNormalizedCriteriaIds(cachedSnapshot);
  const existingId = existing >= 0 ? templates[existing].id : null;
  // Só reaproveita o id quando estamos ATUALIZANDO um template do próprio usuário.
  // Para qualquer template novo (inclusive cópia do template de outra pessoa) é
  // gerado um id inédito, garantindo que o upsert nunca sobrescreva o registro
  // original de outro usuário.
  const templateId = existingId || generateId();

  const now = new Date().toISOString();
  const createdAt =
    existing >= 0 ? templates[existing].createdAt || templates[existing].savedAt || now : now;

  // Contagem de critérios por status (denormalizada para a listagem).
  const criteriaStatus: Partial<Record<Report['finalStatus'], number>> = {};
  for (const c of report.criteria || []) {
    const s = (c?.status || 'pending') as Report['finalStatus'];
    criteriaStatus[s] = (criteriaStatus[s] || 0) + 1;
  }

  const remotePayload = await splitTemplateSnapshotImages(templateId, normalizedSnapshot, onProgress);
  if (remotePayload.imageRows.length > 0) onProgress?.(`Salvando template no banco…`);
  else if (remotePayload.keepKeys.size > 0) onProgress?.(`Atualizando template no banco…`);
  const baseEntry: Template = {
    id: templateId,
    name,
    savedAt: now,
    createdAt,
    criteriaCount: (report.criteria || []).length,
    snapshot: normalizedSnapshot,
    createdBy: myId,
    system: report?.story?.system || null,
    module: report?.story?.module || null,
    sprint: report?.story?.sprint || null,
    environment: report?.story?.environment || null,
    finalStatus: report?.finalStatus || null,
    criteriaStatus,
  };

  const upsertAndSave = (entry: Template): boolean => {
    const nextTemplates = [...templates];
    if (existing >= 0) {
      nextTemplates[existing] = entry;
    } else {
      nextTemplates.unshift(entry);
    }
    return saveTemplates(nextTemplates);
  };

  const localOk = upsertAndSave(baseEntry);
  const hasSupabase = !!getSupabaseClient();
  const remoteOk = await upsertTemplateToSupabase(
    { ...baseEntry, snapshot: remotePayload.snapshot, fullSnapshot: normalizedSnapshot },
    remotePayload.imageRows,
    onProgress,
    remotePayload.keepKeys,
  );

  if (!hasSupabase && localOk) {
    return baseEntry;
  }

  if (hasSupabase && !remoteOk) {
    return null;
  }

  if (localOk || remoteOk) {
    if (!localOk && remoteOk) {
      showToast('Template salvo no Supabase. Cache local cheio.', 'warning');
    }
    return baseEntry;
  }

  return null;
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = loadTemplates().filter((t) => t.id !== id);
  saveTemplates(templates);
  await deleteTemplateFromSupabase(id);
}

/* ─── Export / Import JSON ─── */
export async function exportReportAsJSON(report: Report): Promise<void> {
  const normalized = await normalizeReportImagesForExport(report);
  const json = JSON.stringify(normalized, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = (normalized.story.id || 'relatorio') + '_' + formatDateForFilename() + '.json';
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedJSON(text: string): { ok: boolean; data?: Report; error?: string } {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Formato inválido');
    if (!data.story) throw new Error('Campo "story" ausente');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
