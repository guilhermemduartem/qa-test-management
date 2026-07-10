import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  gerarCPF, formatarCPF,
  gerarRG, formatarRG,
  gerarCNPJ, formatarCNPJ,
  gerarPassaporteBR, gerarPassaporteInternacional,
  gerarEmail,
  gerarUUID,
  gerarLorem,
  gerarEnderecoBR,
  type EnderecoBR,
} from '../lib/generators';

type Tab = 'cpf' | 'rg' | 'cnpj' | 'passaporte' | 'email' | 'uuid' | 'lorem' | 'endereco' | 'ia';
type PassaporteSubtipo = 'br' | 'internacional';

const TABS_ROW1: { key: Tab; label: string }[] = [
  { key: 'cpf',        label: 'CPF' },
  { key: 'rg',         label: 'RG' },
  { key: 'cnpj',       label: 'CNPJ' },
  { key: 'passaporte', label: 'Pass.' },
  { key: 'email',      label: 'Email' },
];

const TABS_ROW2: { key: Tab; label: string }[] = [
  { key: 'endereco', label: 'Endereço' },
  { key: 'uuid',     label: 'UUID' },
  { key: 'lorem',    label: 'Lorem' },
  { key: 'ia',       label: 'Chat IA' },
];

const PROMPTS: Record<string, string> = {
  bdd:      'Gere cenários BDD no formato Dado/Quando/E Então (português) para a seguinte funcionalidade:\n\n',
  caso:     'Crie casos de teste (positivos, negativos e de borda) para:\n\n',
  corrigir: 'Corrija a gramática e ortografia mantendo o sentido original:\n\n',
  resumir:  'Resuma de forma clara e objetiva:\n\n',
  traduzir: 'Traduza para inglês (ou para português se já estiver em inglês):\n\n',
};

const PROMPT_LABELS: Record<string, string> = {
  bdd: 'BDD', caso: 'Caso de Teste', corrigir: 'Corrigir', resumir: 'Resumir', traduzir: 'Traduzir',
};

function genValue(tab: Tab, mask: boolean, alfanumerico: boolean, passSubtipo: PassaporteSubtipo): string {
  if (tab === 'cpf')        return formatarCPF(gerarCPF(), mask);
  if (tab === 'rg')         return formatarRG(gerarRG(), mask);
  if (tab === 'cnpj')       return formatarCNPJ(gerarCNPJ(alfanumerico), mask);
  if (tab === 'passaporte') return passSubtipo === 'br' ? gerarPassaporteBR() : gerarPassaporteInternacional();
  if (tab === 'email')      return gerarEmail();
  if (tab === 'uuid')       return gerarUUID();
  return '';
}

const IconWrench = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const IconCopy = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const FAB_SIZE = 58;
const STORAGE_KEY = 'ft-fab-pos';

function loadPos(): { bottom: number; right: number } {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { bottom: 28, right: 28 };
}

function clampPos(bottom: number, right: number) {
  const maxB = window.innerHeight - FAB_SIZE - 8;
  const maxR = window.innerWidth - FAB_SIZE - 8;
  return {
    bottom: Math.max(8, Math.min(bottom, maxB)),
    right: Math.max(8, Math.min(right, maxR)),
  };
}

function Widget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('cpf');
  const [mask, setMask] = useState(true);
  const [alfanumerico, setAlfanumerico] = useState(false);
  const [passSubtipo, setPassSubtipo] = useState<PassaporteSubtipo>('br');
  const [value, setValue] = useState(() => genValue('cpf', true, false, 'br'));
  const [copied, setCopied] = useState(false);
  const [loremWords, setLoremWords] = useState(25);
  const [loremText, setLoremText] = useState('');
  const [loremCopied, setLoremCopied] = useState(false);
  const [endereco, setEndereco] = useState<EnderecoBR | null>(null);
  const [endCopied, setEndCopied] = useState<string | null>(null);
  const [aiText, setAiText] = useState('');
  const [pos, setPos] = useState(loadPos);
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startBottom: number; startRight: number; moved: boolean; pointerId: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
      if (!dragRef.current.moved) return;
      const next = clampPos(dragRef.current.startBottom - dy, dragRef.current.startRight - dx);
      setPos(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      const { moved, pointerId } = dragRef.current;
      if (moved) {
        setPos((p) => { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); return p; });
      }
      dragRef.current = null;
      fabRef.current?.releasePointerCapture(pointerId);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, []);

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startBottom: pos.bottom, startRight: pos.right, moved: false, pointerId: e.pointerId };
  };

  const onFabClick = () => {
    if (dragRef.current?.moved) return;
    setOpen((v) => !v);
  };

  const regen = (t: Tab, m: boolean, alfa: boolean, ps: PassaporteSubtipo, lw: number) => {
    if (t === 'lorem') { setLoremText(gerarLorem(lw)); return; }
    if (t === 'endereco') { setEndereco(gerarEnderecoBR()); return; }
    if (t === 'ia') return;
    setValue(genValue(t, m, alfa, ps));
    setCopied(false);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'lorem' && !loremText) setLoremText(gerarLorem(loremWords));
    else if (t !== 'ia' && t !== 'endereco') { setValue(genValue(t, mask, alfanumerico, passSubtipo)); setCopied(false); }
  };

  const toggleMask = () => { const m = !mask; setMask(m); setValue(genValue(tab, m, alfanumerico, passSubtipo)); setCopied(false); };
  const toggleAlfa = () => { const a = !alfanumerico; setAlfanumerico(a); setValue(genValue(tab, mask, a, passSubtipo)); setCopied(false); };
  const switchPassSubtipo = (ps: PassaporteSubtipo) => { setPassSubtipo(ps); setValue(genValue(tab, mask, alfanumerico, ps)); setCopied(false); };

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const copyLorem = async () => {
    await navigator.clipboard.writeText(loremText);
    setLoremCopied(true);
    setTimeout(() => setLoremCopied(false), 1800);
  };

  const copyEnd = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setEndCopied(field);
    setTimeout(() => setEndCopied(null), 1600);
  };

  const changeLoremWords = (n: number) => {
    setLoremWords(n);
    setLoremText(gerarLorem(n));
  };

  const applyPrompt = (key: string) => {
    setAiText(PROMPTS[key]);
  };

  const sendToAI = () => {
    const q = aiText.trim();
    if (!q) return;
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(q)}`, '_blank');
  };

  const showMask = ['cpf', 'rg', 'cnpj'].includes(tab);
  const showAlfa = tab === 'cnpj';
  const showPassSub = tab === 'passaporte';
  const isSmallValue = ['email', 'uuid'].includes(tab);

  const panelBottom = pos.bottom + FAB_SIZE + 10;

  const endFields: [string, string][] = endereco
    ? [
        ['Rua', endereco.rua],
        ['Bairro', endereco.bairro],
        ['Cidade', `${endereco.cidade} — ${endereco.estado}`],
        ['CEP', endereco.cep],
      ]
    : [];

  return (
    <>
      {open && (
        <div className="ft-panel" ref={panelRef} style={{ bottom: panelBottom, right: pos.right }}>
          <div className="ft-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconWrench />
              <span>Gerador de Dados</span>
            </div>
            <button className="ft-close" onClick={() => setOpen(false)} title="Fechar">✕</button>
          </div>

          <div className="ft-tabs">
            <div className="ft-tabs-row">
              {TABS_ROW1.map((t) => (
                <button key={t.key} className={`ft-tab${tab === t.key ? ' active' : ''}`} onClick={() => switchTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="ft-tabs-row">
              {TABS_ROW2.map((t) => (
                <button key={t.key} className={`ft-tab${tab === t.key ? ' active' : ''}`} onClick={() => switchTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ft-body">
            {tab === 'ia' ? (
              <div className="ft-ai-wrap">
                <div className="ft-ai-prompts">
                  {Object.keys(PROMPTS).map((k) => (
                    <button key={k} className="ft-ai-prompt-btn" onClick={() => applyPrompt(k)}>
                      {PROMPT_LABELS[k]}
                    </button>
                  ))}
                </div>
                <textarea
                  className="ft-ai-input"
                  placeholder="Pergunte algo ou use um atalho acima..."
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                />
                <button className="ft-btn ft-btn-ai" onClick={sendToAI} disabled={!aiText.trim()}>
                  <IconSend /> Perguntar no ChatGPT
                </button>
              </div>
            ) : tab === 'endereco' ? (
              <>
                {endereco ? (
                  <div className="ft-end-fields">
                    {endFields.map(([lbl, val]) => (
                      <div key={lbl} className="ft-end-row">
                        <span className="ft-end-label">{lbl}</span>
                        <span className="ft-end-val">{val}</span>
                        <button className="ft-end-copy" onClick={() => copyEnd(val, lbl)} title="Copiar">
                          {endCopied === lbl ? <IconCheck /> : <IconCopy size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ft-value" style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                    Clique em Gerar
                  </div>
                )}
                <div className="ft-actions">
                  <button className="ft-btn" onClick={() => regen(tab, mask, alfanumerico, passSubtipo, loremWords)}>
                    <IconRefresh /> Gerar novo
                  </button>
                </div>
              </>
            ) : tab === 'lorem' ? (
              <>
                <div className="ft-lorem-opts">
                  <span className="ft-lorem-label">Palavras:</span>
                  <div className="ft-lorem-btns">
                    {[10, 25, 50, 100].map((n) => (
                      <button
                        key={n}
                        className={`ft-lorem-btn${loremWords === n ? ' active' : ''}`}
                        onClick={() => changeLoremWords(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ft-value ft-value-text">{loremText || 'Clique em Gerar novo'}</div>
                <div className="ft-actions">
                  <button className={`ft-btn ft-btn-copy${loremCopied ? ' copied' : ''}`} onClick={copyLorem}>
                    {loremCopied ? <><IconCheck /> Copiado</> : <><IconCopy /> Copiar</>}
                  </button>
                  <button className="ft-btn" onClick={() => setLoremText(gerarLorem(loremWords))}>
                    <IconRefresh /> Gerar novo
                  </button>
                </div>
              </>
            ) : (
              <>
                {showPassSub && (
                  <div className="ft-segmented">
                    <button className={`ft-seg-btn${passSubtipo === 'br' ? ' active' : ''}`} onClick={() => switchPassSubtipo('br')}>
                      🇧🇷 Brasil
                    </button>
                    <button className={`ft-seg-btn${passSubtipo === 'internacional' ? ' active' : ''}`} onClick={() => switchPassSubtipo('internacional')}>
                      🌐 Internacional
                    </button>
                  </div>
                )}
                {showPassSub && (
                  <div className="ft-pass-info">
                    {passSubtipo === 'br'
                      ? <span>2 letras + 6 dígitos <em>(padrão BR desde 2010)</em></span>
                      : <span>2 letras + 7 dígitos <em>(padrão ICAO 9303)</em></span>}
                  </div>
                )}
                <div className={`ft-value${isSmallValue ? ' ft-value-sm' : ''}`}>{value}</div>
                <div className="ft-actions">
                  <button className={`ft-btn ft-btn-copy${copied ? ' copied' : ''}`} onClick={copy}>
                    {copied ? <><IconCheck /> Copiado</> : <><IconCopy /> Copiar</>}
                  </button>
                  <button className="ft-btn" onClick={() => regen(tab, mask, alfanumerico, passSubtipo, loremWords)}>
                    <IconRefresh /> Gerar novo
                  </button>
                </div>
                {(showMask || showAlfa) && (
                  <div className="ft-options">
                    {showMask && (
                      <label className="ft-mask-toggle">
                        <input type="checkbox" checked={mask} onChange={toggleMask} />
                        Com máscara
                      </label>
                    )}
                    {showAlfa && (
                      <label className="ft-mask-toggle">
                        <input type="checkbox" checked={alfanumerico} onChange={toggleAlfa} />
                        Com letras
                      </label>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <button
        ref={fabRef}
        className={`ft-fab${open ? ' open' : ''}`}
        style={{ bottom: pos.bottom, right: pos.right, cursor: 'grab' }}
        onPointerDown={onFabPointerDown}
        onClick={onFabClick}
        title="Gerador de dados (arraste para mover)"
      >
        <IconWrench />
      </button>
    </>
  );
}

export function FloatingToolsWidget() {
  return createPortal(<Widget />, document.body);
}
