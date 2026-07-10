/* ═══════════════════════════════════════════════════════════
   LoginPage — porta do componente React de login.html.
   ═══════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { isAuthenticated, currentUser } from '../lib/auth';

const homeFor = () => currentUser()?.role === 'qa' ? '/testes' : '/testes/relatorios';

/* Mini-jogo "caça-bugs" do fundo da tela de login */
const GAME_SECONDS = 60;
const GAME_BUGS = 80;     // total mantido na tela durante o jogo
const BUG_WAVE = 14;      // quantos nascem por onda
const IDLE_BUGS = 3; // idle: 1 isca pequena nítida + 2 foscos
// tamanho variado e estável por índice (de ~26 a ~67px)
const bugSizeFor = (i: number) => 26 + ((i * 37) % 42);
const OVER_RESET_SECONDS = 10;   // auto-reset da tela de fim sem ação
const BUG_SPEED = 1.8;            // velocidade constante dos bugs durante o jogo

// Power-ups (ícones de QA viram habilidades)
const POWER_COOLDOWN_MS = 12000; // tempo pra o power-up reaparecer após usar
const FREEZE_MS = 3000;          // ⚠️ congela os bugs
const INSPECT_MS = 4000;         // 🔍 raio-x (vê e clica nos bugs atrás do card)
const BOMB_RADIUS = 430;         // 🧪 raio da bomba de teste
const FAIL_PENALTY_S = 5;        // ❌ armadilha: perde segundos
const bugColor = (i: number) => (i % 2 ? '16a34a' : '22c55e');

type Phase = 'idle' | 'playing' | 'over';

// Legenda dos poderes (canto inferior esquerdo durante o jogo)
const POWER_LEGEND = [
  { c: '67e8f9', icon: 'search',            name: 'Inspeção',            desc: 'vê e clica nos bugs atrás do card', dur: '4s' },
  { c: '34d399', icon: 'circle-check-big',  name: 'Regressão',           desc: 'mata os bugs parados no meio',      dur: 'instantâneo' },
  { c: 'fbbf24', icon: 'triangle-alert',    name: 'Congelar',            desc: 'congela todos os bugs',             dur: '3s' },
  { c: 'f0abfc', icon: 'flask-conical',     name: 'Teste automatizado',  desc: 'bombardeia a tela toda',            dur: 'instantâneo' },
  { c: 'fb7185', icon: 'circle-x',          name: 'Extermínio',          desc: 'mata TODOS os bugs da tela',        dur: 'instantâneo' },
  { c: '818cf8', icon: 'compass',           name: 'Teste exploratório',  desc: 'espalha os bugs escondidos',        dur: '6s' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [bugScore, setBugScore] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [bugCount, setBugCount] = useState(IDLE_BUGS);
  const [round, setRound] = useState(0);
  const [overLeft, setOverLeft] = useState(OVER_RESET_SECONDS);
  const [inspecting, setInspecting] = useState(false); // 🔍 raio-x ativo
  const [frozen, setFrozen] = useState(false);         // ⚠️ congelado
  const [penalty, setPenalty] = useState(false);       // ❌ flash de extermínio
  const [bombing, setBombing] = useState(false);       // 🧪 flash da bomba
  const [abilityMsg, setAbilityMsg] = useState('');    // aviso central da habilidade
  const [legendOpen, setLegendOpen] = useState(true); // legenda de poderes aberta?
  const phaseRef = useRef<Phase>('idle');
  const orbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(homeFor(), { replace: true });
    }
  }, [navigate]);

  // A tela de login é sempre escura (independente do tema do app).
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) html.setAttribute('data-theme', prev);
      else html.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Cronômetro: enquanto jogando, conta de 1min até zerar → fim de jogo.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) { setPhase('over'); setOverLeft(OVER_RESET_SECONDS); return; }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timeLeft]);

  const resetToIdle = () => {
    setBugScore(0);
    setTimeLeft(GAME_SECONDS);
    setBugCount(IDLE_BUGS);
    setRound((r) => r + 1);
    phaseRef.current = 'idle';
    setPhase('idle');
  };

  // Tela de fim: se ninguém clicar em "jogar de novo" em 10s, reseta a tela.
  useEffect(() => {
    if (phase !== 'over') return;
    if (overLeft <= 0) { resetToIdle(); return; }
    const id = window.setTimeout(() => setOverLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, overLeft]);

  const startGame = (initialScore = 0) => {
    setBugScore(initialScore);
    setTimeLeft(GAME_SECONDS);
    setBugCount(GAME_BUGS);
    setRound((r) => r + 1);
    phaseRef.current = 'playing';
    setPhase('playing');
  };

  // Os ícones flutuam livremente (posição + velocidade). O mouse empurra e
  // muda a direção. Clicar num bug o explode e soma no placar. O primeiro
  // clique inicia o jogo (spawna mais bugs + dispara o cronômetro).
  useEffect(() => {
    const container = orbsRef.current;
    if (!container) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const orbs = Array.from(container.querySelectorAll<HTMLElement>('.login-orb'));
    const RADIUS = 200;   // raio em que o mouse "toca" o ícone
    const ACCEL = 1.4;    // força do empurrão do mouse
    const MIN_SPEED = 0.5; // drift mínimo (px/frame) — nunca para
    const MAX_SPEED = 7;   // velocidade máxima após empurrão
    const DAMP = 0.985;    // atrito: volta suave ao drift normal

    const cont = container.getBoundingClientRect();

    // Posiciona um bug numa borda da tela e o manda em direção ao card
    // (assim eles "nascem das pontas" e vão se esconder atrás do login).
    const spawnFromEdge = (s: { size: number; x: number; y: number; vx: number; vy: number; tx: number; ty: number }) => {
      const c = container.getBoundingClientRect();
      const card = document.querySelector('.login-card');
      const cr = card?.getBoundingClientRect();
      const cardX = cr ? cr.left + cr.width / 2 - c.left : c.width / 2;
      const cardY = cr ? cr.top + cr.height / 2 - c.top : c.height / 2;
      // alvo: um ponto aleatório atrás do card (eles se acomodam ali)
      s.tx = cardX + (Math.random() - 0.5) * (cr ? cr.width * 0.6 : 120);
      s.ty = cardY + (Math.random() - 0.5) * (cr ? cr.height * 0.6 : 160);
      const maxX = Math.max(1, c.width - s.size);
      const maxY = Math.max(1, c.height - s.size);
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { s.x = Math.random() * maxX; s.y = 0; }
      else if (edge === 1) { s.x = maxX; s.y = Math.random() * maxY; }
      else if (edge === 2) { s.x = Math.random() * maxX; s.y = maxY; }
      else { s.x = 0; s.y = Math.random() * maxY; }
      const dx = s.tx - (s.x + s.size / 2);
      const dy = s.ty - (s.y + s.size / 2);
      const d = Math.hypot(dx, dy) || 1;
      s.vx = (dx / d) * BUG_SPEED;
      s.vy = (dy / d) * BUG_SPEED;
    };

    const playingInit = phaseRef.current === 'playing';
    const state = orbs.map((el) => {
      const size = el.offsetWidth;
      const ang = Math.random() * Math.PI * 2;
      const isBug = el.hasAttribute('data-bug');
      return {
        el, size,
        bug: isBug,
        power: el.getAttribute('data-power') || '', // habilidade (ícones de QA)
        ready: true, // power-up pronto pra usar (fora do cooldown)
        // em jogo os bugs começam no "pool" (escondidos) e nascem em ondas;
        // fora do jogo (idle) eles ficam visíveis flutuando.
        alive: isBug ? !playingInit : true,
        arrived: false,
        x: Math.random() * Math.max(1, cont.width - size),
        y: Math.random() * Math.max(1, cont.height - size),
        vx: Math.cos(ang) * MIN_SPEED * 1.4,
        vy: Math.sin(ang) * MIN_SPEED * 1.4,
        tx: 0, // alvo (atrás do card) onde o bug para
        ty: 0,
      };
    });

    // esconde os bugs que ainda estão no pool (vão nascer em ondas)
    for (const s of state) {
      if (s.bug && !s.alive) s.el.style.display = 'none';
    }

    let mx = -9999, my = -9999;
    let raf = 0;
    let scatterUntil = 0; // janela em que os bugs podem voar mais rápido
    let freezeUntil = 0;  // ⚠️ janela em que os bugs ficam congelados
    const timers: number[] = [];

    // 🧭 Teste exploratório: chuta pra fora os bugs que estão atrás do card.
    const doExplore = () => {
      const card = document.querySelector('.login-card');
      if (!card) return;
      const cr = card.getBoundingClientRect();
      const cardX = cr.left + cr.width / 2;
      const cardY = cr.top + cr.height / 2;
      const c = container.getBoundingClientRect();
      scatterUntil = performance.now() + 6000; // espalhados por 6s e depois voltam
      for (const s of state) {
        if (!s.bug || !s.alive) continue;
        const bx = c.left + s.x + s.size / 2;
        const by = c.top + s.y + s.size / 2;
        const behind = bx > cr.left && bx < cr.right && by > cr.top && by < cr.bottom;
        if (!behind) continue;
        let dx = bx - cardX, dy = by - cardY;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        s.arrived = false;
        s.x += dx * 90;       // empurrão imediato pra fora
        s.y += dy * 90;
        s.vx = dx * 13;       // + velocidade de fuga (liberada pelo burst)
        s.vy = dy * 13;
      }
    };

    const screenLayer = container.parentElement || container; // acima do card

    // explosão de partículas num ponto (coords do container)
    const burst = (cx: number, cy: number, count = 18, parent: Element = container) => {
      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = 'bug-particle';
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 70;
        p.style.left = `${cx}px`;
        p.style.top = `${cy}px`;
        p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
        p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        p.addEventListener('animationend', () => p.remove());
        parent.appendChild(p);
      }
    };

    // mata um bug (explode, esconde, soma no placar). O pool repõe depois.
    const killBug = (s: typeof state[number]) => {
      if (!s.alive) return;
      s.alive = false;
      s.arrived = false;
      s.el.style.display = 'none';
      burst(s.x + s.size / 2, s.y + s.size / 2);
      setBugScore((n) => n + 1);
    };

    // clique num bug
    const explode = (s: typeof state[number]) => {
      if (phaseRef.current === 'idle') {
        // primeiro clique inicia o jogo (já contando este bug)
        burst(s.x + s.size / 2, s.y + s.size / 2);
        s.el.style.display = 'none';
        startGame(1);
        return;
      }
      killBug(s);
    };

    // ── Habilidades (ícones de QA) ──────────────────────────────
    const cardCenter = () => {
      const c = container.getBoundingClientRect();
      const card = document.querySelector('.login-card');
      const cr = card?.getBoundingClientRect();
      return {
        x: cr ? cr.left + cr.width / 2 - c.left : c.width / 2,
        y: cr ? cr.top + cr.height / 2 - c.top : c.height / 2,
      };
    };

    const showMsg = (m: string) => {
      setAbilityMsg(m);
      timers.push(window.setTimeout(() => setAbilityMsg(''), 1200));
    };

    const activatePower = (s: typeof state[number]) => {
      switch (s.power) {
        case 'lupa': // 🔍 raio-x: vê e clica nos bugs atrás do card
          setInspecting(true);
          showMsg('Inspeção — raio-x!');
          timers.push(window.setTimeout(() => setInspecting(false), INSPECT_MS));
          break;
        case 'regress': { // ✅ regressão: mata todos os bugs parados no meio
          const ctr = cardCenter();
          const ring = document.createElement('span');
          ring.className = 'bug-bomb is-regress';
          ring.style.left = `${ctr.x}px`;
          ring.style.top = `${ctr.y}px`;
          ring.style.setProperty('--r', '420px');
          ring.addEventListener('animationend', () => ring.remove());
          container.appendChild(ring);
          burst(ctr.x, ctr.y, 40);
          showMsg('Suíte de regressão!');
          for (const o of state) if (o.bug && o.alive && o.arrived) killBug(o);
          break;
        }
        case 'freeze': // ⚠️ congela os bugs
          freezeUntil = performance.now() + FREEZE_MS;
          setFrozen(true);
          showMsg('Congelado!');
          timers.push(window.setTimeout(() => setFrozen(false), FREEZE_MS));
          break;
        case 'bomb': { // 🧪 bomba de teste: bombardeia a TELA TODA
          const c = container.getBoundingClientRect();
          showMsg('Teste automatizado!');
          setBombing(true);
          timers.push(window.setTimeout(() => setBombing(false), 700));
          // carpet bombing: várias explosões espalhadas pela tela (acima do card)
          for (let k = 0; k < 9; k++) {
            timers.push(window.setTimeout(() => {
              const ex = Math.random() * c.width;
              const ey = Math.random() * c.height;
              const ring = document.createElement('span');
              ring.className = 'bug-bomb';
              ring.style.left = `${ex}px`;
              ring.style.top = `${ey}px`;
              ring.style.setProperty('--r', `${160 + Math.random() * 160}px`);
              ring.addEventListener('animationend', () => ring.remove());
              screenLayer.appendChild(ring);
              burst(ex, ey, 22, screenLayer);
            }, k * 70));
          }
          // mata todos os bugs da tela
          for (const o of state) if (o.bug && o.alive) killBug(o);
          break;
        }
        case 'fail': { // ❌ extermínio: mata TODOS os bugs da tela
          for (const o of state) if (o.bug && o.alive) killBug(o);
          setPenalty(true);
          showMsg('Extermínio total!');
          timers.push(window.setTimeout(() => setPenalty(false), 600));
          break;
        }
        case 'explore': // 🧭 espalha os bugs escondidos atrás do card
          doExplore();
          showMsg('Teste exploratório!');
          break;
      }
    };

    const onClick = (e: MouseEvent) => {
      if (phaseRef.current === 'over') return;
      const orb = (e.target as HTMLElement).closest('.login-orb');
      const s = state.find((st) => st.el === orb);
      if (!s) return;
      if (s.bug && s.alive) { explode(s); return; }
      // power-up (ícone de QA): só durante o jogo e fora do cooldown
      if (s.power && s.ready && phaseRef.current === 'playing') {
        activatePower(s);
        s.ready = false;
        s.el.style.display = 'none';
        timers.push(window.setTimeout(() => {
          s.ready = true;
          s.el.style.display = '';
        }, POWER_COOLDOWN_MS));
      }
    };

    const tick = () => {
      const c = container.getBoundingClientRect();
      const scattering = performance.now() < scatterUntil;
      const playing = phaseRef.current === 'playing';
      const freezing = performance.now() < freezeUntil;

      // gerenciador de ondas: mantém ~50 bugs; quando 50% já chegaram
      // ao meio, libera mais uma onda (até completar 50).
      if (playing) {
        let aliveCount = 0, arrivedCount = 0;
        const pool: typeof state = [];
        for (const s of state) {
          if (!s.bug) continue;
          if (s.alive) { aliveCount++; if (s.arrived) arrivedCount++; }
          else pool.push(s);
        }
        if (aliveCount < GAME_BUGS && pool.length > 0 && arrivedCount >= aliveCount * 0.5) {
          const n = Math.min(BUG_WAVE, GAME_BUGS - aliveCount, pool.length);
          for (let i = 0; i < n; i++) {
            const s = pool[i];
            spawnFromEdge(s);
            s.alive = true;
            s.arrived = false;
            s.el.style.display = '';
          }
        }
      }

      for (const s of state) {
        if (!s.alive) continue;

        if (s.bug) {
          if (freezing) {
            // ⚠️ congelado: para no lugar (fácil de clicar)
            s.vx = 0; s.vy = 0;
          } else if (playing && !scattering) {
            // objetivo: ir pro alvo atrás do card e PARAR ao chegar
            const tdx = s.tx - (s.x + s.size / 2);
            const tdy = s.ty - (s.y + s.size / 2);
            const td = Math.hypot(tdx, tdy);
            if (td > 4) {
              s.vx = (tdx / td) * BUG_SPEED;
              s.vy = (tdy / td) * BUG_SPEED;
              s.arrived = false;
            } else {
              s.vx = 0; s.vy = 0;
              s.x = s.tx - s.size / 2;
              s.y = s.ty - s.size / 2;
              s.arrived = true;
            }
          } else if (scattering) {
            // espalhados pelo "teste exploratório": roam pela tela por 6s
            // (o pico do arremesso desacelera, mas mantêm um mínimo de roaming)
            s.vx *= 0.97;
            s.vy *= 0.97;
            const sp = Math.hypot(s.vx, s.vy) || 1;
            if (sp < 2.6) {
              s.vx = (s.vx / sp) * 2.6;
              s.vy = (s.vy / sp) * 2.6;
            }
          } else {
            // idle/fim: drift lento (fácil de clicar)
            const sp = Math.hypot(s.vx, s.vy) || 1;
            s.vx = (s.vx / sp) * 0.6;
            s.vy = (s.vy / sp) * 0.6;
          }
          s.x += s.vx;
          s.y += s.vy;
        } else {
          // power-ups (ícones de QA): drift lento e previsível — NÃO fogem
          // do mouse, pra serem fáceis de clicar.
          const sp = Math.hypot(s.vx, s.vy) || 1;
          const ds = 0.7;
          s.vx = (s.vx / sp) * ds;
          s.vy = (s.vy / sp) * ds;
          s.x += s.vx;
          s.y += s.vy;
        }

        // quica nas bordas
        const maxX = c.width - s.size;
        const maxY = c.height - s.size;
        if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
        else if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx); }
        if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy); }
        else if (s.y > maxY) { s.y = maxY; s.vy = -Math.abs(s.vy); }

        s.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('mousemove', onMove);
    container.addEventListener('click', onClick);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      container.removeEventListener('click', onClick);
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
    // re-inicializa o sistema de partículas quando muda o nº de bugs / rodada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, bugCount]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(async () => {
      const result = await login(email, password);
      if (result.ok) {
        navigate(homeFor(), { replace: true });
      } else {
        setError(result.error || 'Falha ao entrar.');
        setLoading(false);
      }
    }, 300);
  }

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, '0');

  return (
    <div className={`login-screen${inspecting ? ' inspecting' : ''}`}>
      <div
        className={`login-fx${frozen ? ' is-frozen' : ''}${penalty ? ' is-penalty' : ''}${bombing ? ' is-bomb' : ''}`}
        aria-hidden="true"
      />

      {abilityMsg && <div className="ability-toast" key={abilityMsg}>{abilityMsg}</div>}
      <div className={`login-orbs${phase !== 'idle' ? ' game-on' : ''}`} aria-hidden="true" ref={orbsRef}>
        {Array.from({ length: bugCount }).map((_, i) => {
          // no idle: 1 isca pequena e nítida (i=0) + os demais foscos
          const idle = bugCount <= IDLE_BUGS;
          const isBait = idle && i === 0;
          const size = isBait ? 26 : bugSizeFor(i);
          return (
            <span
              key={`bug-${round}-${i}`}
              className={`login-orb${isBait ? ' is-bait' : ''}`}
              data-bug
              style={{ width: size, height: size }}
            >
              <img className="login-orb-img" alt="" src={`https://api.iconify.design/lucide/bug.svg?color=%23${bugColor(i)}`} />
            </span>
          );
        })}
        <span className="login-orb login-orb--2" data-power="regress" title="Suíte de regressão"><img className="login-orb-img" alt="" src="https://api.iconify.design/lucide/circle-check-big.svg?color=%2334d399" /></span>
        <span className="login-orb login-orb--3" data-power="lupa" title="Inspeção (raio-x)"><img className="login-orb-img" alt="" src="https://api.iconify.design/lucide/search.svg?color=%2367e8f9" /></span>
        <span className="login-orb login-orb--4" data-power="freeze" title="Bug bloqueante (congelar)"><img className="login-orb-img" alt="" src="https://api.iconify.design/lucide/triangle-alert.svg?color=%23fbbf24" /></span>
        <span className="login-orb login-orb--5" data-power="bomb" title="Teste automatizado (bomba)"><img className="login-orb-img" alt="" src="https://api.iconify.design/lucide/flask-conical.svg?color=%23f0abfc" /></span>
        <span className="login-orb login-orb--6" data-power="fail" title="Extermínio total"><img className="login-orb-img" alt="" src="https://api.iconify.design/lucide/circle-x.svg?color=%23fb7185" /></span>
        <span className="login-orb login-orb--7" data-power="explore" title="Teste exploratório"><img className="login-orb-img" alt="" src="https://api.iconify.design/lucide/compass.svg?color=%23818cf8" /></span>
      </div>

      {phase !== 'idle' && (
        <div className="bug-hud">
          <div className={`bug-timer${timeLeft <= 10 ? ' is-low' : ''}`}>
            <img className="bug-hud-icon" alt="" src="https://api.iconify.design/lucide/timer.svg?color=%23ffffff" />
            <span className="bug-timer-value">{mm}:{ss}</span>
          </div>
          <div className="bug-score">
            <img className="bug-score-icon" alt="" src="https://api.iconify.design/lucide/bug-off.svg?color=%2334d399" />
            <span className="bug-score-label">Bugs corrigidos</span>
            <span className="bug-score-count" key={bugScore}>{bugScore}</span>
          </div>
        </div>
      )}

      {phase === 'idle' && <div className="login-hint">Não clique no bug verde</div>}

      {phase === 'playing' && legendOpen && (
        <div className="power-legend">
          <div className="power-legend-title">Poderes</div>
          {POWER_LEGEND.map((p) => (
            <div className="power-legend-row" key={p.name}>
              <img className="power-legend-icon" alt="" src={`https://api.iconify.design/lucide/${p.icon}.svg?color=%23${p.c}`} />
              <span className="power-legend-text">
                <strong>{p.name}</strong>
                <span className="power-legend-desc">{p.desc}</span>
              </span>
              <span className="power-legend-dur">{p.dur}</span>
            </div>
          ))}
          <div className="power-legend-foot">recarga dos ícones: 12s</div>
        </div>
      )}

      {phase === 'playing' && (
        <button
          type="button"
          className={`power-legend-toggle${legendOpen ? ' is-open' : ''}`}
          onClick={() => setLegendOpen((o) => !o)}
          title="Poderes"
        >
          {legendOpen ? '×' : '?'}
        </button>
      )}

      {phase === 'over' && (
        <div className="bug-gameover">
          <div className="bug-gameover-title">Tempo esgotado!</div>
          <div className="bug-gameover-score">{bugScore}</div>
          <div className="bug-gameover-sub">bugs corrigidos em 1 minuto</div>
          <button type="button" className="bug-gameover-btn" onClick={() => startGame()}>Jogar de novo</button>
          <div className="bug-gameover-reset">Reiniciando em {overLeft}s…</div>
        </div>
      )}

      <div className="login-wrapper">
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="login-logo-text">
            QA<strong>Reporter</strong>
          </span>
        </div>

        <div className="login-card">
          <h1 className="login-heading">Bem-vindo de volta</h1>
          <p className="login-subtitle">Faça login para acessar o painel</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoFocus
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
              />
            </div>

            {error ? <div className="error-box">{error}</div> : null}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
