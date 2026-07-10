import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApisLayout } from './ApisLayout';
import { loadApisConfig, fetchSharedApisConfig } from '../../lib/apisStorage';
import type { CheckResult, ApiService, MonitorEntry, ApisConfig } from '../../types/apis';

/* ─── Helpers ─────────────────────────────────────────── */

function parseBody(body: unknown): Partial<CheckResult> {
  if (typeof body === 'string') {
    return { healthStatus: body.trim() };
  }
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  const monitors = Array.isArray(b['monitors'])
    ? (b['monitors'] as MonitorEntry[])
    : undefined;
  return {
    healthStatus: (b['status'] ?? b['Status']) as string | undefined,
    version: (b['version'] ?? b['Version']) as string | undefined,
    machineName: b['machineName'] as string | undefined,
    serverIP: b['serverIP'] as string | undefined,
    datetime: b['datetime'] as string | undefined,
    monitors,
  };
}

function friendlyError(err: unknown): string {
  if (err instanceof TypeError) return 'Sem acesso — CORS ou rede indisponível';
  return String(err);
}

type CardStatus = 'healthy' | 'unhealthy' | 'degraded' | 'loading' | 'error' | 'pending';

function resolveStatus(result?: CheckResult, isLoading?: boolean): CardStatus {
  if (isLoading) return 'loading';
  if (!result) return 'pending';
  if (result.error) return 'error';
  const hs = result.healthStatus?.toLowerCase();
  if (hs === 'unhealthy') return 'unhealthy';
  if (hs === 'degraded') return 'degraded';
  if (result.ok) return 'healthy';
  return 'unhealthy';
}

const STATUS_LABEL: Record<CardStatus, string> = {
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  degraded: 'Degraded',
  loading: 'Verificando',
  error: 'Erro',
  pending: '—',
};

/* ─── Version Panel ───────────────────────────────────── */

type SessionVersions = Record<string, Record<string, string | null>>;

const ENV_SHORT: Record<string, string> = {
  'dev-orion': 'Dev Orion',
  'dev-polaris': 'Dev Polaris',
  'qa': 'QA',
  'tst-azul': 'TST Azul',
  'stg': 'STG',
  'prod': 'Prod',
};

function VersionPanel({ config, sessionVersions, onRunAll, runningAll, disabled }: {
  config: ApisConfig;
  sessionVersions: SessionVersions;
  onRunAll: () => void;
  runningAll: boolean;
  disabled: boolean;
}) {
  const checkedServices = config.services
    .filter((s) => sessionVersions[s.id])
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <aside className="hc-vp">
      <div className="hc-vp-head">
        <span>Versões</span>
        <button className="hc-vp-run-btn" onClick={onRunAll} disabled={runningAll || disabled} title="Verificar todos os ambientes">
          {runningAll
            ? <span className="hc-dot-spin" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
            : (
              <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )
          }
        </button>
      </div>
      <div className="hc-vp-body">
        {checkedServices.length === 0 ? (
          <p className="hc-vp-empty">Nenhuma verificação realizada ainda.</p>
        ) : (
          checkedServices.map((service) => {
            const versions = sessionVersions[service.id];
            return (
              <div key={service.id} className="hc-vp-service">
                <div className="hc-vp-name">{service.name}</div>
                {config.environments.filter((env) => service.envUrls[env.id]).map((env) => {
                  const checked = env.id in versions;
                  const version = versions[env.id];
                  const label = ENV_SHORT[env.id] ?? env.name;
                  return (
                    <div key={env.id} className={`hc-vp-row${checked ? (version ? ' hc-vp-row--checked' : ' hc-vp-row--empty') : ''}`}>
                      <span className="hc-vp-env">{label}</span>
                      <span className="hc-vp-ver">{checked && version ? version : '—'}</span>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

/* ─── Sub-components ──────────────────────────────────── */

function SpinnerDot() {
  return (
    <span className="hc-dot-spin" />
  );
}

function CardDot({ status }: { status: CardStatus }) {
  if (status === 'loading') return <SpinnerDot />;
  return <span className={`hc-dot hc-dot--${status}`} />;
}

function StatusPill({ status, httpCode }: { status: CardStatus; httpCode?: number }) {
  const label = httpCode && status !== 'loading' && status !== 'pending' && status !== 'error'
    ? `${httpCode} · ${STATUS_LABEL[status]}`
    : STATUS_LABEL[status];
  return <span className={`hc-status-pill hc-status-pill--${status}`}>{label}</span>;
}

function MonitorChip({ m }: { m: MonitorEntry }) {
  const val = m.value.toLowerCase();
  const cls = val === 'healthy' ? 'hc-monitor--healthy'
    : val === 'degraded' ? 'hc-monitor--degraded'
    : 'hc-monitor--unhealthy';
  const icon = val === 'healthy' ? '✓' : '✗';
  return (
    <span className={`hc-monitor ${cls}`} title={`${m.key}: ${m.value}`}>
      {icon} {m.key}
    </span>
  );
}

function ResultCard({ service, result, isLoading, envId }: {
  service: ApiService;
  result?: CheckResult;
  isLoading: boolean;
  envId: string;
}) {
  const [showJson, setShowJson] = useState(false);
  const status = resolveStatus(result, isLoading);
  const unhealthy = (result?.monitors?.filter((m) => m.value.toLowerCase() !== 'healthy') ?? [])
    .sort((a, b) => a.key.localeCompare(b.key, 'pt-BR'));
  const healthy = (result?.monitors?.filter((m) => m.value.toLowerCase() === 'healthy') ?? [])
    .sort((a, b) => a.key.localeCompare(b.key, 'pt-BR'));

  return (
    <div className={`hc-card hc-card--${status}`}>
      {/* Header */}
      <div className="hc-card-head">
        <div className="hc-card-name-row">
          <CardDot status={status} />
          <span className="hc-card-name">{service.name}</span>
        </div>
        <div className="hc-card-head-right">
          {result?.version && !isLoading && (
            <span className="hc-card-version">v{result.version}</span>
          )}
          <div className="hc-card-status-row">
            {result && !isLoading && (
              <span className="hc-card-elapsed">{result.elapsed}ms</span>
            )}
            <StatusPill status={status} httpCode={result?.status} />
          </div>
        </div>
      </div>

      {/* Meta chips */}

      {/* Error message */}
      {result?.error && !isLoading && (
        <div className="hc-card-error">{result.error}</div>
      )}

      {/* Sem conteúdo útil na resposta */}
      {!isLoading && result && !result.error && !result.version && !result.monitors?.length && (
        <div className="hc-card-empty-body">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 15s1.5-2 4-2 4 2 4 2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={2.5} />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={2.5} />
          </svg>
          <span>Sem informações na resposta · {result.status}</span>
        </div>
      )}

      {/* Monitors */}
      {!isLoading && result?.monitors && result.monitors.length > 0 && (
        <div className="hc-monitors">
          <div className="hc-monitors-head">
            <span className="hc-monitors-label">Monitors ({result.monitors.length})</span>
            {unhealthy.length > 0 && (
              <span className="hc-monitors-fail">{unhealthy.length} com falha</span>
            )}
          </div>
          <div className="hc-monitors-grid">
            {unhealthy.map((m) => <MonitorChip key={m.key} m={m} />)}
            {healthy.map((m) => <MonitorChip key={m.key} m={m} />)}
          </div>
        </div>
      )}

      {/* Skeleton when loading */}
      {isLoading && (
        <div className="hc-skeleton">
          <div className="hc-skel hc-skel--w50" />
          <div className="hc-skel hc-skel--w70" />
          <div className="hc-skel hc-skel--w40" />
        </div>
      )}

      {/* Footer: URL + botão JSON */}
      {!isLoading && (
        <div className="hc-card-footer">
          <div className="hc-card-url" title={`${service.envUrls[envId]}${service.healthPath}`}>
            {service.envUrls[envId]}{service.healthPath}
          </div>
          {result?.rawBody && (
            <button
              className="hc-json-btn"
              onClick={() => setShowJson((v) => !v)}
              title="Ver resposta JSON"
            >
              {showJson ? 'Fechar' : '{ }'}
            </button>
          )}
        </div>
      )}

      {/* JSON viewer */}
      {showJson && result?.rawBody && (
        <pre className="hc-json-viewer">{result.rawBody}</pre>
      )}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────── */

export function HealthCheckPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => loadApisConfig());
  const [selectedEnvId, setSelectedEnvId] = useState(() => config.environments[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => {
    const envId = config.environments[0]?.id ?? '';
    return new Set(config.services.filter((s) => s.envUrls[envId]).map((s) => s.id));
  });
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  const [ran, setRan] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CardStatus | null>(null);
  const [sessionVersions, setSessionVersions] = useState<Record<string, Record<string, string | null>>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [allEnvResults, setAllEnvResults] = useState<Record<string, Record<string, CheckResult>>>({});
  const allEnvResultsRef = useRef(allEnvResults);
  allEnvResultsRef.current = allEnvResults;

  // Carrega a config COMPARTILHADA (mesma para todos os usuários).
  useEffect(() => {
    let cancelled = false;
    fetchSharedApisConfig().then((remote) => {
      if (!cancelled && remote) setConfig(remote);
    });
    return () => { cancelled = true; };
  }, []);

  // Se o ambiente selecionado deixou de existir após carregar a config remota,
  // realinha a seleção com o primeiro ambiente disponível.
  useEffect(() => {
    if (config.environments.find((e) => e.id === selectedEnvId)) return;
    const first = config.environments[0]?.id ?? '';
    setSelectedEnvId(first);
    setSelected(new Set(config.services.filter((s) => s.envUrls[first]).map((s) => s.id)));
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLastRun(null);
    setActiveFilter(null);
    const cached = allEnvResultsRef.current[selectedEnvId];
    if (cached && Object.keys(cached).length > 0) {
      setResults(cached);
      setRan(true);
    } else {
      setResults({});
      setRan(false);
    }
  }, [selectedEnvId]);

  const selectedEnv = config.environments.find((e) => e.id === selectedEnvId);
  const visibleServices = config.services
    .filter((s) => s.envUrls[selectedEnvId])
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const allSelected = selected.size === visibleServices.length && visibleServices.length > 0;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(visibleServices.map((s) => s.id)));
  };

  const toggleService = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const checkOne = useCallback(async (service: ApiService, envId: string, token: string, proxyUrl: string): Promise<CheckResult> => {
    // Cache-busting: parâmetro único por chamada → evita resposta cacheada (browser/proxy)
    const base = `${service.envUrls[envId]}${service.healthPath}`;
    const target = `${base}${base.includes('?') ? '&' : '?'}_=${Date.now()}`;
    // Em dev usa o middleware do Vite; em prod usa proxyUrl do ambiente (se configurado)
    const effectiveProxy = import.meta.env.DEV
      ? null
      : (proxyUrl || `${window.location.origin}/api/proxy/`);
    const url = import.meta.env.DEV
      ? `/cors-proxy/${encodeURIComponent(target)}`
      : `${effectiveProxy!.replace(/\/$/, '')}/${encodeURIComponent(target)}`;

    const start = Date.now();
    try {
      const headers: Record<string, string> = { ...(service.headers ?? {}) };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (service.method === 'POST' && service.body) headers['Content-Type'] = 'application/json';
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';

      const res = await fetch(url, {
        method: service.method,
        headers,
        cache: 'no-store',
        body: service.method === 'POST' && service.body ? service.body : undefined,
      });
      const elapsed = Date.now() - start;
      const text = await res.text().catch(() => '');
      let body: unknown = text;
      let rawBody = text;
      try {
        body = JSON.parse(text);
        rawBody = JSON.stringify(body, null, 2);
      } catch { /* keep text */ }
      return { status: res.status, ok: res.ok, elapsed, rawBody, ...parseBody(body) };
    } catch (err) {
      return { status: 0, ok: false, elapsed: Date.now() - start, error: friendlyError(err) };
    }
  }, []);

  const runChecks = async () => {
    const toCheck = visibleServices.filter((s) => selected.has(s.id));
    if (toCheck.length === 0) return;

    setResults({});
    setRan(true);
    setLastRun(null);
    setActiveFilter(null);
    setLoadingSet(new Set(toCheck.map((s) => s.id)));
    const token = selectedEnv?.token ?? '';
    const proxyUrl = selectedEnv?.proxyUrl ?? '';

    await Promise.all(
      toCheck.map(async (service) => {
        const result = await checkOne(service, selectedEnvId, token, proxyUrl);
        setResults((prev) => ({ ...prev, [service.id]: result }));
        setSessionVersions((prev) => ({
          ...prev,
          [service.id]: { ...(prev[service.id] ?? {}), [selectedEnvId]: result.version ?? null },
        }));
        setLoadingSet((prev) => {
          const next = new Set(prev);
          next.delete(service.id);
          return next;
        });
      }),
    );

    setLastRun(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  const runAllEnvs = async () => {
    setRunningAll(true);
    setAllEnvResults({});
    setActiveFilter(null);
    await Promise.all(
      config.environments.map(async (env) => {
        const envServices = config.services.filter((s) => s.envUrls[env.id]);
        await Promise.all(
          envServices.map(async (service) => {
            const result = await checkOne(service, env.id, env.token, env.proxyUrl);
            setSessionVersions((prev) => ({
              ...prev,
              [service.id]: { ...(prev[service.id] ?? {}), [env.id]: result.version ?? null },
            }));
            setAllEnvResults((prev) => {
              const next = { ...prev, [env.id]: { ...(prev[env.id] ?? {}), [service.id]: result } };
              return next;
            });
            // se for o ambiente atualmente selecionado, atualiza os cards em tempo real
            setResults((prev) => {
              if (env.id !== selectedEnvId) return prev;
              return { ...prev, [service.id]: result };
            });
            if (env.id === selectedEnvId) setRan(true);
          }),
        );
      }),
    );
    setRunningAll(false);
  };

  const isRunning = loadingSet.size > 0;
  const checkedResults = Object.values(results);
  const upCount = checkedResults.filter((r) => resolveStatus(r) === 'healthy').length;
  const downCount = checkedResults.filter((r) => resolveStatus(r) === 'unhealthy').length;
  const degradedCount = checkedResults.filter((r) => resolveStatus(r) === 'degraded').length;
  const errorCount = checkedResults.filter((r) => resolveStatus(r) === 'error').length;

  const toggleFilter = (status: CardStatus) => {
    setActiveFilter((prev) => (prev === status ? null : status));
  };

  const selectedAndVisible = visibleServices.filter((s) => selected.has(s.id));
  const filteredCards = activeFilter
    ? selectedAndVisible.filter((s) => resolveStatus(results[s.id], loadingSet.has(s.id)) === activeFilter)
    : selectedAndVisible;

  return (
    <ApisLayout title="Health Check" activeApi="healthcheck" fluid>
      <div className="hc-page">

        {/* ── Sidebar de controle ── */}
        <aside className="hc-aside">
          <div className="hc-aside-body">

            <div className="hc-aside-section">
              <span className="hc-section-label">Ambiente</span>
              <select
                className="input"
                value={selectedEnvId}
                onChange={(e) => setSelectedEnvId(e.target.value)}
              >
                {config.environments.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
              {selectedEnv?.token && (
                <span className="hc-token-ok">
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Token configurado
                </span>
              )}
            </div>

            <div className="hc-aside-section" style={{ flex: 1, minHeight: 0 }}>
              <div className="hc-section-header">
                <span className="hc-section-label">
                  Serviços
                  <span className="hc-section-count">{selected.size}/{visibleServices.length}</span>
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setSelected(new Set(visibleServices.map((s) => s.id)))}
                  >
                    Todos
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setSelected(new Set())}
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="hc-service-list">
                {visibleServices.map((s) => {
                  const res = results[s.id];
                  const loading = loadingSet.has(s.id);
                  const st = resolveStatus(res, loading);
                  return (
                    <label key={s.id} className="hc-service-item">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleService(s.id)}
                      />
                      {loading
                        ? <SpinnerDot />
                        : <span className={`hc-dot hc-dot--${st}`} style={{ width: 8, height: 8 }} />}
                      <span className="hc-service-name">{s.name}</span>
                    </label>
                  );
                })}
                {visibleServices.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
                    Nenhum serviço neste ambiente.
                  </p>
                )}
              </div>
            </div>

          </div>

          <div className="hc-aside-footer">
            <span className="hc-selected-info">
              {selected.size > 0
                ? `${selected.size} de ${visibleServices.length} selecionados`
                : 'Nenhum selecionado'}
            </span>
            <div className="hc-aside-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/apis/config')} disabled={isRunning || runningAll}>
                Configurar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={runChecks}
                disabled={isRunning || runningAll || selected.size === 0}
              >
                {isRunning ? `Verificando… ${loadingSet.size}` : 'Verificar'}
              </button>
            </div>
          </div>
        </aside>

        {/* ── Área de resultados ── */}
        <main className="hc-main">

          {ran && (
            <div className="hc-summary-bar">
              {upCount > 0 && (
                <button
                  className={`hc-sum-item hc-sum--up hc-sum-btn${activeFilter === 'healthy' ? ' hc-sum-btn--active' : ''}`}
                  onClick={() => toggleFilter('healthy')}
                >
                  <span className="hc-dot hc-dot--healthy" />
                  {upCount} healthy
                </button>
              )}
              {downCount > 0 && (
                <button
                  className={`hc-sum-item hc-sum--down hc-sum-btn${activeFilter === 'unhealthy' ? ' hc-sum-btn--active' : ''}`}
                  onClick={() => toggleFilter('unhealthy')}
                >
                  <span className="hc-dot hc-dot--unhealthy" />
                  {downCount} unhealthy
                </button>
              )}
              {degradedCount > 0 && (
                <button
                  className={`hc-sum-item hc-sum--degraded hc-sum-btn${activeFilter === 'degraded' ? ' hc-sum-btn--active' : ''}`}
                  onClick={() => toggleFilter('degraded')}
                >
                  <span className="hc-dot hc-dot--degraded" />
                  {degradedCount} degraded
                </button>
              )}
              {errorCount > 0 && (
                <button
                  className={`hc-sum-item hc-sum--error hc-sum-btn${activeFilter === 'error' ? ' hc-sum-btn--active' : ''}`}
                  onClick={() => toggleFilter('error')}
                >
                  <span className="hc-dot hc-dot--error" />
                  {errorCount} sem acesso
                </button>
              )}
              {loadingSet.size > 0 && (
                <span className="hc-sum-item hc-sum--loading">
                  <SpinnerDot />
                  {loadingSet.size} verificando
                </span>
              )}
              {activeFilter && (
                <button className="hc-sum-clear" onClick={() => setActiveFilter(null)}>
                  ✕ limpar filtro
                </button>
              )}
              {lastRun && (
                <span className="hc-sum-time">Última verificação: {lastRun}</span>
              )}
            </div>
          )}

          {!ran ? (
            <div className="hc-empty">
              <div className="hc-empty-icon">
                <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div className="hc-empty-title">Nenhuma verificação realizada</div>
              <div className="hc-empty-desc">
                Selecione o ambiente e as APIs, depois clique em <strong>Verificar</strong>.
              </div>
            </div>
          ) : (
            <div className="hc-grid">
              {filteredCards.map((s) => (
                <ResultCard
                  key={s.id}
                  service={s}
                  result={results[s.id]}
                  isLoading={loadingSet.has(s.id)}
                  envId={selectedEnvId}
                />
              ))}
              {filteredCards.length === 0 && activeFilter && (
                <div style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                  Nenhuma API com status <strong>{STATUS_LABEL[activeFilter]}</strong>.
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Painel de versões por sessão ── */}
        <VersionPanel config={config} sessionVersions={sessionVersions} onRunAll={runAllEnvs} runningAll={runningAll} disabled={isRunning} />

      </div>
    </ApisLayout>
  );
}
