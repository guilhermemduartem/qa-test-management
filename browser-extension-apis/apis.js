/* Painel de Health Check — busca o status/versão de cada API (direto, via
   host_permissions). Lógica portada de src/pages/apis/HealthCheckPage.tsx. */
(() => {
  'use strict';
  const DATA = window.APIS_DATA || { environments: [], services: [] };
  const $ = (id) => document.getElementById(id);
  const envSel = $('env'), grid = $('grid'), summaryEl = $('summary'), runBtn = $('run'),
        emptyEl = $('empty'), filtersEl = $('filters'), versionsEl = $('versions'), runAllBtn = $('runAll');

  const KEY = 'apis_hc_env';
  let filter = 'all';        // all | ok | bad
  let runningAll = false;
  const runningEnvs = new Set();  // ambientes rodando AGORA (vários em paralelo)
  // Fonte única, POR AMBIENTE — trocar de ambiente não apaga; só re-rodar atualiza.
  let allEnvResults = {};    // envId -> { serviceId: result completo (retorno registrado) }
  let loadingByEnv = {};     // envId -> { serviceId: bool }
  let lastRunByEnv = {};     // envId -> Date (data/hora da execução)
  let expanded = {};         // "envId:serviceId" -> bool (ver retorno no painel direito)
  let cardExpanded = {};     // "envId:serviceId" -> bool (ver retorno no card)

  const curResults = () => allEnvResults[envSel.value] || {};
  const curLoading = () => loadingByEnv[envSel.value] || {};

  /* ── ambientes ── */
  DATA.environments.forEach((e) => {
    const o = document.createElement('option');
    o.value = e.id; o.textContent = e.name; envSel.appendChild(o);
  });
  try {
    chrome?.storage?.local?.get([KEY], (r) => { if (r && r[KEY]) { envSel.value = r[KEY]; render(); } });
  } catch { /**/ }
  envSel.addEventListener('change', () => {
    try { chrome?.storage?.local?.set({ [KEY]: envSel.value }); } catch { /**/ }
    render();        // só mostra o que já está salvo para esse ambiente — NÃO apaga
    updateRunBtn();  // botão reflete se ESTE ambiente está rodando
  });

  function updateRunBtn() {
    const envId = envSel.value;
    const isRunning = runningEnvs.has(envId);
    runBtn.disabled = isRunning;
    runBtn.textContent = isRunning ? 'Verificando…' : (allEnvResults[envId] ? 'Reverificar' : 'Verificar');
  }

  /* ── parsing do corpo do health ── */
  function parseBody(body) {
    if (typeof body === 'string') return { healthStatus: body.trim() };
    if (!body || typeof body !== 'object') return {};
    // monitores: aceita array [{key,value}] ou objeto { nome: status }
    let monitors;
    const m = body.monitors ?? body.Monitors;
    if (Array.isArray(m)) {
      monitors = m.map((x) => ({
        key: x.key ?? x.Key ?? x.name ?? x.Name ?? '',
        value: String(x.value ?? x.Value ?? x.status ?? x.Status ?? ''),
      }));
    } else if (m && typeof m === 'object') {
      monitors = Object.entries(m).map(([k, v]) => ({ key: k, value: String(v) }));
    }
    return {
      healthStatus: body.status ?? body.Status,
      version: body.version ?? body.Version,
      machineName: body.machineName ?? body.MachineName,
      serverIP: body.serverIP ?? body.ServerIP,
      datetime: body.datetime ?? body.Datetime,
      monitors,
    };
  }
  function statusOf(res, isLoading) {
    if (isLoading) return 'loading';
    if (!res) return 'pending';
    if (res.error) return 'bad';
    const hs = (res.healthStatus || '').toLowerCase();
    if (hs === 'unhealthy') return 'bad';
    if (hs === 'degraded') return 'warn';
    return res.ok ? 'ok' : 'bad';
  }

  /* ── fetch de uma API (SEM cache — dado real de monitoramento) ── */
  let nonceCounter = 0;
  async function checkOne(svc, envId) {
    const baseUrl = svc.envUrls[envId];
    if (!baseUrl) return null;
    const base = `${baseUrl}${svc.healthPath || '/HealthCheck'}`;
    // Cache-busting forte: timestamp + contador + aleatório → URL única por chamada,
    // mesmo em paralelo no mesmo milissegundo (evita cache de browser/proxy/CDN).
    const nonce = `${Date.now()}-${++nonceCounter}-${Math.random().toString(36).slice(2, 8)}`;
    const target = `${base}${base.includes('?') ? '&' : '?'}_=${nonce}`;
    const start = Date.now();
    try {
      const res = await fetch(target, {
        method: svc.method || 'GET',
        cache: 'no-store',          // nunca lê nem grava no cache HTTP
        redirect: 'follow',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
      const elapsed = Date.now() - start;
      const text = await res.text().catch(() => '');
      let body = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      const rawBody = (() => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } })();
      return { status: res.status, ok: res.ok, elapsed, checkedAt: Date.now(), rawBody, ...parseBody(body) };
    } catch (err) {
      const msg = err instanceof TypeError ? 'Sem acesso (CORS/rede/HTTP)' : String(err);
      return { status: 0, ok: false, elapsed: Date.now() - start, checkedAt: Date.now(), error: msg };
    }
  }

  /* ── verifica um ambiente (registra/atualiza só ele) ── */
  async function checkEnv(envId, onTick) {
    const svcs = DATA.services.filter((s) => s.envUrls[envId]);
    if (!svcs.length) return;
    loadingByEnv[envId] = {};
    svcs.forEach((s) => { loadingByEnv[envId][s.id] = true; });
    if (onTick) onTick();
    await Promise.all(svcs.map(async (s) => {
      const r = await checkOne(s, envId);
      allEnvResults[envId] = { ...(allEnvResults[envId] || {}), [s.id]: r };  // registra o retorno
      loadingByEnv[envId][s.id] = false;
      if (onTick) onTick();
    }));
    lastRunByEnv[envId] = new Date();  // data/hora da execução (atualiza ao re-rodar)
  }

  /* ── executa UM ambiente (vários podem rodar em paralelo) ── */
  async function runEnv(envId) {
    if (runningEnvs.has(envId)) return;     // esse ambiente já está rodando
    runningEnvs.add(envId);
    if (envId === envSel.value) updateRunBtn();
    await checkEnv(envId, () => {
      // cards só quando for o ambiente na tela; o painel de versões sempre
      if (envId === envSel.value) render(); else renderVersions();
    });
    runningEnvs.delete(envId);
    if (envId === envSel.value) { render(); updateRunBtn(); } else { renderVersions(); }
  }

  /* ── botão "Verificar": roda o ambiente atual, mesmo com outro ainda rodando ── */
  function run() { runEnv(envSel.value); }
  runBtn.addEventListener('click', run);

  /* ── verificar TODOS os ambientes (cada aba/ambiente fica com seus dados) ── */
  async function runAll() {
    if (runningAll) return;
    runningAll = true; runAllBtn.disabled = true; runAllBtn.textContent = 'Rodando…';
    await Promise.all(DATA.environments.map((env) => runEnv(env.id)));
    runningAll = false; runAllBtn.disabled = false; runAllBtn.textContent = 'Rodar todos';
    render();
  }
  runAllBtn.addEventListener('click', runAll);

  /* ── render ── */
  function render() {
    const envId = envSel.value;
    const results = curResults(), loading = curLoading();
    const svcs = DATA.services.filter((s) => s.envUrls[envId]);
    const counts = { all: svcs.length, ok: 0, bad: 0 };
    svcs.forEach((s) => { const st = statusOf(results[s.id], loading[s.id]); if (st === 'ok') counts.ok++; else if (st === 'bad') counts.bad++; });

    // filtros
    filtersEl.innerHTML = [['all', 'Todas'], ['ok', 'Healthy'], ['bad', 'Com erro']]
      .map(([k, l]) => `<button class="chip${filter === k ? ' active' : ''}" data-f="${k}">${l} ${counts[k] ?? 0}</button>`).join('');
    filtersEl.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; render(); }));

    const ran = Object.keys(results).length > 0 || Object.values(loading).some(Boolean);
    emptyEl.style.display = ran ? 'none' : 'block';
    emptyEl.innerHTML = `Ambiente <b>${esc(ENV_NAME[envId] || envId)}</b> ainda não verificado — clique em <b>Verificar</b>.`;

    const doneCount = svcs.filter((s) => results[s.id]).length;
    const when = lastRunByEnv[envId] ? ` · ${lastRunByEnv[envId].toLocaleString('pt-BR')}` : '';
    summaryEl.textContent = ran ? `${doneCount}/${svcs.length} verificadas${when}` : `${svcs.length} APIs neste ambiente`;

    // ambiente ainda não verificado → não mostra cards (só a mensagem)
    if (!ran) { grid.innerHTML = ''; renderVersions(); return; }

    const visible = svcs.filter((s) => {
      if (filter === 'all') return true;
      return statusOf(results[s.id], loading[s.id]) === filter;
    });

    grid.innerHTML = visible.map((s) => {
      const r = results[s.id]; const isL = loading[s.id]; const st = statusOf(r, isL);
      // amarelo = aguardando (1ª vez) · laranja = recarregando (já tinha resultado)
      const cardSt = isL ? (r ? 'reloading' : 'waiting') : st;
      const url = `${s.envUrls[envId]}${s.healthPath || '/HealthCheck'}`;
      const version = r && r.version ? r.version : (isL ? '…' : '—');
      // status de saúde (abaixo da versão)
      const healthLabel = isL
        ? `<span class="spin"></span> ${r ? 'Recarregando' : 'Verificando'}`
        : (st === 'ok' ? 'Healthy' : st === 'warn' ? 'Degraded' : st === 'bad' ? 'Unhealthy' : '—');

      // linha de status: HTTP · tempo
      const statusBits = [];
      if (r && typeof r.status === 'number' && r.status > 0) statusBits.push(`<b>HTTP ${r.status}</b>`);
      if (r && typeof r.elapsed === 'number' && !isL) statusBits.push(`${r.elapsed} ms`);

      // meta (máquina/ip)
      const meta = [];
      if (r && r.machineName) meta.push(`<span><b>Máquina:</b> ${esc(r.machineName)}</span>`);
      if (r && r.serverIP) meta.push(`<span><b>IP:</b> ${esc(r.serverIP)}</span>`);

      // monitores (quais de pé / fora)
      let monitorsHtml = '';
      if (!isL && r && Array.isArray(r.monitors) && r.monitors.length) {
        const sorted = [...r.monitors].sort((a, b) => {
          const av = a.value.toLowerCase() === 'healthy' ? 1 : 0;
          const bv = b.value.toLowerCase() === 'healthy' ? 1 : 0;
          return av - bv || a.key.localeCompare(b.key, 'pt-BR');
        });
        const up = sorted.filter((m) => m.value.toLowerCase() === 'healthy').length;
        const chips = sorted.map((m) => {
          const v = m.value.toLowerCase();
          const cls = v === 'healthy' ? 'mon-ok' : v === 'degraded' ? 'mon-warn' : 'mon-bad';
          const icon = v === 'healthy' ? '✓' : v === 'degraded' ? '!' : '✗';
          return `<span class="mon ${cls}" title="${esc(m.key)}: ${esc(m.value)}">${icon} ${esc(m.key)}</span>`;
        }).join('');
        monitorsHtml = `<div class="mon-head">Monitores · ${up}/${sorted.length} de pé</div><div class="mons">${chips}</div>`;
      }

      return `
        <div class="card ${cardSt}">
          <div class="card-head">
            <span class="card-name">${esc(s.name)}</span>
            <div class="card-ver">
              <span class="version">${esc(version)}</span>
              <span class="health health-${cardSt}">${healthLabel}</span>
            </div>
          </div>
          ${statusBits.length ? `<div class="statusline">${statusBits.join(' <span class="sep">·</span> ')}</div>` : ''}
          ${r && r.error ? `<div class="meta err">${esc(r.error)}</div>` : (meta.length ? `<div class="meta">${meta.join('')}</div>` : '')}
          ${monitorsHtml}
          <div class="url">${esc(url)}</div>
        </div>`;
    }).join('');
    renderVersions();
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ── painel direito: versões por ambiente (resumo da sessão) ── */
  const ENV_NAME = {};
  DATA.environments.forEach((e) => { ENV_NAME[e.id] = e.name; });

  function renderVersions() {
    // serviços com retorno registrado OU em carregamento (em qualquer ambiente)
    const checked = DATA.services
      .filter((s) => DATA.environments.some((env) =>
        (allEnvResults[env.id] && allEnvResults[env.id][s.id]) ||
        (loadingByEnv[env.id] && loadingByEnv[env.id][s.id])))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!checked.length) {
      versionsEl.innerHTML = '<p class="vp-empty">Nenhuma verificação realizada ainda.</p>';
      bindVersionRows();
      return;
    }
    versionsEl.innerHTML = checked.map((s) => {
      const rows = DATA.environments.filter((env) => s.envUrls[env.id]).map((env) => {
        const res = allEnvResults[env.id] && allEnvResults[env.id][s.id];
        const isL = loadingByEnv[env.id] && loadingByEnv[env.id][s.id];
        // amarelo = aguardando (1ª vez, sem resultado) · laranja = recarregando (já tinha resultado)
        const st = isL ? (res ? 'reloading' : 'waiting') : statusOf(res, false);
        const cls = st === 'ok' ? ' vp-row--checked'
          : st === 'bad' ? ' vp-row--empty'
          : st === 'warn' ? ' vp-row--warn'
          : st === 'waiting' ? ' vp-row--waiting'
          : st === 'reloading' ? ' vp-row--reloading' : '';
        const right = st === 'waiting' ? 'aguardando…'
          : st === 'reloading' ? 'recarregando…'
          : (!res ? '—' : (res.version ? esc(res.version) : (res.error ? 'erro' : `HTTP ${res.status}`)));
        const when = lastRunByEnv[env.id] ? lastRunByEnv[env.id].toLocaleString('pt-BR') : '';
        const key = `${env.id}:${s.id}`;
        const detail = (expanded[key] && res)
          ? `<pre class="vp-raw">${esc((when ? `Executado: ${when}\n` : '') + (res.error ? `${res.error}\n\nHTTP ${res.status} · ${res.elapsed} ms` : `HTTP ${res.status} · ${res.elapsed} ms\n\n${res.rawBody || '(sem corpo)'}`))}</pre>`
          : '';
        return `<div class="vp-row${cls}" data-key="${key}" title="${when ? 'Executado: ' + when + ' — ' : ''}clique para ver o retorno"><span class="vp-env">${esc(ENV_NAME[env.id] || env.id)}</span><span class="vp-ver">${right}</span></div>${detail}`;
      }).join('');
      return `<div class="vp-service"><div class="vp-name">${esc(s.name)}</div>${rows}</div>`;
    }).join('');
    bindVersionRows();
  }
  function bindVersionRows() {
    versionsEl.querySelectorAll('[data-key]').forEach((el) => el.addEventListener('click', () => {
      const k = el.dataset.key; expanded[k] = !expanded[k]; renderVersions();
    }));
  }

  render();
  renderVersions();
})();
