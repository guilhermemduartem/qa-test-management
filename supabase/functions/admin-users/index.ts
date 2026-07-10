// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: admin-users
// Gestão de usuários do Supabase Auth (criar/editar/excluir/listar) usando a
// service role key. Protegida: só executa se o CHAMADOR for admin (papel em
// qa_profiles). Chamada pelo front via supabase.functions.invoke('admin-users').
//
// Deploy:  supabase functions deploy admin-users
// Secrets necessários (já existem por padrão no projeto, exceto se removidos):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1) identifica o chamador pelo JWT
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await caller.auth.getUser();
  if (userErr || !user) return json(401, { error: 'Não autenticado' });

  // 2) só admin pode usar
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: prof } = await admin.from('qa_profiles').select('role, ativo').eq('id', user.id).single();
  if (!prof || !['admin','master_admin'].includes(prof.role) || !prof.ativo) return json(403, { error: 'Acesso negado (apenas admin)' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'JSON inválido' }); }
  const action = String(body.action ?? '');

  try {
    if (action === 'list') {
      const { data: list, error } = await admin.auth.admin.listUsers();
      if (error) return json(400, { error: error.message });
      const { data: profs } = await admin.from('qa_profiles').select('id, nome, role, ativo, avatar_url');
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      const users = list.users.map((u) => {
        const p = byId.get(u.id);
        return { id: u.id, email: u.email, nome: p?.nome ?? '', role: p?.role ?? 'viewer', ativo: p?.ativo ?? true, createdAt: u.created_at, avatarUrl: p?.avatar_url ?? '' };
      });
      return json(200, { ok: true, users });
    }

    if (action === 'create') {
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      const nome = String(body.nome ?? '').trim();
      const role = String(body.role ?? 'viewer');
      const ativo = body.ativo !== false;
      if (!email || password.length < 6) return json(400, { error: 'E-mail e senha (mín. 6) obrigatórios' });
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome, role },
      });
      if (error) return json(400, { error: error.message });
      // o trigger cria o perfil; garante nome/role/ativo
      await admin.from('qa_profiles').upsert({ id: data.user.id, nome, role, ativo });
      return json(200, { ok: true, id: data.user.id });
    }

    if (action === 'update') {
      const id = String(body.id ?? '');
      if (!id) return json(400, { error: 'id obrigatório' });
      const nome = body.nome !== undefined ? String(body.nome).trim() : undefined;
      const role = body.role !== undefined ? String(body.role) : undefined;
      const ativo = body.ativo !== undefined ? Boolean(body.ativo) : undefined;
      const password = body.password ? String(body.password) : undefined;
      if (password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) return json(400, { error: error.message });
      }
      const patch: Record<string, unknown> = {};
      if (nome !== undefined) patch.nome = nome;
      if (role !== undefined) patch.role = role;
      if (ativo !== undefined) patch.ativo = ativo;
      if (Object.keys(patch).length) await admin.from('qa_profiles').update(patch).eq('id', id);
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json(400, { error: 'id obrigatório' });
      if (id === user.id) return json(400, { error: 'Você não pode excluir seu próprio usuário' });
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    return json(400, { error: 'Ação desconhecida' });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
