/* ═══════════════════════════════════════════════════════════════════════════
   Gerador de Dados — content script
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  if (window.__cpfFabInjected) return;
  window.__cpfFabInjected = true;

  /* ───────────────────────── Geradores ───────────────────────── */
  function gerarCPF() {
    const d = [];
    for (let i = 0; i < 9; i++) d.push(Math.floor(Math.random() * 10));
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += d[i] * (10 - i);
    let resto = soma % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
    soma = 0;
    for (let i = 0; i < 10; i++) soma += d[i] * (11 - i);
    resto = soma % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
    return d.join('');
  }
  const formatarCPF = (cpf, m) => (m ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf);

  function randomCnpjChar() { return '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)]; }
  function cnpjCharValue(ch) {
    return ch.toUpperCase().charCodeAt(0) - 48;
  }
  function calcularDvCnpj(base) {
    let soma = 0, peso = 5;
    for (let i = 0; i < base.length; i++) { soma += cnpjCharValue(base[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    let r = soma % 11; const dv1 = r < 2 ? 0 : 11 - r;
    soma = 0; peso = 6;
    const full = base + String(dv1);
    for (let i = 0; i < full.length; i++) { soma += cnpjCharValue(full[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    r = soma % 11; const dv2 = r < 2 ? 0 : 11 - r;
    return `${dv1}${dv2}`;
  }
  function gerarCNPJ(alfa) {
    const base = alfa
      ? Array.from({ length: 12 }, randomCnpjChar).join('')
      : Array.from({ length: 12 }, () => String(Math.floor(Math.random() * 10))).join('');
    return base + calcularDvCnpj(base);
  }
  function formatarCNPJ(cnpj, m) {
    if (!m) return cnpj;
    const c = String(cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (c.length !== 14) return cnpj;
    return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12,14)}`;
  }
  function gerarRG() {
    let rg = '';
    for (let i = 0; i < 8; i++) rg += Math.floor(Math.random() * 10);
    let soma = 0, peso = 2;
    for (let i = 0; i < 8; i++) { soma += parseInt(rg[i], 10) * peso; peso++; }
    const resto = soma % 11;
    let dig = resto === 0 ? 0 : 11 - resto;
    if (dig === 10) dig = 'X';
    return rg + dig;
  }
  const formatarRG = (rg, m) => (m ? rg.replace(/(\d{2})(\d{3})(\d{3})(\w{1})/, '$1.$2.$3-$4') : rg);

  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const rndLetra = () => LETRAS[Math.floor(Math.random() * LETRAS.length)];
  const rndDig = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  const gerarPassaporteBR = () => `${rndLetra()}${rndLetra()}${rndDig(6)}`;
  const gerarPassaporteInternacional = () => `${rndLetra()}${rndLetra()}${rndDig(7)}`;

  function gerarEmail() {
    const nomes = [
      // comuns BR
      'ana','bruno','carlos','diana','edu','fernanda','gabriel','helena','igor','julia',
      'lucas','mariana','nicolas','olivia','pedro','rafaela','sergio','tatiana','vitor','yasmin',
      'joao','beatriz','rafael','camila','thiago','larissa','matheus','leticia','rodrigo','amanda',
      // gregos
      'zeus','hermes','apollo','artemis','athena','poseidon','ares','hera','nike','iris',
      'daphne','atlas','titan','phoenix','kronos','helios','selene','eros','tyche','nyx',
      // engraçados / apelidos
      'zezinho','binho','dudinha','teteu','xuxu','fofo','pipoca','cebola','batata','churros',
      'fofinho','chapolin','ninja','pirata','vampiro','lobisomem','monstrao','maromba',
      'bolinha','gatinho','amendoim','biscoito','mingau','doido','maluco','turbo','flashzin',
    ];
    const doms = ['gmail.com','hotmail.com','yahoo.com.br','outlook.com','icloud.com','teste.com.br'];
    const pick = () => nomes[Math.floor(Math.random()*nomes.length)];
    const n = Math.floor(Math.random()*9999)+1;
    return `${pick()}.${pick()}${n}@${doms[Math.floor(Math.random()*doms.length)]}`;
  }

  function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const LOREM_W = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
  function gerarLorem(n) {
    const words = Array.from({ length: n }, (_, i) => LOREM_W[i % LOREM_W.length]);
    const t = words.join(' ');
    return t.charAt(0).toUpperCase() + t.slice(1) + '.';
  }

  /* Todos validados na ViaCEP (base oficial dos Correios) — logradouro, bairro e CEP exatos. */
  const ENDERECOS = [
    // São Paulo — SP
    { rua: 'Avenida Paulista',                bairro: 'Bela Vista',       cidade: 'São Paulo',      estado: 'SP', cep: '01310-100' },
    { rua: 'Rua Augusta',                     bairro: 'Consolação',       cidade: 'São Paulo',      estado: 'SP', cep: '01305-100' },
    { rua: 'Rua Oscar Freire',                bairro: 'Cerqueira César',  cidade: 'São Paulo',      estado: 'SP', cep: '01426-001' },
    { rua: 'Avenida Brigadeiro Faria Lima',   bairro: 'Jardim Paulistano',cidade: 'São Paulo',      estado: 'SP', cep: '01452-001' },
    { rua: 'Rua Haddock Lobo',                bairro: 'Cerqueira César',  cidade: 'São Paulo',      estado: 'SP', cep: '01414-001' },
    // Rio de Janeiro — RJ
    { rua: 'Avenida Atlântica',               bairro: 'Copacabana',       cidade: 'Rio de Janeiro', estado: 'RJ', cep: '22021-001' },
    { rua: 'Rua Visconde de Pirajá',          bairro: 'Ipanema',          cidade: 'Rio de Janeiro', estado: 'RJ', cep: '22410-003' },
    { rua: 'Rua Barata Ribeiro',              bairro: 'Copacabana',       cidade: 'Rio de Janeiro', estado: 'RJ', cep: '22011-002' },
    { rua: 'Rua do Ouvidor',                  bairro: 'Centro',           cidade: 'Rio de Janeiro', estado: 'RJ', cep: '20040-030' },
    // Belo Horizonte — MG
    { rua: 'Avenida Afonso Pena',             bairro: 'Cruzeiro',         cidade: 'Belo Horizonte', estado: 'MG', cep: '30130-009' },
    { rua: 'Rua da Bahia',                    bairro: 'Centro',           cidade: 'Belo Horizonte', estado: 'MG', cep: '30160-010' },
    { rua: 'Avenida do Contorno',             bairro: 'Santa Efigênia',   cidade: 'Belo Horizonte', estado: 'MG', cep: '30110-017' },
    // Curitiba — PR
    { rua: 'Travessa Frei Caneca',            bairro: 'Centro',           cidade: 'Curitiba',       estado: 'PR', cep: '80010-090' },
    { rua: 'Avenida do Batel',                bairro: 'Batel',            cidade: 'Curitiba',       estado: 'PR', cep: '80420-090' },
    { rua: 'Rua Marechal Deodoro',            bairro: 'Centro',           cidade: 'Curitiba',       estado: 'PR', cep: '80010-010' },
    // Porto Alegre — RS
    { rua: 'Rua dos Andradas',                bairro: 'Centro Histórico', cidade: 'Porto Alegre',   estado: 'RS', cep: '90020-005' },
    { rua: 'Avenida Borges de Medeiros',      bairro: 'Centro Histórico', cidade: 'Porto Alegre',   estado: 'RS', cep: '90020-021' },
    { rua: 'Rua Padre Chagas',                bairro: 'Moinhos de Vento', cidade: 'Porto Alegre',   estado: 'RS', cep: '90570-080' },
    // Salvador — BA
    { rua: 'Rua Chile',                       bairro: 'Centro Histórico', cidade: 'Salvador',       estado: 'BA', cep: '40026-032' },
    { rua: 'Avenida Estados Unidos',          bairro: 'Comércio',         cidade: 'Salvador',       estado: 'BA', cep: '40010-020' },
    // Fortaleza — CE
    { rua: 'Avenida Beira Mar',               bairro: 'Mucuripe',         cidade: 'Fortaleza',      estado: 'CE', cep: '60165-121' },
    { rua: 'Rua Tibúrcio Cavalcanti',         bairro: 'Meireles',         cidade: 'Fortaleza',      estado: 'CE', cep: '60125-100' },
    // Brasília — DF
    { rua: 'Quadra SQN 206 Bloco E',          bairro: 'Asa Norte',        cidade: 'Brasília',       estado: 'DF', cep: '70844-050' },
    { rua: 'Quadra SQS 108',                  bairro: 'Asa Sul',          cidade: 'Brasília',       estado: 'DF', cep: '70347-000' },
    // Manaus — AM
    { rua: 'Avenida Eduardo Ribeiro',         bairro: 'Centro',           cidade: 'Manaus',         estado: 'AM', cep: '69010-001' },
    { rua: 'Rua Japurá',                      bairro: 'Centro',           cidade: 'Manaus',         estado: 'AM', cep: '69025-020' },
    // Recife — PE
    { rua: 'Avenida Boa Viagem',              bairro: 'Pina',             cidade: 'Recife',         estado: 'PE', cep: '51011-000' },
    { rua: 'Rua do Bom Jesus',                bairro: 'Recife',           cidade: 'Recife',         estado: 'PE', cep: '50030-170' },
  ];
  function gerarEndereco() {
    const t = ENDERECOS[Math.floor(Math.random() * ENDERECOS.length)];
    const num = Math.floor(Math.random() * 2000) + 1;
    const compl = Math.random() > 0.65 ? `, Apto ${Math.floor(Math.random() * 200) + 1}` : '';
    return { rua: `${t.rua}, ${num}${compl}`, bairro: t.bairro, cidade: t.cidade, estado: t.estado, cep: t.cep };
  }

  function gen(tab, mask, alfa, passSub, loremWords) {
    if (tab === 'cpf') return formatarCPF(gerarCPF(), mask);
    if (tab === 'rg') return formatarRG(gerarRG(), mask);
    if (tab === 'cnpj') return formatarCNPJ(gerarCNPJ(alfa), mask);
    if (tab === 'passaporte') return passSub === 'br' ? gerarPassaporteBR() : gerarPassaporteInternacional();
    if (tab === 'email') return gerarEmail();
    if (tab === 'uuid') return gerarUUID();
    if (tab === 'lorem') return gerarLorem(loremWords);
    return '';
  }

  /* ───────────────────────── Estado ───────────────────────── */
  const FAB = 58;
  const TABS_ROW1 = [['cpf','CPF'],['rg','RG'],['cnpj','CNPJ'],['passaporte','Pass.'],['email','Email']];
  const TABS_ROW2 = [['endereco','Endereço'],['uuid','UUID'],['lorem','Lorem'],['ia','Chat IA']];

  const PROMPTS = {
    bdd:      'Gere cenários BDD no formato Dado/Quando/E Então (português) para a seguinte funcionalidade:\n\n',
    caso:     'Crie casos de teste (positivos, negativos e de borda) para:\n\n',
    corrigir: 'Corrija a gramática e ortografia mantendo o sentido original:\n\n',
    resumir:  'Resuma de forma clara e objetiva:\n\n',
    traduzir: 'Traduza para inglês (ou para português se já estiver em inglês):\n\n',
  };
  const PROMPT_LABELS = { bdd:'BDD', caso:'Caso de Teste', corrigir:'Corrigir', resumir:'Resumir', traduzir:'Traduzir' };

  const st = { tab: 'cpf', mask: true, alfa: false, passSub: 'br', value: '', loremWords: 25, loremText: '', endereco: null, open: false, hidden: true, aiText: '' };
  let pos = { bottom: 28, right: 28 };
  const drag = { active: false, startX: 0, startY: 0, startBottom: 0, startRight: 0, moved: false };

  function clampPos(b, r) {
    return { bottom: Math.max(8, Math.min(b, window.innerHeight - FAB - 8)), right: Math.max(8, Math.min(r, window.innerWidth - FAB - 8)) };
  }

  const KEY = 'cpf_fab_state';
  /* Visibilidade por aba fica no background (chrome.storage.session keyed por
     tabId) — sobrevive a refresh e à navegação entre sites na mesma aba. */
  function loadHidden() {
    try {
      chrome?.runtime?.sendMessage({ type: 'GET_FAB_VIS' }, (r) => {
        if (chrome.runtime.lastError) return;
        if (r && typeof r.visible === 'boolean') { st.hidden = !r.visible; render(); }
      });
    } catch { /**/ }
  }
  function savePersist() {
    const data = { pos, tab: st.tab, mask: st.mask, alfa: st.alfa, passSub: st.passSub, loremWords: st.loremWords };
    try { chrome?.storage?.local?.set({ [KEY]: data }); } catch { /**/ }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /**/ }
  }
  function loadPersist(cb) {
    function apply(d) {
      if (d.pos) pos = d.pos;
      if (d.tab) st.tab = d.tab;
      if (typeof d.mask === 'boolean') st.mask = d.mask;
      if (typeof d.alfa === 'boolean') st.alfa = d.alfa;
      if (d.passSub) st.passSub = d.passSub;
      if (typeof d.loremWords === 'number') st.loremWords = d.loremWords;
    }
    try {
      chrome?.storage?.local?.get([KEY], (r) => {
        const d = r && r[KEY];
        if (d) apply(d);
        else { try { const ls = JSON.parse(localStorage.getItem(KEY)||'null'); if (ls) apply(ls); } catch { /**/ } }
        cb();
      });
      return;
    } catch { /**/ }
    try { const ls = JSON.parse(localStorage.getItem(KEY)||'null'); if (ls) apply(ls); } catch { /**/ }
    cb();
  }

  /* ───────────────────────── DOM / Shadow ───────────────────────── */
  const host = document.createElement('div');
  host.id = 'cpf-fab-host';
  host.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647;';
  function mountHost() { (document.body || document.documentElement).appendChild(host); }
  if (document.body) mountHost();
  else document.addEventListener('DOMContentLoaded', mountHost, { once: true });
  const root = host.attachShadow({ mode: 'open' });

  const ACCENT = '#71717a', ACCENT_DARK = '#52525b';
  const BG = '#1e1e1e', BG2 = '#2a2a2a', BORDER = '#3d3d3d';
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .fab {
      position: fixed; width: ${FAB}px; height: ${FAB}px; border-radius: 50%;
      background: #d4d4d8; color: #71717a; border: none; cursor: grab;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,.18); z-index: 2147483647;
      transition: transform .18s, box-shadow .18s, background .18s;
    }
    .fab:hover { transform: scale(1.09); box-shadow: 0 6px 24px rgba(0,0,0,.34); }
    .fab.open { background: #a1a1aa; color: #fff; }
    .fab svg { pointer-events: none; width: 24px; height: 24px; }
    .panel {
      position: fixed; width: 380px; background: ${BG}; border: 1px solid ${BORDER};
      border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.45); z-index: 2147483646;
      overflow: hidden; color: #e6e6e6; animation: fadein .18s ease;
    }
    @keyframes fadein { from { opacity:0; transform:translateY(8px) scale(.98); } to { opacity:1; transform:none; } }
    .ph { display:flex; align-items:center; justify-content:space-between; padding:11px 14px; background:${ACCENT}; color:#fff; font-weight:600; font-size:13px; }
    .ph-l { display:flex; align-items:center; gap:8px; }
    .ph svg { width:18px; height:18px; }
    .close { background:none; border:none; color:rgba(255,255,255,.75); cursor:pointer; font-size:15px; line-height:1; padding:2px 6px; border-radius:4px; }
    .close:hover { color:#fff; background:rgba(255,255,255,.15); }
    .tabs { background:${BG2}; border-bottom:1px solid ${BORDER}; }
    .tabs-row { display:flex; }
    .tabs-row:first-child { border-bottom:1px solid rgba(255,255,255,.06); }
    .tab { flex:1; padding:8px 4px; background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; font-size:12px; font-weight:600; color:#a1a1aa; letter-spacing:.2px; }
    .tab.active { color:#fff; border-bottom-color:#a1a1aa; }
    .tab:hover:not(.active) { color:#e6e6e6; }
    .body { padding:16px; display:flex; flex-direction:column; gap:12px; }
    .value { font-family:'SFMono-Regular',Consolas,monospace; font-size:19px; font-weight:700; color:#fff; text-align:center; padding:14px 10px; background:#141414; border-radius:10px; border:1px solid ${BORDER}; letter-spacing:1.5px; min-height:52px; display:flex; align-items:center; justify-content:center; user-select:all; word-break:break-all; }
    .value-sm { font-size:13px !important; letter-spacing:.4px !important; font-weight:500 !important; padding:11px 12px !important; }
    .value-text { display:block !important; font-family:-apple-system,Segoe UI,Roboto,sans-serif !important; font-size:13px !important; text-align:left !important; letter-spacing:0 !important; line-height:1.6 !important; font-weight:400 !important; min-height:auto !important; padding:12px !important; }
    .actions { display:flex; gap:8px; }
    .btn { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:5px; padding:8px; border-radius:8px; border:1px solid ${BORDER}; background:${BG2}; color:#d4d4d8; font-size:12px; font-weight:500; cursor:pointer; }
    .btn:hover { background:#333; color:#fff; }
    .btn svg { width:14px; height:14px; }
    .btn-copy.copied { background:rgba(34,197,94,.14); color:#4ade80; border-color:rgba(34,197,94,.4); }
    .options { display:flex; gap:16px; flex-wrap:wrap; }
    .toggle { display:flex; align-items:center; gap:6px; font-size:12px; color:#d4d4d8; cursor:pointer; user-select:none; }
    .toggle input { cursor:pointer; accent-color:${ACCENT}; width:14px; height:14px; }
    .seg { display:flex; border:1px solid ${BORDER}; border-radius:8px; overflow:hidden; background:${BG2}; }
    .seg-btn { flex:1; padding:7px 10px; background:none; border:none; border-right:1px solid ${BORDER}; font-size:12px; font-weight:500; color:#d4d4d8; cursor:pointer; }
    .seg-btn:last-child { border-right:none; }
    .seg-btn.active { background:${ACCENT}; color:#fff; }
    .seg-btn:not(.active):hover { background:#333; color:#fff; }
    .pass-info { font-size:11px; color:#a1a1aa; text-align:center; }
    .pass-info em { opacity:.75; }
    .end-fields { display:flex; flex-direction:column; gap:6px; }
    .end-row { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#141414; border-radius:8px; border:1px solid ${BORDER}; }
    .end-label { font-size:10px; color:#a1a1aa; text-transform:uppercase; letter-spacing:.5px; width:48px; flex-shrink:0; }
    .end-val { flex:1; font-size:13px; color:#e6e6e6; user-select:all; }
    .end-copy { background:none; border:none; cursor:pointer; color:#555; padding:3px; display:flex; align-items:center; border-radius:4px; flex-shrink:0; }
    .end-copy:hover { color:#fff; background:#333; }
    .end-copy svg { width:13px; height:13px; }
    .lorem-opts { display:flex; align-items:center; gap:10px; }
    .lorem-label { font-size:12px; color:#d4d4d8; }
    .lorem-btns { display:flex; gap:4px; }
    .lorem-btn { padding:4px 10px; border-radius:6px; border:1px solid ${BORDER}; background:${BG2}; color:#d4d4d8; font-size:12px; cursor:pointer; font-weight:500; }
    .lorem-btn.active { background:${ACCENT}; color:#fff; border-color:${ACCENT}; }
    .lorem-btn:not(.active):hover { background:#333; color:#fff; }
    .ai-wrap { display:flex; flex-direction:column; gap:10px; }
    .ai-prompts { display:flex; gap:5px; flex-wrap:wrap; }
    .ai-prompt-btn { padding:5px 9px; border-radius:6px; border:1px solid ${BORDER}; background:${BG2}; color:#d4d4d8; font-size:11px; cursor:pointer; font-weight:500; }
    .ai-prompt-btn:hover { background:#333; color:#fff; }
    .ai-input { width:100%; min-height:168px; background:#141414; border:1px solid ${BORDER}; border-radius:10px; color:#e6e6e6; font-size:13px; padding:10px 12px; resize:vertical; font-family:inherit; outline:none; line-height:1.5; }
    .ai-input::placeholder { color:#555; }
    .ai-input:focus { border-color:${ACCENT}; }
    .btn-ai { width:100%; gap:7px; background:${ACCENT}; color:#fff; border-color:${ACCENT}; }
    .btn-ai:hover { background:${ACCENT_DARK}; border-color:${ACCENT_DARK}; color:#fff; }
    .btn-ai:disabled { opacity:.4; cursor:not-allowed; }
    .hidden { display:none !important; }
  `;
  root.appendChild(style);

  const ICON_DICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4.5"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.3" fill="currentColor" stroke="none"/></svg>';
  const ICON_COPY   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const ICON_CHECK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_REFRESH= '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  const ICON_SEND   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  const wrap = document.createElement('div');
  root.appendChild(wrap);

  function tabsHtml(rows) {
    return rows.map(([k, l]) => `<button class="tab${st.tab === k ? ' active' : ''}" data-tab="${k}">${l}</button>`).join('');
  }

  function render() {
    const isIA       = st.tab === 'ia';
    const isEndereco = st.tab === 'endereco';
    const isLorem    = st.tab === 'lorem';
    const showMask   = ['cpf','rg','cnpj'].includes(st.tab);
    const showAlfa   = st.tab === 'cnpj';
    const showPass   = st.tab === 'passaporte';
    const panelBottom = pos.bottom + FAB + 10;

    const endHtml = st.endereco ? `
      <div class="end-fields">
        ${[['Rua', st.endereco.rua],['Bairro', st.endereco.bairro],['Cidade', `${st.endereco.cidade} — ${st.endereco.estado}`],['CEP', st.endereco.cep]]
          .map(([lbl, val]) => `
            <div class="end-row">
              <span class="end-label">${lbl}</span>
              <span class="end-val">${val}</span>
              <button class="end-copy" data-copy="${val}" title="Copiar">${ICON_COPY}</button>
            </div>`).join('')}
      </div>` : '<div class="value" style="font-size:14px;color:#666;">Clique em Gerar</div>';

    wrap.innerHTML = `
      ${st.open ? `
      <div class="panel" style="bottom:${panelBottom}px; right:${pos.right}px;">
        <div class="ph">
          <div class="ph-l">${ICON_DICE}<span>Gerador de Dados</span></div>
          <button class="close" data-act="close" title="Fechar">✕</button>
        </div>
        <div class="tabs">
          <div class="tabs-row">${tabsHtml(TABS_ROW1)}</div>
          <div class="tabs-row">${tabsHtml(TABS_ROW2)}</div>
        </div>
        <div class="body">
          ${isIA ? `
            <div class="ai-wrap">
              <div class="ai-prompts">
                ${Object.keys(PROMPTS).map(k => `<button class="ai-prompt-btn" data-prompt="${k}">${PROMPT_LABELS[k]}</button>`).join('')}
              </div>
              <textarea class="ai-input" data-act="ai-input" placeholder="Pergunte algo ou use um atalho acima...">${st.aiText}</textarea>
              <button class="btn btn-ai" data-act="ai-send" ${!st.aiText.trim() ? 'disabled' : ''}>${ICON_SEND} Perguntar no ChatGPT</button>
            </div>
          ` : isEndereco ? `
            ${endHtml}
            <div class="actions">
              <button class="btn" data-act="regen">${ICON_REFRESH} Gerar novo</button>
            </div>
          ` : isLorem ? `
            <div class="lorem-opts">
              <span class="lorem-label">Palavras:</span>
              <div class="lorem-btns">
                ${[10, 25, 50, 100].map(n => '<button class="lorem-btn' + (st.loremWords === n ? ' active' : '') + '" data-words="' + n + '">' + n + '</button>').join('')}
              </div>
            </div>
            <div class="value value-text" id="lorem-val">${st.loremText || 'Clique em Gerar novo'}</div>
            <div class="actions">
              <button class="btn btn-copy" data-act="lorem-copy">${ICON_COPY} Copiar</button>
              <button class="btn" data-act="lorem-regen">${ICON_REFRESH} Gerar novo</button>
            </div>
          ` : `
            ${showPass ? `
              <div class="seg">
                <button class="seg-btn${st.passSub === 'br' ? ' active' : ''}" data-pass="br">🇧🇷 Brasil</button>
                <button class="seg-btn${st.passSub === 'internacional' ? ' active' : ''}" data-pass="internacional">🌐 Internacional</button>
              </div>
              <div class="pass-info">${st.passSub === 'br' ? '2 letras + 6 dígitos <em>(padrão BR desde 2010)</em>' : '2 letras + 7 dígitos <em>(padrão ICAO 9303)</em>'}</div>
            ` : ''}
            <div class="value${['email','uuid'].includes(st.tab) ? ' value-sm' : ''}">${st.value}</div>
            <div class="actions">
              <button class="btn btn-copy" data-act="copy">${ICON_COPY} Copiar</button>
              <button class="btn" data-act="regen">${ICON_REFRESH} Gerar novo</button>
            </div>
            ${(showMask || showAlfa) ? `
              <div class="options">
                ${showMask ? `<label class="toggle"><input type="checkbox" data-act="mask" ${st.mask ? 'checked' : ''}> Com máscara</label>` : ''}
                ${showAlfa ? `<label class="toggle"><input type="checkbox" data-act="alfa" ${st.alfa ? 'checked' : ''}> Com letras</label>` : ''}
              </div>` : ''}
          `}
        </div>
      </div>` : ''}
      <button class="fab${st.open ? ' open' : ''} ${st.hidden ? 'hidden' : ''}" style="bottom:${pos.bottom}px; right:${pos.right}px;" title="Gerador de dados (arraste para mover)">${ICON_DICE}</button>
    `;
    bind();
  }

  function regen() {
    if (st.tab === 'ia') { render(); return; }
    if (st.tab === 'endereco') { st.endereco = gerarEndereco(); render(); return; }
    if (st.tab === 'lorem') { st.loremText = gerarLorem(st.loremWords); render(); return; }
    st.value = gen(st.tab, st.mask, st.alfa, st.passSub);
    render();
  }

  async function copyText(text, btn, origHtml) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /**/ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch { /**/ }
    }
    if (ok && btn) {
      btn.innerHTML = `${ICON_CHECK} Copiado`;
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('copied'); }, 1600);
    }
  }

  function bind() {
    const fab = wrap.querySelector('.fab');
    if (fab) { fab.addEventListener('pointerdown', onFabDown); fab.addEventListener('click', onFabClick); }

    wrap.querySelectorAll('[data-tab]').forEach((el) =>
      el.addEventListener('click', () => {
        st.tab = el.dataset.tab;
        if (st.tab === 'lorem' && !st.loremText) st.loremText = gerarLorem(st.loremWords);
        regen();
        savePersist();
      }));
    wrap.querySelectorAll('[data-pass]').forEach((el) =>
      el.addEventListener('click', () => { st.passSub = el.dataset.pass; regen(); savePersist(); }));

    const close = wrap.querySelector('[data-act="close"]');
    if (close) close.addEventListener('click', () => { st.open = false; render(); });

    const copy = wrap.querySelector('[data-act="copy"]');
    if (copy) copy.addEventListener('click', () => copyText(st.value, copy, `${ICON_COPY} Copiar`));

    const re = wrap.querySelector('[data-act="regen"]');
    if (re) re.addEventListener('click', regen);

    const loremCopy = wrap.querySelector('[data-act="lorem-copy"]');
    if (loremCopy) loremCopy.addEventListener('click', () => copyText(st.loremText, loremCopy, `${ICON_COPY} Copiar`));

    const loremRegen = wrap.querySelector('[data-act="lorem-regen"]');
    if (loremRegen) loremRegen.addEventListener('click', () => { st.loremText = gerarLorem(st.loremWords); regen(); });

    const mask = wrap.querySelector('[data-act="mask"]');
    if (mask) mask.addEventListener('change', () => { st.mask = mask.checked; regen(); savePersist(); });
    const alfa = wrap.querySelector('[data-act="alfa"]');
    if (alfa) alfa.addEventListener('change', () => { st.alfa = alfa.checked; regen(); savePersist(); });

    wrap.querySelectorAll('.end-copy').forEach((btn) =>
      btn.addEventListener('click', () => copyText(btn.dataset.copy, btn, ICON_COPY)));

    wrap.querySelectorAll('[data-words]').forEach((btn) =>
      btn.addEventListener('click', () => { st.loremWords = parseInt(btn.dataset.words); regen(); savePersist(); }));

    const aiInput = wrap.querySelector('[data-act="ai-input"]');
    if (aiInput) {
      aiInput.addEventListener('input', () => {
        st.aiText = aiInput.value;
        const sendBtn = wrap.querySelector('[data-act="ai-send"]');
        if (sendBtn) sendBtn.disabled = !st.aiText.trim();
      });
      ['keydown', 'keyup', 'keypress'].forEach((ev) =>
        aiInput.addEventListener(ev, (e) => e.stopPropagation()));
    }

    wrap.querySelectorAll('[data-prompt]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const tpl = PROMPTS[btn.dataset.prompt];
        st.aiText = tpl;
        const ta = wrap.querySelector('[data-act="ai-input"]');
        if (ta) { ta.value = tpl; ta.focus(); ta.setSelectionRange(tpl.length, tpl.length); }
        const sendBtn = wrap.querySelector('[data-act="ai-send"]');
        if (sendBtn) sendBtn.disabled = false;
      }));

    const aiSend = wrap.querySelector('[data-act="ai-send"]');
    if (aiSend) aiSend.addEventListener('click', () => {
      const q = st.aiText.trim();
      if (!q) return;
      window.open(`https://chatgpt.com/?q=${encodeURIComponent(q)}`, '_blank');
    });
  }

  function onFabDown(e) {
    drag.active = true; drag.moved = false;
    drag.startX = e.clientX; drag.startY = e.clientY;
    drag.startBottom = pos.bottom; drag.startRight = pos.right;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /**/ }
  }
  function onFabClick() {
    if (drag.moved) return;
    st.open = !st.open;
    if (st.open) regen(); else render();
  }

  document.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    pos = clampPos(drag.startBottom - dy, drag.startRight - dx);
    const fab = wrap.querySelector('.fab');
    if (fab) { fab.style.bottom = pos.bottom + 'px'; fab.style.right = pos.right + 'px'; }
    const panel = wrap.querySelector('.panel');
    if (panel) { panel.style.bottom = (pos.bottom + FAB + 10) + 'px'; panel.style.right = pos.right + 'px'; }
  });
  document.addEventListener('pointerup', () => {
    if (drag.active && drag.moved) savePersist();
    drag.active = false;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) { st.open = false; render(); } });

  try {
    chrome?.runtime?.onMessage?.addListener((msg) => {
      if (msg && msg.type === 'SET_FAB') { st.hidden = !msg.visible; if (st.hidden) st.open = false; render(); }
    });
  } catch { /**/ }

  loadHidden();
  try {
    st.value = gen(st.tab, st.mask, st.alfa, st.passSub, st.loremWords);
    pos = clampPos(pos.bottom, pos.right);
    render();
  } catch (err) { console.error('[Gerador de Dados]', err); }

  try {
    loadPersist(() => {
      if (st.tab === 'lorem') st.loremText = gerarLorem(st.loremWords);
      else if (st.tab !== 'ia' && st.tab !== 'endereco') st.value = gen(st.tab, st.mask, st.alfa, st.passSub);
      pos = clampPos(pos.bottom, pos.right);
      render();
    });
  } catch { /**/ }
})();
