/* ═══════════════════════════════════════════════════════════
   supabase.ts — Cliente Supabase (porta de js/supabase.js)
   URL e chave publishable vêm de variáveis de ambiente (.env).
   ═══════════════════════════════════════════════════════════ */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. Verifique o arquivo .env.',
  );
} else {
  client = createClient(SUPABASE_URL, SUPABASE_KEY);
}

/** Cliente Supabase (pode ser null se as variáveis de ambiente faltarem). */
export const supabase = client;

export function getSupabaseClient(): SupabaseClient | null {
  return client;
}
