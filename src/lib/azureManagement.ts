/* ═══════════════════════════════════════════════════════════
   azureManagement.ts — CRUD Supabase para tabelas Azure DevOps.
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';
import { showToast } from './toast';
import { currentUserId } from './testManagement';
import type { AzureConfig, AzureUserSettings, AzureTemplate } from '../types/azure';

function fail(scope: string, message: string): void {
  console.warn(`[azure:${scope}] ${message}`);
  showToast(`Erro Azure (${scope}): ${message}`, 'error');
}

/* ───────────────────────── Conexões (Configs) ───────────────────────── */
type ConfigRow = { id: string; name: string; organization: string; project: string; created_by: string | null; created_at: string };
const fromConfig = (r: ConfigRow): AzureConfig => ({ id: r.id, name: r.name, organization: r.organization, project: r.project, createdBy: r.created_by, createdAt: r.created_at });
const toConfig = (c: AzureConfig): ConfigRow => ({ id: c.id, name: c.name, organization: c.organization, project: c.project, created_by: c.createdBy, created_at: c.createdAt });

export async function listAzureConfigs(): Promise<AzureConfig[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_azure_configs').select('id,name,organization,project,created_by,created_at').order('created_at', { ascending: true });
  if (error) { fail('configs', error.message); return []; }
  return (data as ConfigRow[]).map(fromConfig);
}

export async function saveAzureConfig(cfg: AzureConfig): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_azure_configs').upsert([toConfig(cfg)], { onConflict: 'id' });
  if (error) { fail('configs', error.message); return false; }
  return true;
}

export async function deleteAzureConfig(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_azure_configs').delete().eq('id', id);
  if (error) { fail('configs', error.message); return false; }
  return true;
}

/* ───────────────────────── Configurações do usuário ───────────────────────── */
type SettingsRow = { user_id: string; azure_email: string; pat: string; updated_at: string };
const fromSettings = (r: SettingsRow): AzureUserSettings => ({ userId: r.user_id, azureEmail: r.azure_email, pat: r.pat, updatedAt: r.updated_at });

export async function getMyAzureSettings(): Promise<AzureUserSettings | null> {
  const c = getSupabaseClient(); if (!c) return null;
  const uid = currentUserId(); if (!uid) return null;
  const { data, error } = await c.from('qa_azure_user_settings').select('user_id,azure_email,pat,updated_at').eq('user_id', uid).maybeSingle();
  if (error) { fail('user-settings', error.message); return null; }
  return data ? fromSettings(data as SettingsRow) : null;
}

/** Retorna apenas metadados (e-mail + existência do PAT) — sem expor o valor do token. */
export async function getMyAzureSettingsMeta(): Promise<{ hasSettings: boolean; azureEmail: string } | null> {
  const c = getSupabaseClient(); if (!c) return null;
  const uid = currentUserId(); if (!uid) return null;
  const { data, error } = await c.from('qa_azure_user_settings').select('azure_email').eq('user_id', uid).maybeSingle();
  if (error) { fail('user-settings', error.message); return null; }
  return data ? { hasSettings: true, azureEmail: (data as { azure_email: string }).azure_email } : { hasSettings: false, azureEmail: '' };
}

export async function saveMyAzureSettings(azureEmail: string, pat: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const uid = currentUserId(); if (!uid) return false;
  const row: SettingsRow = { user_id: uid, azure_email: azureEmail, pat, updated_at: new Date().toISOString() };
  const { error } = await c.from('qa_azure_user_settings').upsert([row], { onConflict: 'user_id' });
  if (error) { fail('user-settings', error.message); return false; }
  return true;
}

export async function deleteMyAzureSettings(): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const uid = currentUserId(); if (!uid) return false;
  const { error } = await c.from('qa_azure_user_settings').delete().eq('user_id', uid);
  if (error) { fail('user-settings', error.message); return false; }
  return true;
}

/* ───────────────────────── Templates ───────────────────────── */
type TemplateRow = { id: string; name: string; azure_config_id: string; fields: unknown; created_by: string | null; created_at: string };
const fromTemplate = (r: TemplateRow): AzureTemplate => ({ id: r.id, name: r.name, azureConfigId: r.azure_config_id, fields: (r.fields as AzureTemplate['fields']) ?? [], createdBy: r.created_by, createdAt: r.created_at });
const toTemplate = (t: AzureTemplate): TemplateRow => ({ id: t.id, name: t.name, azure_config_id: t.azureConfigId, fields: t.fields, created_by: t.createdBy ?? currentUserId(), created_at: t.createdAt });

export async function listAzureTemplates(): Promise<AzureTemplate[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_azure_templates').select('id,name,azure_config_id,fields,created_by,created_at').order('created_at', { ascending: true });
  if (error) { fail('templates', error.message); return []; }
  return (data as TemplateRow[]).map(fromTemplate);
}

export async function listAzureTemplatesForConfig(configId: string): Promise<AzureTemplate[]> {
  const c = getSupabaseClient(); if (!c) return [];
  const { data, error } = await c.from('qa_azure_templates').select('id,name,azure_config_id,fields,created_by,created_at').eq('azure_config_id', configId).order('created_at', { ascending: true });
  if (error) { fail('templates', error.message); return []; }
  return (data as TemplateRow[]).map(fromTemplate);
}

export async function saveAzureTemplate(t: AzureTemplate): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_azure_templates').upsert([toTemplate(t)], { onConflict: 'id' });
  if (error) { fail('templates', error.message); return false; }
  return true;
}

export async function deleteAzureTemplate(id: string): Promise<boolean> {
  const c = getSupabaseClient(); if (!c) return false;
  const { error } = await c.from('qa_azure_templates').delete().eq('id', id);
  if (error) { fail('templates', error.message); return false; }
  return true;
}

/* ── Gerador de ID (mesmo padrão de testManagement) ── */
export function genAzureId(): string {
  return 'az_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
