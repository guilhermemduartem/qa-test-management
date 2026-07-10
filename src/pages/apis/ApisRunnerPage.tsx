import { useState, useMemo, useEffect, useCallback } from 'react';
import { ApisLayout } from './ApisLayout';
import { loadApisConfig, fetchSharedApisConfig } from '../../lib/apisStorage';
import CodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import type { ApisConfig, ApiEndpoint } from '../../types/apis';
import { buildFolderTree, filterByFolder, noFolderCount } from './folderTree';
import { FolderTreeSidebar } from './FolderTreeSidebar';

type KVPair = { key: string; value: string };

interface RunResponse {
  status: number; ok: boolean; elapsed: number; body: string;
  resHeaders: Record<string, string>;
}

interface RunnerSession {
  envId: string; hostId: string; method: string; path: string;
  reqHeaders: KVPair[]; reqBody: string;
  response: RunResponse | null; executedAt: number;
}

const SESSION_KEY = 'qar_runner_sessions';
function loadSessions(): Record<string, RunnerSession> {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}'); } catch { return {}; }
}
function saveSession(epId: string, data: RunnerSession) {
  try { const all = loadSessions(); all[epId] = data; sessionStorage.setItem(SESSION_KEY, JSON.stringify(all)); } catch { /**/ }
}
function recordToKV(rec: Record<string, string>): KVPair[] {
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}
function kvToRecord(pairs: KVPair[]): Record<string, string> {
  const rec: Record<string, string> = {};
  pairs.forEach(({ key, value }) => { if (key.trim()) rec[key.trim()] = value; });
  return rec;
}

const METHOD_COLOR: Record<string, string> = {
  GET: '#50fa7b', POST: '#ffb86c', PUT: '#8be9fd', PATCH: '#f1fa8c', DELETE: '#ff5555',
};

function envColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('prod')) return { bg: 'rgba(255,85,85,.18)', border: '#ff5555', text: '#ff5555' };
  if (n.includes('stg') || n.includes('staging')) return { bg: 'rgba(189,147,249,.18)', border: '#bd93f9', text: '#bd93f9' };
  if (n.includes('qa')) return { bg: 'rgba(241,250,140,.18)', border: '#f1fa8c', text: '#c8a800' };
  if (n.includes('tst') || n.includes('test') || n.includes('azul')) return { bg: 'rgba(255,184,108,.18)', border: '#ffb86c', text: '#e07b00' };
  if (n.includes('dev')) return { bg: 'rgba(139,233,253,.18)', border: '#8be9fd', text: '#0097b2' };
  return { bg: 'rgba(80,250,123,.18)', border: '#50fa7b', text: '#1a8a3d' };
}

export function ApisRunnerPage() {
  const [config, setConfig] = useState<ApisConfig>(() => loadApisConfig());

  // Carrega a config COMPARTILHADA (mesma para todos os usuários).
  useEffect(() => {
    let cancelled = false;
    fetchSharedApisConfig().then((remote) => {
      if (!cancelled && remote) setConfig(remote);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Seleção de endpoint ──
  const [selectedEpId, setSelectedEpId] = useState<string | null>(() => {
    const hash = window.location.hash;
    const m = hash.match(/[?&]ep=([^&]+)/);
    return m ? m[1] : null;
  });

  // ── Campos editáveis (sem salvar) ──
  const [runEnvId, setRunEnvId] = useState(config.environments[0]?.id ?? '');
  const [runMethod, setRunMethod] = useState<ApiEndpoint['method']>('GET');
  const [runHostId, setRunHostId] = useState('');
  const [runPath, setRunPath] = useState('');
  const [runHeaders, setRunHeaders] = useState<KVPair[]>([]);
  const [runBody, setRunBody] = useState('');
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [resTab, setResTab] = useState<'body' | 'headers'>('body');
  const [loading, setLoading] = useState(false);

  // ── Sidebar ──
  const [folderSel, setFolderSel] = useState<'all' | 'none' | string>('all');
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpandedItems((p) => ({ ...p, [id]: !p[id] }));

  const folderRoots = useMemo(() => buildFolderTree(config.endpoints, config.folders), [config.endpoints, config.folders]);
  const nfc = useMemo(() => noFolderCount(config.endpoints), [config.endpoints]);
  const filteredEps = useMemo(() => {
    const base = filterByFolder(config.endpoints, folderSel);
    const q = search.toLowerCase();
    return q ? base.filter((ep) => ep.name.toLowerCase().includes(q) || ep.path.toLowerCase().includes(q)) : base;
  }, [config.endpoints, folderSel, search]);

  // ── Carregar endpoint selecionado ──
  const loadEp = useCallback((ep: ApiEndpoint) => {
    let session: RunnerSession | undefined;
    try { session = loadSessions()[ep.id]; } catch { session = undefined; }
    if (session) {
      setRunEnvId(session.envId || config.environments[0]?.id || '');
      setRunMethod((session.method as ApiEndpoint['method']) || ep.method);
      setRunHostId(session.hostId || ep.hostId || '');
      setRunPath(session.path ?? ep.path);
      setRunHeaders(Array.isArray(session.reqHeaders) ? session.reqHeaders : recordToKV(ep.headers ?? {}));
      const rb = session.reqBody ?? ep.body ?? '';
      try { setRunBody(JSON.stringify(JSON.parse(rb), null, 2)); } catch { setRunBody(rb); }
      const res = session.response;
      setResponse(res ? { ...res, resHeaders: res.resHeaders ?? {} } : null);
    } else {
      setRunMethod(ep.method);
      setRunHostId(ep.hostId ?? '');
      setRunPath(ep.path ?? '');
      setRunHeaders(recordToKV(ep.headers ?? {}));
      const rb = ep.body ?? '';
      try { setRunBody(JSON.stringify(JSON.parse(rb), null, 2)); } catch { setRunBody(rb); }
      setResponse(null);
    }
  }, [config.environments]);

  const selectEp = useCallback((id: string | null) => {
    setSelectedEpId(id);
    window.history.replaceState(null, '', id ? `#/apis/runner?ep=${id}` : '#/apis/runner');
    if (id) {
      const ep = config.endpoints.find((e) => e.id === id);
      if (ep) loadEp(ep);
    }
  }, [config.endpoints, loadEp]);

  // Carregar ep inicial da URL
  useEffect(() => {
    const openEpId = sessionStorage.getItem('qar_runner_open_ep');
    if (openEpId) { sessionStorage.removeItem('qar_runner_open_ep'); selectEp(openEpId); return; }
    if (selectedEpId) {
      const ep = config.endpoints.find((e) => e.id === selectedEpId);
      if (ep) loadEp(ep);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Execução ──
  const runHost = config.hosts.find((h) => h.id === runHostId);
  const rawBase = (runHost?.envUrls[runEnvId] ?? '').replace(/\/$/, '');
  const baseUrl = rawBase.match(/^https?:\/\//) ? rawBase : rawBase ? `https://${rawBase}` : '';
  const fullUrl = baseUrl + runPath;
  const urlValid = fullUrl.startsWith('http');

  const selEnv = config.environments.find((e) => e.id === runEnvId);
  const eColor = selEnv ? envColor(selEnv.name) : { bg: 'var(--surface-alt)', border: 'var(--divider)', text: 'var(--text-muted)' };

  const execute = useCallback(async () => {
    if (!urlValid) return;
    setLoading(true);
    setResponse(null);
    const t0 = Date.now();
    try {
      const env = config.environments.find((e) => e.id === runEnvId);
      const headers: Record<string, string> = kvToRecord(runHeaders);
      if (env?.token) headers['Authorization'] = `Bearer ${env.token}`;
      if (runBody.trim() && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
      const url = import.meta.env.DEV
        ? `/cors-proxy/${encodeURIComponent(fullUrl)}`
        : `${window.location.origin}/api/proxy/${encodeURIComponent(fullUrl)}`;
      const res = await fetch(url, { method: runMethod, headers, body: runBody.trim() || undefined });
      const text = await res.text();
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      const result: RunResponse = { status: res.status, ok: res.ok, elapsed: Date.now() - t0, body: text, resHeaders };
      setResponse(result);
      setResTab('body');
      if (selectedEpId) saveSession(selectedEpId, { envId: runEnvId, hostId: runHostId, method: runMethod, path: runPath, reqHeaders: runHeaders, reqBody: runBody, response: result, executedAt: Date.now() });
    } catch (err) {
      const result: RunResponse = { status: 0, ok: false, elapsed: Date.now() - t0, body: String(err), resHeaders: {} };
      setResponse(result);
      if (selectedEpId) saveSession(selectedEpId, { envId: runEnvId, hostId: runHostId, method: runMethod, path: runPath, reqHeaders: runHeaders, reqBody: runBody, response: result, executedAt: Date.now() });
    } finally { setLoading(false); }
  }, [config, runEnvId, runHostId, runMethod, runPath, runHeaders, runBody, fullUrl, urlValid, selectedEpId]);

  const prettyResponse = useMemo(() => {
    if (!response?.body) return '';
    try { return JSON.stringify(JSON.parse(response.body), null, 2); } catch { return response.body; }
  }, [response]);

  const viewEp = config.endpoints.find((ep) => ep.id === selectedEpId) ?? null;

  return (
    <ApisLayout title="APIs" activeApi="runner" fluid>
      <div style={{ display: 'flex', flex: 1, width: '100%', overflow: 'hidden' }}>

        {/* ── Sidebar + lista ── */}
        <div style={{ flex: '0 0 40%', borderRight: '1px solid var(--divider)', display: 'flex', overflow: 'hidden' }}>

          {/* Folder sidebar */}
          <aside style={{ width: 180, flexShrink: 0, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' }}>
                Todas <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({config.endpoints.length})</span>
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 6px 0' }}>
              <FolderTreeSidebar
                roots={folderRoots}
                totalCount={config.endpoints.length}
                noFolderCnt={nfc}
                selected={folderSel}
                onSelect={setFolderSel}
              />
            </div>
          </aside>

          {/* Endpoint list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-card)' }}>
            <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--divider)' }}>
              <input className="input" placeholder="Buscar..." value={search}
                onChange={(e) => setSearch(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredEps.length === 0 && (
                <p style={{ padding: '20px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                  {config.endpoints.length === 0 ? 'Nenhuma API cadastrada.' : 'Nenhum resultado.'}
                </p>
              )}
              {filteredEps.map((ep) => {
                const isSelected = ep.id === selectedEpId;
                return (
                  <button key={ep.id}
                    className={`ep-list-item${isSelected ? ' ep-selected' : ''}`}
                    onClick={() => selectEp(isSelected ? null : ep.id)}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: METHOD_COLOR[ep.method] ?? 'var(--text-muted)', minWidth: 46, flexShrink: 0 }}>
                      {ep.method}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {ep.path}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Painel de detalhe ── */}
        <div style={{ flex: '0 0 60%', overflow: 'auto', minWidth: 0, background: 'var(--bg-card)' }}>
          {!viewEp ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.4}>
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13 }}>Selecione uma API para executar</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>

              {/* ── Nome + pasta + ambiente ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewEp.name}</div>
                  {viewEp.folder && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      {viewEp.folder}
                    </div>
                  )}
                </div>
                <select
                  style={{ fontSize: 11, padding: '4px 8px', borderRadius: 7, border: `2px solid ${eColor.border}`, background: eColor.bg, color: eColor.text, fontWeight: 700, cursor: 'pointer', outline: 'none', flexShrink: 0, maxWidth: 130 }}
                  value={runEnvId}
                  onChange={(e) => { setRunEnvId(e.target.value); setResponse(null); }}
                >
                  {config.environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* ── Barra de execução ── */}
              <div style={{ flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--divider)', background: 'var(--surface-alt)' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select
                    className="input"
                    style={{ width: 76, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: METHOD_COLOR[runMethod], flexShrink: 0, padding: '3px 4px' }}
                    value={runMethod}
                    onChange={(e) => setRunMethod(e.target.value as ApiEndpoint['method'])}
                  >
                    {(['GET','POST','PUT','PATCH','DELETE'] as const).map((m) => (
                      <option key={m} value={m} style={{ color: METHOD_COLOR[m] }}>{m}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    style={{ width: 90, fontSize: 10, flexShrink: 0, padding: '3px 4px' }}
                    value={runHostId}
                    onChange={(e) => setRunHostId(e.target.value)}
                  >
                    <option value="">Sem host</option>
                    {config.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                  <input
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 10, minWidth: 0, padding: '3px 7px', background: 'var(--bg-card)', border: `1px solid ${urlValid ? 'var(--divider)' : 'var(--error,#ef4444)'}`, borderRadius: 6, outline: 'none', color: 'var(--text-primary)' }}
                    value={runPath}
                    placeholder="/api/v1/recurso"
                    onChange={(e) => setRunPath(e.target.value)}
                  />
                  <button
                    style={{ flexShrink: 0, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', cursor: urlValid && !loading ? 'pointer' : 'not-allowed', background: urlValid && !loading ? 'var(--accent)' : 'var(--surface-alt)', color: urlValid && !loading ? '#fff' : 'var(--text-muted)', opacity: loading ? .6 : 1, transition: 'background .15s' }}
                    disabled={loading || !urlValid}
                    onClick={execute}
                    title="Executar"
                  >
                    {loading
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    }
                  </button>
                </div>
              </div>

              {/* ── Conteúdo ── */}
              <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Headers colapsável */}
                {(() => {
                  const hOpen = !!expandedItems['__headers__'];
                  return (
                    <div style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
                      <button type="button"
                        onClick={() => toggleExpand('__headers__')}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-alt)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: 'transform .15s', transform: hOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, color: 'var(--text-muted)' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, textAlign: 'left' }}>Headers</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                          {runHeaders.filter(h => h.key).length > 0 ? `${runHeaders.filter(h => h.key).length} item${runHeaders.filter(h => h.key).length !== 1 ? 's' : ''}` : 'nenhum'}
                        </span>
                      </button>
                      {hOpen && (
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {runHeaders.map((pair, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6 }}>
                              <input className="input" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} placeholder="Chave"
                                value={pair.key} onChange={(e) => setRunHeaders((p) => p.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                              <input className="input" style={{ flex: 2, fontSize: 12, fontFamily: 'monospace' }} placeholder="Valor"
                                value={pair.value} onChange={(e) => setRunHeaders((p) => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                              <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '0 8px' }}
                                onClick={() => setRunHeaders((p) => p.filter((_, j) => j !== i))}>✕</button>
                            </div>
                          ))}
                          <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                            onClick={() => setRunHeaders((p) => [...p, { key: '', value: '' }])}>
                            + Adicionar header
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Body */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div className="detail-label" style={{ margin: 0 }}>Body</div>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                      onClick={() => { try { setRunBody(JSON.stringify(JSON.parse(runBody), null, 2)); } catch { /**/ } }}
                      disabled={!runBody.trim()}>
                      Beautify
                    </button>
                  </div>
                  <div style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden', background: '#1e1e2e' }}>
                    <CodeEditor
                      value={runBody}
                      onValueChange={setRunBody}
                      highlight={(c) => c ? Prism.highlight(c, Prism.languages.json, 'json') : ''}
                      padding={12}
                      placeholder="null"
                      style={{ fontFamily: '"Fira Code", monospace', fontSize: 12, lineHeight: 1.6, minHeight: 80, background: 'transparent', color: '#cdd6f4' }}
                    />
                  </div>
                </div>

                {/* Response */}
                {loading && (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aguardando resposta...</div>
                )}
                {response && (
                  <div style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'var(--surface-alt)', borderBottom: '1px solid var(--divider)', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14, color: response.ok ? '#50fa7b' : '#ff5555' }}>
                        {response.status || 'ERR'}
                      </span>
                      <span style={{ fontSize: 12, color: response.ok ? '#50fa7b' : '#ff5555', fontWeight: 600 }}>{response.ok ? 'OK' : 'Erro'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{response.elapsed} ms</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        {(['body', 'headers'] as const).map((t) => (
                          <button key={t} onClick={() => setResTab(t)}
                            style={{ fontSize: 11, padding: '3px 10px', border: 'none', borderRadius: 4, cursor: 'pointer', background: resTab === t ? 'var(--accent)' : 'transparent', color: resTab === t ? '#fff' : 'var(--text-muted)', fontWeight: resTab === t ? 600 : 400 }}>
                            {t === 'body' ? 'Body' : `Headers (${Object.keys(response.resHeaders ?? {}).length})`}
                          </button>
                        ))}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                          onClick={() => navigator.clipboard.writeText(resTab === 'body' ? prettyResponse : JSON.stringify(response.resHeaders ?? {}, null, 2))}>
                          Copiar
                        </button>
                      </div>
                    </div>
                    <div style={{ background: '#1e1e2e', maxHeight: 420, overflow: 'auto' }}>
                      {resTab === 'body' ? (
                        <pre style={{ margin: 0, padding: 14, fontFamily: '"Fira Code", monospace', fontSize: 12, lineHeight: 1.6, color: '#cdd6f4' }}
                          dangerouslySetInnerHTML={{ __html: (() => { try { return Prism.highlight(prettyResponse, Prism.languages.json, 'json'); } catch { return prettyResponse || '<em style="opacity:.4">Sem conteúdo</em>'; } })() }} />
                      ) : (
                        <div>
                          {Object.entries(response.resHeaders ?? {}).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '6px 12px', color: '#bd93f9', minWidth: 180, flexShrink: 0 }}>{k}</span>
                              <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '6px 12px', color: '#f8f8f2', wordBreak: 'break-all' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ApisLayout>
  );
}
