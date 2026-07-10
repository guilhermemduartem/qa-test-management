/* ═══════════════════════════════════════════════════════════
   reportData.ts — Dados do Relatório (passo a passo / ações)
   Porta de js/report-data.js (camada de dados) + getStepSuggestions
   (autocomplete de passos, originalmente em app.js).
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';
import { showToast } from './toast';
import { currentUser } from './auth';
import type { ReportDataEntry } from '../types';

const STORAGE_KEY = 'qa_report_data_entries';
const SUPABASE_TABLE = 'qa_report_data_entries';
let hasShownSupabaseWarning = false;

function warnSupabase(message: string): void {
  if (hasShownSupabaseWarning) return;
  hasShownSupabaseWarning = true;
  showToast(message, 'warning');
}

export function normalizeText(str: unknown): string {
  return String(str || '').trim().toLowerCase();
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function loadEntries(): ReportDataEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') || [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: ReportDataEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

interface RemoteRow {
  id: string;
  texto: string;
  acoes: string;
  created_by_id: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string | null;
}

function toRemoteRow(entry: ReportDataEntry): RemoteRow {
  return {
    id: entry.id,
    texto: entry.texto,
    acoes: entry.acoes,
    created_by_id: entry.createdById,
    created_by_name: entry.createdByName,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function fromRemoteRow(row: RemoteRow): ReportDataEntry {
  return {
    id: row.id,
    texto: row.texto,
    acoes: row.acoes,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function pullEntriesFromSupabase(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select('id,texto,acoes,created_by_id,created_by_name,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[report-data] Supabase pull falhou:', error.message);
    warnSupabase('Supabase indisponivel no momento. Usando dados locais.');
    return false;
  }

  saveEntries((data || []).map(fromRemoteRow));
  return true;
}

export async function upsertEntryToSupabase(entry: ReportDataEntry): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client
    .from(SUPABASE_TABLE)
    .upsert([toRemoteRow(entry)], { onConflict: 'id' });

  if (error) {
    console.warn('[report-data] Supabase upsert falhou:', error.message);
    warnSupabase('Nao foi possivel salvar no Supabase. Mantido localmente.');
    return false;
  }
  return true;
}

export async function bulkInsertToSupabase(entries: ReportDataEntry[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !entries.length) return false;

  const { error } = await client.from(SUPABASE_TABLE).insert(entries.map(toRemoteRow));

  if (error) {
    console.warn('[report-data] Supabase bulk insert falhou:', error.message);
    warnSupabase('Nao foi possivel importar no Supabase. Mantido localmente.');
    return false;
  }
  return true;
}

export async function deleteEntryFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client.from(SUPABASE_TABLE).delete().eq('id', id);

  if (error) {
    console.warn('[report-data] Supabase delete falhou:', error.message);
    warnSupabase('Nao foi possivel excluir no Supabase. Alteracao local aplicada.');
    return false;
  }
  return true;
}

export function getCurrentCreator(): { id: string | null; name: string } {
  const user = currentUser();
  const name = (user?.nome || '').trim() || (user?.login || '').trim() || '—';
  return { id: user?.id || null, name };
}

export function parseImportRows(rows: unknown[][]): { texto: string; acoes: string }[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const asText = (v: unknown) => String(v == null ? '' : v).trim();
  const header = (rows[0] || []).map((v) => normalizeText(v));
  const colTextoByHeader = header.findIndex(
    (h) => h === 'passo a passo' || h === 'passo a passo *' || h === 'passo',
  );
  const colAcoesByHeader = header.findIndex(
    (h) => h === 'acoes' || h === 'ações' || h === 'acao' || h === 'ação',
  );

  const hasHeader = colTextoByHeader !== -1 || colAcoesByHeader !== -1;
  const start = hasHeader ? 1 : 0;
  const colTexto = colTextoByHeader !== -1 ? colTextoByHeader : 0;
  const colAcoes = colAcoesByHeader !== -1 ? colAcoesByHeader : 1;

  const out: { texto: string; acoes: string }[] = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    const texto = asText(row[colTexto]);
    const acoes = asText(row[colAcoes]);
    if (!texto || !acoes) continue;
    out.push({ texto, acoes });
  }
  return out;
}

/* ── Autocomplete de passos (originalmente getStepSuggestions em app.js) ── */
export function getStepSuggestions(query: string): { texto: string; acoes: string }[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  return loadEntries()
    .map((item) => ({
      texto: String(item?.texto || '').trim(),
      acoes: String(item?.acoes || '').trim(),
    }))
    .filter((item) => item.texto && item.acoes)
    .filter((item) => {
      const key = item.texto.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((item) => item.texto.toLowerCase().includes(q))
    .slice(0, 8);
}
