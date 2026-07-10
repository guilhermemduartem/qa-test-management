/* ═══════════════════════════════════════════════════════════
   reportSession.ts — Sessões compartilhadas de relatório.
   Persiste o snapshot do relatório no Supabase e sincroniza em
   tempo real (postgres_changes) + presença (quem está online).
   Imagens em base64 são enviadas ao bucket qa-evidence e
   substituídas por URLs públicas para manter o payload leve.
   ═══════════════════════════════════════════════════════════ */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import { stripBold } from './utils';
import type { Report, Session } from '../types';

const TABLE = 'qa_report_sessions';
const EVIDENCE_BUCKET = 'qa-evidence';

export interface SessionParticipant {
  id: string;
  name: string;
  role: string;
}

export interface SessionSavedEvent {
  byId: string;
  byName: string;
  ownerName: string;
}

export interface ReportSessionData {
  id: string;
  ownerId: string;
  ownerName: string;
  report: Report;
  rev: number;
  updatedById: string | null;
  updatedAt: string;
}

interface SessionRow {
  id: string;
  owner_id: string;
  owner_name: string;
  story_id: string | null;
  story_title: string | null;
  report: Report;
  rev: number;
  updated_by_id: string | null;
  updated_by_name: string | null;
  updated_at: string;
}

/** Sharing depende do Supabase configurado. */
export function isSharingAvailable(): boolean {
  return getSupabaseClient() !== null;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Converte um data URL base64 em Blob (ou null se não for data URL). */
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = (mime.split('/')[1] || 'png').split('+')[0];
    return { blob: new Blob([bytes], { type: mime }), ext };
  } catch {
    return null;
  }
}

/** Sobe um data URL ao bucket e retorna a URL pública (ou o valor original). */
async function uploadDataUrl(sessionId: string, key: string, dataUrl: string): Promise<string> {
  const c = getSupabaseClient();
  if (!c || !dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) return dataUrl;
  const path = `report-sessions/${sessionId}/${key}.${parsed.ext}`;
  const { error } = await c.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, parsed.blob, { cacheControl: '3600', upsert: true });
  if (error) {
    console.warn('[reportSession] falha ao subir imagem:', error.message);
    return dataUrl;
  }
  return c.storage.from(EVIDENCE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Garante que todas as imagens (prints dos critérios + logo) estejam como URL
 * pública, subindo as que ainda estão em base64. Retorna um novo relatório.
 */
export async function materializeImages(sessionId: string, report: Report): Promise<Report> {
  const next = deepClone(report);

  if (next.company?.logoUrl?.startsWith('data:')) {
    next.company.logoUrl = await uploadDataUrl(sessionId, `logo_${Date.now()}`, next.company.logoUrl);
  }

  for (const crit of next.criteria || []) {
    for (const img of crit.images || []) {
      if (img.dataUrl?.startsWith('data:')) {
        img.dataUrl = await uploadDataUrl(sessionId, img.id, img.dataUrl);
        delete img.cacheKey;
      }
    }
  }
  return next;
}

function rowToData(row: SessionRow): ReportSessionData {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    report: row.report,
    rev: Number(row.rev) || 0,
    updatedById: row.updated_by_id,
    updatedAt: row.updated_at,
  };
}

/** Cria uma sessão compartilhada a partir do relatório atual. Retorna o id/token. */
export async function createReportSession(
  report: Report,
  owner: Session,
): Promise<string | null> {
  const c = getSupabaseClient();
  if (!c) return null;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const materialized = await materializeImages(id, report);
  const { error } = await c.from(TABLE).insert([
    {
      id,
      owner_id: owner.id,
      owner_name: owner.nome,
      story_id: materialized.story?.id || null,
      story_title: stripBold(materialized.story?.title) || null,
      report: materialized,
      rev: 0,
      updated_by_id: owner.id,
      updated_by_name: owner.nome,
    },
  ]);
  if (error) {
    console.error('[reportSession] falha ao criar sessão:', error.message);
    return null;
  }
  return id;
}

/** Carrega o estado atual de uma sessão. */
export async function loadReportSession(id: string): Promise<ReportSessionData | null> {
  const c = getSupabaseClient();
  if (!c) return null;
  const { data, error } = await c.from(TABLE).select('*').eq('id', id).single();
  if (error || !data) return null;
  return rowToData(data as SessionRow);
}

/**
 * Persiste uma nova revisão do relatório na sessão. Sobe imagens novas antes.
 * Retorna a nova revisão + o relatório já com URLs (para o estado local).
 */
export async function pushReportSession(
  id: string,
  report: Report,
  user: Session,
  expectedRev: number,
): Promise<{ rev: number; report: Report } | null> {
  const c = getSupabaseClient();
  if (!c) return null;
  const materialized = await materializeImages(id, report);
  const newRev = expectedRev + 1;
  const { error } = await c
    .from(TABLE)
    .update({
      report: materialized,
      story_id: materialized.story?.id || null,
      story_title: stripBold(materialized.story?.title) || null,
      rev: newRev,
      updated_by_id: user.id,
      updated_by_name: user.nome,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    console.error('[reportSession] falha ao salvar sessão:', error.message);
    return null;
  }
  return { rev: newRev, report: materialized };
}

/** Assina mudanças na linha da sessão (edições de outros participantes). */
export function subscribeReportSession(
  id: string,
  onUpdate: (data: ReportSessionData) => void,
): () => void {
  const c = getSupabaseClient();
  if (!c) return () => {};
  const channel: RealtimeChannel = c
    .channel(`report-session:${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: TABLE, filter: `id=eq.${id}` },
      (payload) => onUpdate(rowToData(payload.new as SessionRow)),
    )
    .subscribe();
  return () => {
    c.removeChannel(channel);
  };
}

/**
 * Entra no canal de presença: reporta participantes online e recebe avisos de
 * "salvou". Retorna `unsubscribe` e `notifySaved` para transmitir o aviso aos
 * demais participantes (broadcast com `self: false` — quem envia não recebe).
 */
export function joinPresence(
  id: string,
  user: Session,
  onSync: (participants: SessionParticipant[]) => void,
  onSaved?: (event: SessionSavedEvent) => void,
): { unsubscribe: () => void; notifySaved: (event: SessionSavedEvent) => void } {
  const c = getSupabaseClient();
  if (!c) return { unsubscribe: () => {}, notifySaved: () => {} };
  const channel = c.channel(`report-presence:${id}`, {
    config: { presence: { key: user.id }, broadcast: { self: false } },
  });
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const seen = new Map<string, SessionParticipant>();
    for (const entries of Object.values(state)) {
      for (const p of entries as unknown as SessionParticipant[]) {
        if (p?.id) seen.set(p.id, { id: p.id, name: p.name, role: p.role });
      }
    }
    onSync([...seen.values()]);
  });
  channel.on('broadcast', { event: 'saved' }, (msg) => {
    onSaved?.(msg.payload as SessionSavedEvent);
  });
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ id: user.id, name: user.nome, role: user.role });
    }
  });
  return {
    unsubscribe: () => {
      c.removeChannel(channel);
    },
    notifySaved: (event: SessionSavedEvent) => {
      channel.send({ type: 'broadcast', event: 'saved', payload: event });
    },
  };
}

/** Monta o link absoluto da sessão (HashRouter). */
export function buildSessionLink(id: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/relatorio/sessao/${id}`;
}
