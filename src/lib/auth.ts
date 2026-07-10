/* ═══════════════════════════════════════════════════════════
   auth.ts — Autenticação real via Supabase Auth + RBAC.
   Login por e-mail. Papel/nome em public.qa_profiles. Sessão
   cacheada (8h) em localStorage; Supabase gerencia o JWT (RLS).
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';
import type { Role, Session, User } from '../types';

const SESSION_KEY = 'qa_session';
const PROFILES_KEY = 'qa_profiles_cache';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function currentUser(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session | null;
    if (!s || !s.token || !s.expiresAt || Date.now() >= s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}
export function isAuthenticated(): boolean { return currentUser() !== null; }
export function sessionExpiresAt(): number | null { return currentUser()?.expiresAt ?? null; }

interface ProfileLite { id: string; nome: string; role: Role }
export function cachedProfiles(): ProfileLite[] {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]') as ProfileLite[]; } catch { return []; }
}
export async function syncProfiles(): Promise<void> {
  const c = getSupabaseClient();
  if (!c) return;
  const { data, error } = await c.from('qa_profiles').select('id, nome, role');
  if (error || !data) return;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(data));
}

type PermAction = 'create' | 'edit' | 'editOwn' | 'delete' | 'deleteOwn' | 'admin';

const PERMS_VIEWER     = { create: false, edit: false, editOwn: false, delete: false, deleteOwn: false, admin: false };
const PERMS_MEMBER     = { create: true,  edit: false, editOwn: true,  delete: false, deleteOwn: true,  admin: false };
const PERMS_SUPERADMIN = { create: true,  edit: true,  editOwn: true,  delete: true,  deleteOwn: true,  admin: true  };

const ROLE_PERMS: Record<Role, Record<PermAction, boolean>> = {
  viewer:               PERMS_VIEWER,
  intern:               PERMS_MEMBER,
  qa:                   PERMS_MEMBER,
  developer:            PERMS_MEMBER,
  senior_developer:     PERMS_MEMBER,
  tech_lead:            PERMS_MEMBER,
  devops:               PERMS_MEMBER,
  architect:            PERMS_MEMBER,
  scrum_master:         PERMS_MEMBER,
  product_owner:        PERMS_MEMBER,
  product_manager:      PERMS_MEMBER,
  engineering_manager:  PERMS_MEMBER,
  director_engineering: PERMS_MEMBER,
  admin:                PERMS_SUPERADMIN,
  master_admin:         PERMS_SUPERADMIN,
};

export function can(action: PermAction, recordOwnerId?: string): boolean {
  const user = currentUser();
  if (!user) return false;
  const perms = ROLE_PERMS[user.role] ?? PERMS_VIEWER;
  if (perms[action]) return true;
  if (action === 'edit' && perms.editOwn && recordOwnerId) return recordOwnerId === user.id;
  if (action === 'delete' && perms.deleteOwn && recordOwnerId) return recordOwnerId === user.id;
  return false;
}

function buildSession(id: string, email: string, nome: string, role: Role, token: string): Session {
  const now = Date.now();
  return { id, nome: nome || email, login: email, role, token, issuedAt: now, expiresAt: now + SESSION_TTL_MS };
}

export async function login(
  email: string,
  senha: string,
): Promise<{ ok: boolean; error?: string; user?: Session }> {
  const c = getSupabaseClient();
  if (!c) return { ok: false, error: 'Supabase indisponível.' };
  const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error || !data.user || !data.session) return { ok: false, error: 'E-mail ou senha inválidos.' };

  const { data: prof } = await c.from('qa_profiles').select('nome, role, ativo').eq('id', data.user.id).single();
  if (!prof || !prof.ativo) {
    await c.auth.signOut().catch(() => {});
    return { ok: false, error: 'Usuário inativo ou sem perfil. Contate um administrador.' };
  }
  const session = buildSession(data.user.id, data.user.email ?? '', prof.nome, prof.role as Role, data.session.access_token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await syncProfiles().catch(() => {});
  return { ok: true, user: session };
}

export function logout(): void {
  const uid = currentUser()?.id;
  if (uid) localStorage.removeItem(`qa_azure_sync_${uid}`); // limpa o feed de sincronização Azure
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PROFILES_KEY);
  sessionStorage.removeItem('qa_auth');
  getSupabaseClient()?.auth.signOut().catch(() => {});
}

export async function init(): Promise<void> {
  const c = getSupabaseClient();
  if (!c) return;
  if (currentUser()) { syncProfiles().catch(() => {}); return; }
  const { data } = await c.auth.getSession();
  const u = data.session?.user;
  if (!u || !data.session) return;
  const { data: prof } = await c.from('qa_profiles').select('nome, role, ativo').eq('id', u.id).single();
  if (!prof || !prof.ativo) { await c.auth.signOut().catch(() => {}); return; }
  const session = buildSession(u.id, u.email ?? '', prof.nome, prof.role as Role, data.session.access_token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await syncProfiles().catch(() => {});
}

async function invokeAdmin(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; data?: any }> {
  const c = getSupabaseClient();
  if (!c) return { ok: false, error: 'Supabase indisponível.' };
  const { data, error } = await c.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message || 'Falha na função admin-users.';
    try { const ctx = (error as { context?: Response }).context; if (ctx) { const j = await ctx.json(); if (j?.error) msg = j.error; } } catch { /* ignore */ }
    return { ok: false, error: msg };
  }
  if (data && data.ok === false) return { ok: false, error: data.error || 'Erro.' };
  return { ok: true, data };
}

export async function getAvatar(userId: string): Promise<string | null> {
  const c = getSupabaseClient();
  if (!c) return null;
  const { data } = await c.from('qa_profiles').select('avatar_url').eq('id', userId).single();
  return data?.avatar_url ?? null;
}

export async function updateAvatar(userId: string, base64: string): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabaseClient();
  if (!c) return { ok: false, error: 'Supabase indisponível.' };
  const { error } = await c.rpc('update_own_avatar', { p_avatar_url: base64 });
  if (error) return { ok: false, error: error.message };
  if (base64) localStorage.setItem(`prof-avatar-${userId}`, base64);
  else localStorage.removeItem(`prof-avatar-${userId}`);
  return { ok: true };
}

export async function listUsers(): Promise<User[]> {
  const r = await invokeAdmin({ action: 'list' });
  return r.ok ? ((r.data?.users ?? []) as User[]) : [];
}
export async function createUser(input: {
  nome: string; email: string; senha: string; role: Role; ativo?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  return invokeAdmin({ action: 'create', nome: input.nome, email: input.email, password: input.senha, role: input.role, ativo: input.ativo !== false });
}
export async function updateUser(
  id: string,
  fields: { nome?: string; role?: Role; ativo?: boolean; senha?: string },
): Promise<{ ok: boolean; error?: string }> {
  return invokeAdmin({ action: 'update', id, nome: fields.nome, role: fields.role, ativo: fields.ativo, password: fields.senha });
}
export async function deleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
  return invokeAdmin({ action: 'delete', id });
}

export const Auth = {
  init, login, logout, currentUser, isAuthenticated, sessionExpiresAt, syncProfiles, cachedProfiles,
  can, listUsers, createUser, updateUser, deleteUser, getAvatar, updateAvatar,
};
