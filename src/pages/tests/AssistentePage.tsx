/* ═══════════════════════════════════════════════════════════
   AssistentePage — Chat de IA sobre o projeto de testes ativo.
   Pergunta em linguagem natural → Edge Function qa-chat (streaming).
   Somente leitura: casos, planos, execuções, defeitos, sessões.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { PageLayout } from '../../components/ui/PageLayout';
import { ProjectBar } from '../../components/tests/ProjectBar';
import { useActiveProject } from '../../hooks/useActiveProject';
import { askQaChat, type ChatMessage } from '../../lib/qaChat';

const HELP = (
  <div>
    <p>Pergunte em português sobre o <strong>projeto ativo</strong>: casos, planos,
    execuções, defeitos e sessões exploratórias.</p>
    <p style={{ marginTop: 6 }}>É <strong>somente leitura</strong> — não cria nem altera nada.
    O histórico vive apenas nesta aba do navegador.</p>
  </div>
);

const SUGGESTIONS = [
  'Quantos bugs críticos estão abertos?',
  'Quais casos nunca foram executados?',
  'Qual a taxa de aprovação da última execução?',
  'Já existe caso cobrindo login social?',
];

// ── Render de markdown leve: quebra de linha, **negrito** e lista com "- " ──
function renderInline(text: string): ReactNode[] {
  // Reconhece **negrito** e links markdown [texto](/rota-interna).
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (link) {
      const [, label, url] = link;
      // Segurança: só vira link se for rota interna do app (hash router),
      // bloqueando URLs externas e protocol-relative ("//host").
      if (url.startsWith('/#/') || (url.startsWith('/') && !url.startsWith('//'))) {
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 600 }}
          >
            {label}
          </a>
        );
      }
      return label; // link externo: mostra só o texto, sem virar link
    }
    return p;
  });
}

function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: number) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} style={{ margin: '4px 0', paddingLeft: 18 }}>
        {list.map((li, i) => <li key={i} style={{ marginBottom: 2 }}>{renderInline(li)}</li>)}
      </ul>,
    );
    list = [];
  };

  lines.forEach((line, i) => {
    // Título markdown: #, ##, ### …
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushList(i);
      const level = heading[1].length;
      const size = level <= 1 ? 17 : level === 2 ? 16 : 14.5;
      blocks.push(
        <div key={i} style={{ fontWeight: 700, fontSize: size, margin: '10px 0 3px', color: 'var(--text-primary)' }}>
          {renderInline(heading[2])}
        </div>,
      );
      return;
    }

    // Item de lista: "- " ou "* "
    if (line.startsWith('- ') || line.startsWith('* ')) {
      list.push(line.slice(2));
      return;
    }

    flushList(i);
    if (line.trim()) blocks.push(<div key={i}>{renderInline(line)}</div>);
    else blocks.push(<div key={i} style={{ height: 6 }} />);
  });

  flushList(lines.length);
  return <>{blocks}</>;
}

export function AssistentePage() {
  const { projects, activeId, setActiveId, reload, loading } = useActiveProject();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [statusTool, setStatusTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const abortRef = useRef<{ abort: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Auto-scroll para o fim, exceto se o usuário rolou para cima.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pendingText, statusTool]);

  const justLoadedRef = useRef(false);
  const histKey = (id: string) => `qa_chat_hist_${id}`;

  // Aborta o stream ao desmontar.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Ao trocar de projeto: aborta o stream e CARREGA o histórico salvo daquele
  // projeto. Assim, sair da tela e voltar mantém a conversa.
  useEffect(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setPendingText('');
    setStatusTool(null);
    setError(null);
    justLoadedRef.current = true;
    const saved = activeId ? localStorage.getItem(histKey(activeId)) : null;
    try {
      setMessages(saved ? (JSON.parse(saved) as ChatMessage[]) : []);
    } catch {
      setMessages([]);
    }
  }, [activeId]);

  // Salva o histórico sempre que muda (pula o primeiro set logo após carregar,
  // para não regravar o que acabou de vir do storage sob o projeto novo).
  useEffect(() => {
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      return;
    }
    if (!activeId) return;
    localStorage.setItem(histKey(activeId), JSON.stringify(messages.slice(-100)));
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // Dispara o streaming para um histórico que termina numa pergunta do usuário.
  const runStream = (history: ChatMessage[]) => {
    if (!activeId) return;
    setPendingText('');
    setStatusTool(null);
    setError(null);
    setStreaming(true);
    stickRef.current = true;

    let acc = '';
    abortRef.current = askQaChat(activeId, history, {
      onText: (delta) => {
        acc += delta;
        setStatusTool(null);
        setPendingText(acc);
      },
      onStatus: (tool) => setStatusTool(tool),
      onDone: () => {
        setStreaming(false);
        setStatusTool(null);
        if (acc.trim()) setMessages((m) => [...m, { role: 'assistant', content: acc }]);
        setPendingText('');
      },
      onError: (msg) => {
        setStreaming(false);
        setStatusTool(null);
        setError(msg);
        if (acc.trim()) setMessages((m) => [...m, { role: 'assistant', content: acc }]);
        setPendingText('');
      },
    });
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || streaming || !activeId) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    runStream(next);
  };

  // Reenvia a última pergunta (usado no botão "Tentar novamente" após um erro).
  const canRetry =
    !streaming && messages.length > 0 && messages[messages.length - 1].role === 'user';
  const retry = () => {
    if (!canRetry) return;
    runStream(messages);
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setStatusTool(null);
    if (pendingText.trim()) {
      setMessages((m) => [...m, { role: 'assistant', content: pendingText }]);
    }
    setPendingText('');
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setPendingText('');
    setStreaming(false);
    setStatusTool(null);
    setError(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const statusLabel: Record<string, string> = {
    get_case_details: 'consultando casos',
    search_cases: 'buscando casos',
    get_defect_details: 'consultando defeitos',
    get_run_details: 'consultando execução',
    get_traceability: 'traçando cobertura',
  };

  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {messages.length > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={clearChat}>Limpar conversa</button>
      )}
      <ProjectBar projects={projects} activeId={activeId} onChange={setActiveId} onCreated={reload} />
    </div>
  );

  return (
    <PageLayout module="tests" title="Assistente IA" activeTest="assistente" actions={actions} fluid help={HELP} loading={loading}>
      {!loading && projects.length === 0 ? (
        <div className="tests-empty">
          <h2>Nenhum projeto de teste ainda</h2>
          <p>Crie um projeto no seletor acima para começar.</p>
        </div>
      ) : !activeId ? (
        <div className="tests-empty"><h2>Selecione um projeto</h2><p>Escolha ou crie um projeto no seletor acima.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%' }}>
          {/* Área de rolagem em largura total (barra na direita da tela);
              o conteúdo fica numa coluna centralizada por dentro. */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
          >
            <div style={{ maxWidth: 820, margin: '0 auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Estado vazio: saudação + sugestões no MESMO fluxo (topo), para o
                layout não mudar quando a conversa começa. */}
            {messages.length === 0 && !streaming && (
              <>
                <Bubble role="assistant">
                  Olá! Pergunte sobre casos, execuções, defeitos e cobertura deste projeto.
                  Sou somente leitura — não altero nada.
                </Bubble>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="btn btn-ghost btn-sm"
                      style={{ textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }}
                      onClick={() => setInput(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role}>{renderMarkdown(m.content)}</Bubble>
            ))}

            {streaming && (statusTool ? (
              <Bubble role="assistant">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="tests-muted">{statusLabel[statusTool] ?? 'consultando'}</span>
                  <TypingDots />
                </span>
              </Bubble>
            ) : pendingText ? (
              <Bubble role="assistant">{renderMarkdown(pendingText)}</Bubble>
            ) : (
              <Bubble role="assistant"><TypingDots /></Bubble>
            ))}
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', width: '100%', maxWidth: 820, margin: '0 auto 8px', borderRadius: 8, background: 'var(--error-bg, #ef444418)', border: '1px solid var(--error)', color: 'var(--error)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{error}</span>
              {canRetry && (
                <button className="btn btn-ghost btn-sm" onClick={retry} style={{ flexShrink: 0 }}>
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          {/* Composer */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%', maxWidth: 820, margin: '0 auto', padding: '14px 12px 20px', borderTop: '1px solid var(--border)' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={streaming}
              rows={1}
              placeholder="Pergunte sobre o projeto…  (Enter envia, Shift+Enter quebra linha)"
              style={{ flex: 1, resize: 'none', minHeight: 40, maxHeight: 140, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
            {streaming ? (
              <button className="btn btn-ghost btn-sm" onClick={cancel} style={{ height: 40 }}>Cancelar</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => send(input)} disabled={!input.trim()} style={{ height: 40 }}>Enviar</button>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}

// ── Indicador animado de "digitando" ─────────────────────────────────────────
function TypingDots() {
  return (
    <span className="qa-typing" aria-label="carregando">
      <span /><span /><span />
    </span>
  );
}

// ── Bolha de mensagem ────────────────────────────────────────────────────────
function Bubble({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: 12,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: isUser ? 'var(--accent)' : 'var(--bg-input)',
          color: isUser ? '#fff' : 'var(--text-primary)',
          border: isUser ? 'none' : '1px solid var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
