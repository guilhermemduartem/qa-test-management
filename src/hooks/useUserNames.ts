/* ═══════════════════════════════════════════════════════════
   useUserNames — resolve o ID de um usuário (createdBy, etc.)
   para o nome legível, usando a lista de usuários já sincronizada
   do Supabase em localStorage (ver auth.ts → syncUsersFromSupabase).
   Retorna uma função pura name(id) e uma flag de iniciais.
   ═══════════════════════════════════════════════════════════ */
import { useMemo } from 'react';
import { cachedProfiles } from '../lib/auth';

export interface UserNameResolver {
  /** Nome do usuário pelo ID; "—" se vazio, ou o próprio ID se desconhecido. */
  name: (id: string | null | undefined) => string;
  /** Iniciais para avatar (ex.: "QA Tester" → "QT"). "?" se desconhecido. */
  initials: (id: string | null | undefined) => string;
}

export function useUserNames(): UserNameResolver {
  return useMemo(() => {
    const map = new Map(cachedProfiles().map((u) => [u.id, u.nome] as const));
    const name = (id: string | null | undefined): string => {
      if (!id) return '—';
      return map.get(id) ?? id;
    };
    const initials = (id: string | null | undefined): string => {
      const n = name(id);
      if (n === '—' || n === id) return n === '—' ? '—' : '?';
      const parts = n.trim().split(/\s+/);
      const first = parts[0]?.[0] ?? '';
      const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
      return (first + last).toUpperCase();
    };
    return { name, initials };
  }, []);
}
