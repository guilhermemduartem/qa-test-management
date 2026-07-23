/* ═══════════════════════════════════════════════════════════
   qaChat.ts — Cliente do Assistente de IA (Gestão de Testes).
   Fala com a Edge Function `qa-chat` via fetch direto (não
   supabase.functions.invoke, que bufferiza e não faz streaming).
   Lê o corpo como SSE e dispara callbacks por evento.
   ═══════════════════════════════════════════════════════════ */
import { getSupabaseClient } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCallbacks {
  onText: (delta: string) => void;
  onStatus: (tool: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/** Máximo de turnos enviados ao backend (o histórico vai a preço cheio). */
const MAX_TURNS = 10;

export function askQaChat(
  projectId: string,
  messages: ChatMessage[],
  cb: ChatCallbacks,
): { abort: () => void } {
  const controller = new AbortController();

  (async () => {
    const client = getSupabaseClient();
    if (!client) {
      cb.onError('Supabase indisponível.');
      return;
    }
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      cb.onError('Sessão expirada. Faça login novamente.');
      return;
    }

    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/qa-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ projectId, messages: messages.slice(-MAX_TURNS) }),
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      cb.onError(`Falha de conexão: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    // Erros de auth/validação vêm como JSON normal (401/400/405), não SSE.
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) msg = String(body.error);
      } catch {
        // corpo não-JSON; mantém a mensagem genérica
      }
      cb.onError(msg);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      cb.onError('Resposta sem corpo.');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Cada evento SSE termina em linha em branco.
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          const line = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const json = line.slice(5).trim();
          if (!json) continue;

          let evt: { type: string; text?: string; tool?: string; message?: string };
          try {
            evt = JSON.parse(json);
          } catch {
            continue;
          }

          switch (evt.type) {
            case 'text':
              if (evt.text) cb.onText(evt.text);
              break;
            case 'status':
              if (evt.tool) cb.onStatus(evt.tool);
              break;
            case 'done':
              cb.onDone();
              return;
            case 'error':
              cb.onError(evt.message ?? 'Erro desconhecido.');
              return;
          }
        }
      }
      // Fim do stream sem evento `done` explícito.
      cb.onDone();
    } catch (e) {
      if (controller.signal.aborted) return;
      cb.onError(`Erro ao ler a resposta: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();

  return { abort: () => controller.abort() };
}
