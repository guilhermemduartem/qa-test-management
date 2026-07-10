/* ═══════════════════════════════════════════════════════════
   bulkTemplateStorage.ts — CRUD dos templates da Importação
   Massiva (APIs → Suporte) sobre Supabase.

   Persistência compartilhada: antes os templates viviam só em
   localStorage (por navegador), então um QA em outra máquina não
   via os templates do admin. Agora ficam em `qa_bulk_templates`
   (+ `qa_bulk_template_folders`) → habilita admin cria → QA executa.
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';
import { showToast } from './toast';
import { currentUser } from './auth';
import type { BulkTemplate } from '../pages/apis/BulkImportPage';

function currentUserId(): string | null {
  return (currentUser() as { id?: string } | null)?.id ?? null;
}

let warned = false;
function fail(scope: string, message: string): void {
  console.warn(`[bulk-templates:${scope}] ${message}`);
  if (!warned) {
    warned = true;
    showToast('Supabase indisponível ou sem permissão para os templates de importação.', 'warning');
  }
}

/* ── Templates ── */
type TemplateRow = {
  id: string;
  name: string;
  folder: string;
  env_id: string;
  mode: 'seq' | 'par';
  data: { preRequests?: BulkTemplate['preRequests']; importRequests?: BulkTemplate['importRequests']; bodyVars?: BulkTemplate['bodyVars'] } | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
const TEMPLATE_COLS = 'id,name,folder,env_id,mode,data,created_by,created_at,updated_at';

const fromRow = (r: TemplateRow): BulkTemplate => ({
  id: r.id,
  name: r.name,
  folder: r.folder ?? '',
  envId: r.env_id ?? '',
  mode: r.mode ?? 'seq',
  preRequests: r.data?.preRequests ?? [],
  importRequests: r.data?.importRequests ?? [],
  bodyVars: r.data?.bodyVars ?? [],
});

const toRow = (t: BulkTemplate) => ({
  id: t.id,
  name: t.name,
  folder: t.folder ?? '',
  env_id: t.envId ?? '',
  mode: t.mode ?? 'seq',
  data: { preRequests: t.preRequests, importRequests: t.importRequests, bodyVars: t.bodyVars },
  created_by: currentUserId(),
  updated_at: new Date().toISOString(),
});

export async function listBulkTemplates(): Promise<BulkTemplate[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_bulk_templates').select(TEMPLATE_COLS).order('created_at', { ascending: true });
  if (error) { fail('list', error.message); return []; }
  return (data as TemplateRow[]).map(fromRow);
}

export async function saveBulkTemplate(t: BulkTemplate): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) { fail('save', 'sem cliente'); return false; }
  const { error } = await c.from('qa_bulk_templates').upsert([toRow(t)], { onConflict: 'id' });
  if (error) { fail('save', error.message); return false; }
  return true;
}

export async function deleteBulkTemplate(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) { fail('delete', 'sem cliente'); return false; }
  const { error } = await c.from('qa_bulk_templates').delete().eq('id', id);
  if (error) { fail('delete', error.message); return false; }
  return true;
}

/* ── Pastas explícitas ── */
export async function listBulkFolders(): Promise<string[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_bulk_template_folders').select('path').order('path', { ascending: true });
  if (error) { fail('folders.list', error.message); return []; }
  return (data as { path: string }[]).map((r) => r.path);
}

export async function saveBulkFolder(path: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) { fail('folders.save', 'sem cliente'); return false; }
  const { error } = await c.from('qa_bulk_template_folders').upsert([{ path, created_by: currentUserId() }], { onConflict: 'path' });
  if (error) { fail('folders.save', error.message); return false; }
  return true;
}

/** Remove uma pasta e suas subpastas (`path` e `path/...`). */
export async function deleteBulkFolderTree(path: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) { fail('folders.delete', 'sem cliente'); return false; }
  const { error } = await c.from('qa_bulk_template_folders').delete().or(`path.eq.${path},path.like.${path}/%`);
  if (error) { fail('folders.delete', error.message); return false; }
  return true;
}
