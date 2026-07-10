import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import CodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css';
import { ApisLayout } from './ApisLayout';
import { Modal } from '../../components/Modal';
import { loadApisConfig, saveApisConfig, resetApisConfig, generateId, fetchSharedApisConfig, pushSharedApisConfig } from '../../lib/apisStorage';
import { showToast } from '../../lib/toast';
import type { ApisConfig, ApiEnvironment, ApiService, ApiHost, ApiEndpoint } from '../../types/apis';
import { buildFolderTree, filterByFolder, noFolderCount } from './folderTree';
import { FolderTreeSidebar } from './FolderTreeSidebar';

type Tab = 'envs' | 'services' | 'hosts' | 'endpoints';
type KVPair = { key: string; value: string };

const EMPTY_ENV: Omit<ApiEnvironment, 'id'> = { name: '', token: '', proxyUrl: '' };
const EMPTY_SERVICE: Omit<ApiService, 'id'> = { name: '', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {}, envUrls: {} };
const EMPTY_HOST: Omit<ApiHost, 'id'> = { name: '', envUrls: {} };
const EMPTY_ENDPOINT: Omit<ApiEndpoint, 'id'> = { name: '', folder: '', hostId: '', path: '/', method: 'GET', headers: {}, body: '' };

function recordToKV(rec: Record<string, string>): KVPair[] {
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}
function kvToRecord(pairs: KVPair[]): Record<string, string> {
  const rec: Record<string, string> = {};
  pairs.forEach(({ key, value }) => { if (key.trim()) rec[key.trim()] = value; });
  return rec;
}

function JsonBodyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [jsonError, setJsonError] = useState('');
  // Keep Prism highlight working after dynamic content changes
  useEffect(() => { Prism.highlightAll(); }, []);

  const format = () => {
    if (!value.trim()) return;
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
      setJsonError('');
    } catch {
      setJsonError('JSON inválido — verifique a sintaxe antes de formatar');
    }
  };

  const highlight = (code: string) =>
    code
      ? Prism.highlight(code, Prism.languages.json, 'json')
      : '';

  return (
    <div className="form-group">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ margin: 0 }}>Body — opcional</label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11 }}
          onClick={format}
          disabled={!value.trim()}
        >
          Beautify
        </button>
      </div>
      <div
        style={{
          border: jsonError ? '1px solid var(--error, #ef4444)' : '1px solid var(--divider)',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#1e1e2e',
          minHeight: 200,
        }}
      >
        <CodeEditor
          value={value}
          onValueChange={(v) => { onChange(v); if (jsonError) setJsonError(''); }}
          highlight={highlight}
          padding={12}
          placeholder={'{\n  "chave": "valor"\n}'}
          style={{
            fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
            fontSize: 13,
            lineHeight: 1.6,
            minHeight: 200,
            background: 'transparent',
            color: '#cdd6f4',
          }}
          textareaClassName="json-editor-textarea"
        />
      </div>
      {jsonError && (
        <p style={{ fontSize: 11, color: 'var(--error, #ef4444)', margin: '4px 0 0' }}>{jsonError}</p>
      )}
    </div>
  );
}

function parseCurl(raw: string): { method: ApiEndpoint['method']; baseUrl: string; path: string; headers: KVPair[]; body: string } {
  const curl = raw.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ').trim();

  const methodMatch = curl.match(/-X\s+([A-Z]+)/i);
  let method: ApiEndpoint['method'] = 'GET';
  if (methodMatch) {
    const m = methodMatch[1].toUpperCase();
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) method = m as ApiEndpoint['method'];
  }

  let rawUrl = '';
  const urlM = curl.match(/--url\s+['"]?(https?:\/\/[^'"\s]+)['"]?/)
    ?? curl.match(/curl\s+['"]?(https?:\/\/[^'"\s]+)['"]?/)
    ?? curl.match(/['"]?(https?:\/\/[^'"\s]+)['"]?/);
  if (urlM) rawUrl = urlM[1];

  let baseUrl = '';
  let path = '/';
  try {
    const u = new URL(rawUrl);
    baseUrl = u.origin;
    path = (u.pathname || '/') + u.search;
  } catch { /* invalid */ }

  const headers: KVPair[] = [];
  const hRe = /(?:-H|--header)\s+['"]([^'"]+)['"]/g;
  let hm;
  while ((hm = hRe.exec(curl)) !== null) {
    const ci = hm[1].indexOf(':');
    if (ci > 0) headers.push({ key: hm[1].slice(0, ci).trim(), value: hm[1].slice(ci + 1).trim() });
  }

  let body = '';
  const bm = curl.match(/(?:--data-raw|--data-binary|--data|-d)\s+'([\s\S]+?)'\s*(?:--|$)/)
    ?? curl.match(/(?:--data-raw|--data-binary|--data|-d)\s+'([^']+)'/)
    ?? curl.match(/(?:--data-raw|--data-binary|--data|-d)\s+"((?:[^"\\]|\\.)*)"/)
  if (bm) { body = bm[1].trim(); if (method === 'GET') method = 'POST'; }

  return { method, baseUrl, path, headers, body };
}

export function ApisConfigPage() {
  const [config, setConfig] = useState<ApisConfig>(() => loadApisConfig());
  const [tab, setTab] = useState<Tab>(() => {
    const hash = window.location.hash;
    return hash.includes('ep=') ? 'endpoints' : 'envs';
  });

  // ── Environments ──
  const [envModal, setEnvModal] = useState<{ open: boolean; env: ApiEnvironment | null }>({ open: false, env: null });
  const [envForm, setEnvForm] = useState<Omit<ApiEnvironment, 'id'>>(EMPTY_ENV);

  // ── Services (Health Check only) ──
  const [svcModal, setSvcModal] = useState<{ open: boolean; svc: ApiService | null }>({ open: false, svc: null });
  const [svcForm, setSvcForm] = useState<Omit<ApiService, 'id'>>(EMPTY_SERVICE);
  const [svcHeaderPairs, setSvcHeaderPairs] = useState<KVPair[]>([]);

  // ── Hosts ──
  const [hostModal, setHostModal] = useState<{ open: boolean; host: ApiHost | null }>({ open: false, host: null });
  const [hostForm, setHostForm] = useState<Omit<ApiHost, 'id'>>(EMPTY_HOST);

  // ── Endpoints ──
  const [epModal, setEpModal] = useState<{ open: boolean; ep: ApiEndpoint | null }>({ open: false, ep: null });
  const [epForm, setEpForm] = useState<Omit<ApiEndpoint, 'id'>>(EMPTY_ENDPOINT);
  const [epHeaderPairs, setEpHeaderPairs] = useState<KVPair[]>([]);
  const [curlInput, setCurlInput] = useState('');
  const [curlOpen, setCurlOpen] = useState(false);
  const [viewEpId, setViewEpId] = useState<string | null>(() => {
    const hash = window.location.hash; // e.g. #/apis/config?ep=abc123
    const match = hash.match(/[?&]ep=([^&]+)/);
    return match ? match[1] : null;
  });

  const selectEp = (id: string | null) => {
    setViewEpId(id);
    const base = '#/apis/config';
    window.history.replaceState(null, '', id ? `${base}?ep=${id}` : base);
  };
  const [urlsOpen, setUrlsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpandedItems((p) => ({ ...p, [id]: !p[id] }));
  const [folderSel, setFolderSel] = useState<'all' | 'none' | string>('all');
  const [dragEpId, setDragEpId] = useState<string | null>(null);
  const [dragOverEpId, setDragOverEpId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [folderCreating, setFolderCreating] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [deletingEpId, setDeletingEpId] = useState<string | null>(null);

  // ── Inline runner (campos editáveis) ──
  const [runEnvId, setRunEnvId] = useState(() => loadApisConfig().environments[0]?.id ?? '');
  const [runMethod, setRunMethod] = useState<ApiEndpoint['method']>('GET');
  const [runHostId, setRunHostId] = useState('');
  const [runPath, setRunPath] = useState('');
  const [runHeaders, setRunHeaders] = useState<KVPair[]>([]);
  const [runBody, setRunBody] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [runResponse, setRunResponse] = useState<{
    status: number; ok: boolean; elapsed: number;
    body: string; resHeaders: Record<string, string>;
  } | null>(null);
  const [runResTab, setRunResTab] = useState<'body' | 'headers'>('body');

  // Sync campos editáveis quando troca de endpoint
  useEffect(() => {
    if (!viewEpId) return;
    const ep = config.endpoints.find((e) => e.id === viewEpId);
    if (!ep) return;
    setRunMethod(ep.method);
    setRunHostId(ep.hostId);
    setRunPath(ep.path);
    setRunHeaders(recordToKV(ep.headers ?? {}));
    const rawBody = ep.body ?? '';
    try { setRunBody(JSON.stringify(JSON.parse(rawBody), null, 2)); }
    catch { setRunBody(rawBody); }
    setRunResponse(null);
  }, [viewEpId]); // eslint-disable-line react-hooks/exhaustive-deps

  const executeInline = useCallback(async () => {
    const host = config.hosts.find((h) => h.id === runHostId);
    const rawBase = (host?.envUrls[runEnvId] ?? '').replace(/\/$/, '');
    const baseUrl = rawBase.match(/^https?:\/\//) ? rawBase : rawBase ? `https://${rawBase}` : '';
    if (!baseUrl) { showToast('URL não configurada para este ambiente.', 'warning'); return; }

    const target = baseUrl + runPath;
    setRunLoading(true);
    setRunResponse(null);
    const t0 = Date.now();
    try {
      const env = config.environments.find((e) => e.id === runEnvId);
      const headers: Record<string, string> = kvToRecord(runHeaders);
      if (env?.token) headers['Authorization'] = `Bearer ${env.token}`;
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(runMethod) && runBody.trim();
      if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

      const url = import.meta.env.DEV
        ? `/cors-proxy/${encodeURIComponent(target)}`
        : `${window.location.origin}/api/proxy/${encodeURIComponent(target)}`;

      const res = await fetch(url, { method: runMethod, headers, body: hasBody ? runBody : undefined });
      const text = await res.text();
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      setRunResponse({ status: res.status, ok: res.ok, elapsed: Date.now() - t0, body: text, resHeaders });
      setRunResTab('body');
    } catch (err) {
      setRunResponse({ status: 0, ok: false, elapsed: Date.now() - t0, body: String(err), resHeaders: {} });
    } finally {
      setRunLoading(false);
    }
  }, [config, runEnvId, runHostId, runPath, runMethod, runHeaders, runBody]);

  const [folderModal, setFolderModal] = useState(false);
  const [folderModalParent, setFolderModalParent] = useState('');
  const [folderModalName, setFolderModalName] = useState('');

  const allFolderPaths = useMemo(() => {
    const paths = new Set<string>();
    const addPath = (f: string) => {
      if (!f.trim()) return;
      f.trim().split('/').filter(Boolean).forEach((_, i, arr) => {
        paths.add(arr.slice(0, i + 1).join('/'));
      });
    };
    config.endpoints.forEach((ep) => addPath(ep.folder ?? ''));
    config.folders.forEach(addPath);
    return [...paths].sort();
  }, [config.endpoints, config.folders]);

  const epGrouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    config.endpoints.forEach((ep) => {
      const key = ep.folder?.trim() || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ep);
    });
    return map;
  }, [config.endpoints]);

  const persist = (next: ApisConfig) => {
    setConfig(next);
    saveApisConfig(next);
    // Propaga para todos os usuários (config compartilhada no Supabase).
    pushSharedApisConfig(next).then((res) => {
      if (!res.ok) showToast('Salvo localmente, mas falhou ao compartilhar com a equipe.', 'warning');
    });
  };

  // Ao abrir, carrega a config compartilhada. Se ainda não existir no servidor,
  // semeia com a config local atual (assim o que já foi criado passa a valer p/ todos).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchSharedApisConfig();
      if (cancelled) return;
      if (remote) {
        setConfig(remote);
      } else {
        const local = loadApisConfig();
        pushSharedApisConfig(local);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Environments ── */
  const openNewEnv = () => { setEnvForm(EMPTY_ENV); setEnvModal({ open: true, env: null }); };
  const openEditEnv = (env: ApiEnvironment) => {
    setEnvForm({ name: env.name, token: env.token, proxyUrl: env.proxyUrl ?? '' });
    setEnvModal({ open: true, env });
  };
  const saveEnv = () => {
    if (!envForm.name.trim()) return;
    if (envModal.env) {
      persist({ ...config, environments: config.environments.map((e) => e.id === envModal.env!.id ? { ...e, ...envForm } : e) });
    } else {
      persist({ ...config, environments: [...config.environments, { id: generateId(), ...envForm }] });
    }
    setEnvModal({ open: false, env: null });
    showToast('Ambiente salvo.', 'success');
  };
  const deleteEnv = (id: string) => {
    persist({
      ...config,
      environments: config.environments.filter((e) => e.id !== id),
      services: config.services.map((s) => { const urls = { ...s.envUrls }; delete urls[id]; return { ...s, envUrls: urls }; }),
      hosts: config.hosts.map((h) => { const urls = { ...h.envUrls }; delete urls[id]; return { ...h, envUrls: urls }; }),
    });
    showToast('Ambiente removido.', 'success');
  };

  /* ── Services ── */
  const openNewSvc = () => {
    const envUrls: Record<string, string> = {};
    config.environments.forEach((e) => { envUrls[e.id] = ''; });
    setSvcForm({ ...EMPTY_SERVICE, envUrls });
    setSvcHeaderPairs([]);
    setSvcModal({ open: true, svc: null });
  };
  const openEditSvc = (svc: ApiService) => {
    const envUrls: Record<string, string> = {};
    config.environments.forEach((e) => { envUrls[e.id] = svc.envUrls[e.id] ?? ''; });
    setSvcForm({ name: svc.name, healthPath: svc.healthPath, method: svc.method, body: svc.body, headers: svc.headers ?? {}, envUrls });
    setSvcHeaderPairs(recordToKV(svc.headers ?? {}));
    setSvcModal({ open: true, svc });
  };
  const saveSvc = () => {
    if (!svcForm.name.trim()) return;
    const cleanUrls: Record<string, string> = {};
    Object.entries(svcForm.envUrls).forEach(([k, v]) => { if (v.trim()) cleanUrls[k] = v.trim(); });
    const data = { ...svcForm, headers: kvToRecord(svcHeaderPairs), envUrls: cleanUrls };
    if (svcModal.svc) {
      persist({ ...config, services: config.services.map((s) => s.id === svcModal.svc!.id ? { ...s, ...data } : s) });
    } else {
      persist({ ...config, services: [...config.services, { id: generateId(), ...data }] });
    }
    setSvcModal({ open: false, svc: null });
    showToast('Serviço salvo.', 'success');
  };
  const deleteSvc = (id: string) => {
    persist({ ...config, services: config.services.filter((s) => s.id !== id) });
    showToast('Serviço removido.', 'success');
  };

  /* ── Hosts ── */
  const openNewHost = () => {
    const envUrls: Record<string, string> = {};
    config.environments.forEach((e) => { envUrls[e.id] = ''; });
    setHostForm({ name: '', envUrls });
    setHostModal({ open: true, host: null });
  };
  const openEditHost = (host: ApiHost) => {
    const envUrls: Record<string, string> = {};
    config.environments.forEach((e) => { envUrls[e.id] = host.envUrls[e.id] ?? ''; });
    setHostForm({ name: host.name, envUrls });
    setHostModal({ open: true, host });
  };
  const saveHost = () => {
    if (!hostForm.name.trim()) return;
    const cleanUrls: Record<string, string> = {};
    Object.entries(hostForm.envUrls).forEach(([k, v]) => { if (v.trim()) cleanUrls[k] = v.trim(); });
    const data: Omit<ApiHost, 'id'> = { name: hostForm.name.trim(), envUrls: cleanUrls };
    if (hostModal.host) {
      persist({ ...config, hosts: config.hosts.map((h) => h.id === hostModal.host!.id ? { ...h, ...data } : h) });
    } else {
      persist({ ...config, hosts: [...config.hosts, { id: generateId(), ...data }] });
    }
    setHostModal({ open: false, host: null });
    showToast('Host salvo.', 'success');
  };
  const deleteHost = (id: string) => {
    persist({
      ...config,
      hosts: config.hosts.filter((h) => h.id !== id),
      endpoints: config.endpoints.filter((ep) => ep.hostId !== id),
    });
    showToast('Host removido.', 'success');
  };

  const handleParseCurl = () => {
    if (!curlInput.trim()) return;
    const { method, baseUrl, path, headers, body } = parseCurl(curlInput);

    // Auto-name: use last segment of path if name is still empty
    const autoName = (current: string) => {
      if (current.trim()) return current;
      const segments = path.split('/').filter(Boolean);
      return segments[segments.length - 1] || path || 'API';
    };

    setEpForm((f) => ({ ...f, method, path, body, name: autoName(f.name) }));
    setEpHeaderPairs(headers);

    const matched = config.hosts.find((h) =>
      Object.values(h.envUrls).some((u) => u.replace(/\/$/, '') === baseUrl.replace(/\/$/, ''))
    );
    if (matched) {
      setEpForm((f) => ({ ...f, method, path, body, name: autoName(f.name), hostId: matched.id }));
      showToast(`Host "${matched.name}" detectado automaticamente.`, 'success');
    }
  };

  /* ── Endpoints ── */
  const openNewEp = () => {
    const folder = folderSel === 'all' || folderSel === 'none' ? '' : folderSel;
    setEpForm({ ...EMPTY_ENDPOINT, hostId: config.hosts[0]?.id ?? '', folder });
    setEpHeaderPairs([]);
    setCurlInput('');
    setCurlOpen(false);
    setFolderCreating(false);
    setEpModal({ open: true, ep: null });
  };
  const openEditEp = (ep: ApiEndpoint) => {
    setEpForm({ name: ep.name, folder: ep.folder ?? '', hostId: ep.hostId, path: ep.path, method: ep.method, headers: ep.headers ?? {}, body: ep.body });
    setEpHeaderPairs(recordToKV(ep.headers ?? {}));
    setCurlInput('');
    setCurlOpen(false);
    setFolderCreating(false);
    setEpModal({ open: true, ep });
  };
  const saveEp = () => {
    if (!epForm.name.trim() || !epForm.hostId) return;
    const data = { ...epForm, headers: kvToRecord(epHeaderPairs) };
    if (epModal.ep) {
      persist({ ...config, endpoints: config.endpoints.map((ep) => ep.id === epModal.ep!.id ? { ...ep, ...data } : ep) });
    } else {
      persist({ ...config, endpoints: [...config.endpoints, { id: generateId(), ...data }] });
    }
    setEpModal({ open: false, ep: null });
    showToast('API salva.', 'success');
  };
  const deleteEp = (id: string) => {
    persist({ ...config, endpoints: config.endpoints.filter((ep) => ep.id !== id) });
    showToast('API removida.', 'success');
  };

  const hostById = (id: string) => config.hosts.find((h) => h.id === id);

  const moveEpAfter = (srcId: string, targetId: string) => {
    if (srcId === targetId) return;
    const eps = [...config.endpoints];
    const srcIdx = eps.findIndex((e) => e.id === srcId);
    const tgtIdx = eps.findIndex((e) => e.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = eps.splice(srcIdx, 1);
    const insertAt = srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1;
    eps.splice(insertAt, 0, moved);
    persist({ ...config, endpoints: eps });
  };

  const moveEpToFolder = (epId: string, folder: 'none' | string) => {
    persist({
      ...config,
      endpoints: config.endpoints.map((ep) =>
        ep.id === epId ? { ...ep, folder: folder === 'none' ? '' : folder } : ep
      ),
    });
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'envs', label: 'Ambientes', count: config.environments.length },
    { key: 'hosts', label: 'Hosts', count: config.hosts.length },
    { key: 'endpoints', label: 'APIs', count: config.endpoints.length },
    { key: 'services', label: 'Health Check', count: config.services.length },
  ];

  return (
    <ApisLayout title="Configuração" activeApi="config">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, alignItems: 'stretch', background: 'var(--surface-alt)', borderRadius: 10, padding: 4, border: '1px solid var(--divider)' }}>
        {TABS.map((t) => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: '7px 12px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: tab === t.key ? 600 : 400, background: tab === t.key ? 'var(--bg-card)' : 'transparent', color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,.15)' : 'none', transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span>{t.label}</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)', opacity: tab === t.key ? 1 : .7 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Ambientes ── */}
      {tab === 'envs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Ambientes</span>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Gerencia tokens e proxies por ambiente.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openNewEnv}>+ Novo</button>
          </div>
          {config.environments.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum ambiente cadastrado.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {config.environments.map((env) => {
              const open = !!expandedItems[env.id];
              return (
                <div key={env.id} style={{ border: '1px solid var(--divider)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <button type="button"
                    onClick={() => toggleExpand(env.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                    </svg>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{env.name}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {open && (
                    <div style={{ borderTop: '1px solid var(--divider)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-alt)' }}>
                      {env.proxyUrl && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--text-muted)', marginBottom: 4 }}>Proxy URL</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all' }}>
                            {env.proxyUrl}
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditEnv(env)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteEnv(env.id)}>Remover</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Hosts ── */}
      {tab === 'hosts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Hosts</span>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>URLs base por ambiente. APIs complementam com o caminho.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openNewHost}>+ Novo</button>
          </div>
          {config.hosts.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum host cadastrado.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {config.hosts.map((host) => {
              const open = !!expandedItems[host.id];
              const envCount = Object.values(host.envUrls).filter(Boolean).length;
              const epCount = config.endpoints.filter((ep) => ep.hostId === host.id).length;
              return (
                <div key={host.id} style={{ border: '1px solid var(--divider)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <button type="button"
                    onClick={() => toggleExpand(host.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                    </svg>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{host.name}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--surface-alt)', color: 'var(--text-muted)', marginRight: 2 }}>
                      {envCount} env
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                      {epCount} API{epCount !== 1 ? 's' : ''}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {open && (
                    <div style={{ borderTop: '1px solid var(--divider)', background: 'var(--surface-alt)' }}>
                      {config.environments.length > 0 ? (
                        <div>
                          {config.environments.map((env, i, arr) => {
                            const url = host.envUrls[env.id] ?? '';
                            return (
                              <div key={env.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', minWidth: 100, flexShrink: 0 }}>{env.name}</span>
                                <code style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: url ? 'var(--text-primary)' : 'var(--text-muted)', background: url ? 'var(--bg-card)' : 'transparent', border: url ? '1px solid var(--divider)' : 'none', borderRadius: 4, padding: url ? '3px 8px' : '3px 0', wordBreak: 'break-all' }}>
                                  {url || <em style={{ opacity: .4 }}>não configurado</em>}
                                </code>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>Cadastre ambientes para ver URLs.</p>
                      )}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--divider)' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditHost(host)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteHost(host.id)}>Remover</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Endpoints (APIs) ── */}
      {tab === 'endpoints' && (() => {
        const METHOD_COLOR: Record<string, string> = {
          GET: '#50fa7b', POST: '#ffb86c', PUT: '#8be9fd', PATCH: '#f1fa8c', DELETE: '#ff5555',
        };

        const folderRoots = buildFolderTree(config.endpoints, config.folders);
        const nfc = noFolderCount(config.endpoints);
        const filteredEps = filterByFolder(config.endpoints, folderSel);

        const viewEp = config.endpoints.find((ep) => ep.id === viewEpId) ?? null;

        return (
          <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 140px)', overflow: 'hidden' }}>

            {/* ── Sidebar de pastas ── */}
            <aside style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--divider)', overflowY: 'auto', padding: '0 0 12px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Todas
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({config.endpoints.length})</span>
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={openNewEp}
                  disabled={config.hosts.length === 0}
                  title={config.hosts.length === 0 ? 'Cadastre um host primeiro' : 'Nova API'}
                >
                  + Nova
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px 0' }}>
              <FolderTreeSidebar
                roots={folderRoots}
                totalCount={config.endpoints.length}
                noFolderCnt={nfc}
                selected={folderSel}
                onSelect={setFolderSel}
                dragOver={dragOverFolder}
                onFolderDragOver={(e, path) => { e.preventDefault(); setDragOverFolder(path); }}
                onFolderDrop={(path) => { if (dragEpId) { moveEpToFolder(dragEpId, path); setDragEpId(null); setDragOverFolder(null); } }}
                onFolderDragLeave={() => setDragOverFolder(null)}
                onCreateFolder={() => {
                  setFolderModalParent(folderSel === 'all' || folderSel === 'none' ? '' : folderSel);
                  setFolderModalName('');
                  setFolderModal(true);
                }}
                onDeleteFolder={(folderPath) => setDeletingFolder(folderPath)}
              />
              </div>
            </aside>

            {/* ── Lista de endpoints ── */}
            <div style={{ flex: '0 0 calc(40% - 200px)', minWidth: 200, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {folderSel === 'all' ? 'Todas' : folderSel === 'none' ? 'Sem pasta' : folderSel}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>({filteredEps.length})</span>
                </span>
                <button className="btn btn-primary btn-sm" onClick={openNewEp} disabled={config.hosts.length === 0}>+ Nova</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {config.hosts.length === 0 && (
                  <p style={{ padding: '20px 14px', color: 'var(--text-muted)', fontSize: 13 }}>Cadastre um host antes de criar APIs.</p>
                )}
                {filteredEps.length === 0 && config.hosts.length > 0 && (
                  <p style={{ padding: '20px 14px', color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma API nesta pasta.</p>
                )}
                {filteredEps.map((ep) => {
                  const host = hostById(ep.hostId);
                  const isSelected = ep.id === viewEpId;
                  const isDragOver = ep.id === dragOverEpId;
                  return (
                    <div
                      key={ep.id}
                      style={{ borderTop: isDragOver ? '2px solid var(--accent)' : '2px solid transparent' }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverEpId(ep.id); }}
                      onDrop={() => { if (dragEpId) { moveEpAfter(dragEpId, ep.id); setDragEpId(null); setDragOverEpId(null); } }}
                      onDragLeave={() => setDragOverEpId(null)}
                    >
                      <button
                        className={`ep-list-item${isSelected ? ' ep-selected' : ''}`}
                        draggable
                        onDragStart={() => setDragEpId(ep.id)}
                        onDragEnd={() => { setDragEpId(null); setDragOverEpId(null); }}
                        onClick={() => { selectEp(isSelected ? null : ep.id); setUrlsOpen(false); }}
                        style={{ cursor: 'grab', opacity: dragEpId === ep.id ? 0.45 : 1 }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: METHOD_COLOR[ep.method] ?? 'var(--text-muted)', minWidth: 46, flexShrink: 0 }}>
                          {ep.method}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {host?.name ?? '—'} · {ep.path}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <button title="Editar" onClick={() => openEditEp(ep)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button title="Remover" onClick={() => setDeletingEpId(ep.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ff5555')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Painel de detalhe ── */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              {!viewEp ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8, padding: 40 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.35}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
                  </svg>
                  <span style={{ fontSize: 13 }}>Clique em uma API para ver os detalhes</span>
                </div>
              ) : (() => {
                const runHost = config.hosts.find((h) => h.id === runHostId);
                const rawBase = (runHost?.envUrls[runEnvId] ?? '').replace(/\/$/, '');
                const previewUrl = (rawBase.match(/^https?:\/\//) ? rawBase : rawBase ? `https://${rawBase}` : '') + runPath;
                const hasBody = ['POST', 'PUT', 'PATCH'].includes(runMethod);

                const prettyRunBody = (() => {
                  if (!runResponse?.body) return '';
                  try { return JSON.stringify(JSON.parse(runResponse.body), null, 2); }
                  catch { return runResponse.body; }
                })();

                const dirty =
                  runMethod !== viewEp.method ||
                  runHostId !== viewEp.hostId ||
                  runPath !== viewEp.path ||
                  runBody !== (viewEp.body ?? '') ||
                  JSON.stringify(kvToRecord(runHeaders)) !== JSON.stringify(viewEp.headers ?? {});

                const saveRunChanges = () => {
                  persist({
                    ...config,
                    endpoints: config.endpoints.map((ep) =>
                      ep.id === viewEp.id
                        ? { ...ep, method: runMethod, hostId: runHostId, path: runPath, headers: kvToRecord(runHeaders), body: runBody }
                        : ep
                    ),
                  });
                  showToast('Alterações salvas.', 'success');
                };

                const urlValid = previewUrl.startsWith('http');

                const envColor = (name: string) => {
                  const n = name.toLowerCase();
                  if (n.includes('prod')) return { bg: 'rgba(255,85,85,.18)', border: '#ff5555', text: '#ff5555' };
                  if (n.includes('stg') || n.includes('staging')) return { bg: 'rgba(189,147,249,.18)', border: '#bd93f9', text: '#bd93f9' };
                  if (n.includes('qa')) return { bg: 'rgba(241,250,140,.18)', border: '#f1fa8c', text: '#c8a800' };
                  if (n.includes('tst') || n.includes('test') || n.includes('azul')) return { bg: 'rgba(255,184,108,.18)', border: '#ffb86c', text: '#e07b00' };
                  if (n.includes('dev')) return { bg: 'rgba(139,233,253,.18)', border: '#8be9fd', text: '#0097b2' };
                  return { bg: 'rgba(80,250,123,.18)', border: '#50fa7b', text: '#1a8a3d' };
                };
                const selEnv = config.environments.find((e) => e.id === runEnvId);
                const eColor = selEnv ? envColor(selEnv.name) : { bg: 'var(--surface-alt)', border: 'var(--divider)', text: 'var(--text-muted)' };

                const discardChanges = () => {
                  setRunMethod(viewEp.method);
                  setRunHostId(viewEp.hostId);
                  setRunPath(viewEp.path);
                  setRunHeaders(recordToKV(viewEp.headers ?? {}));
                  const rb = viewEp.body ?? '';
                  try { setRunBody(JSON.stringify(JSON.parse(rb), null, 2)); } catch { setRunBody(rb); }
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', overflowY: 'auto' }}>

                    {/* ── Nome + pasta + ambiente + save ── */}
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
                        onChange={(e) => { setRunEnvId(e.target.value); setRunResponse(null); }}
                      >
                        {config.environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                      {dirty && <button className="btn btn-primary btn-sm" onClick={saveRunChanges} style={{ flexShrink: 0, fontSize: 11 }}>Salvar</button>}
                      {dirty && <button className="btn btn-ghost btn-sm" onClick={discardChanges} style={{ flexShrink: 0, fontSize: 11 }}>Descartar</button>}
                    </div>

                    {/* ── Barra de execução (topo, estilo Postman) ── */}
                    <div style={{ flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--divider)', background: 'var(--surface-alt)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {/* [Método] [Host] [Path] | [Ambiente / Executar] */}
                      <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                        <select
                          className="input"
                          style={{ width: 76, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: METHOD_COLOR[runMethod], flexShrink: 0, padding: '3px 4px', alignSelf: 'center' }}
                          value={runMethod}
                          onChange={(e) => setRunMethod(e.target.value as ApiEndpoint['method'])}
                        >
                          {(['GET','POST','PUT','PATCH','DELETE'] as const).map((m) => (
                            <option key={m} value={m} style={{ color: METHOD_COLOR[m] }}>{m}</option>
                          ))}
                        </select>
                        <select
                          className="input"
                          style={{ width: 90, fontSize: 10, flexShrink: 0, padding: '3px 4px', alignSelf: 'center' }}
                          value={runHostId}
                          onChange={(e) => setRunHostId(e.target.value)}
                        >
                          <option value="">Sem host</option>
                          {config.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                        </select>
                        <input
                          style={{ flex: 1, fontFamily: 'monospace', fontSize: 10, minWidth: 0, padding: '3px 7px', background: 'var(--bg-card)', border: `1px solid ${urlValid ? 'var(--divider)' : 'var(--error,#ef4444)'}`, borderRadius: 6, outline: 'none', color: 'var(--text-primary)', alignSelf: 'center' }}
                          value={runPath}
                          placeholder="/api/v1/recurso"
                          onChange={(e) => setRunPath(e.target.value)}
                        />
                        <button
                          style={{ flexShrink: 0, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', cursor: urlValid && !runLoading ? 'pointer' : 'not-allowed', background: urlValid && !runLoading ? 'var(--accent)' : 'var(--surface-alt)', color: urlValid && !runLoading ? '#fff' : 'var(--text-muted)', opacity: runLoading ? .6 : 1, transition: 'background .15s', alignSelf: 'center' }}
                          disabled={runLoading || !urlValid}
                          onClick={executeInline}
                          title="Executar"
                        >
                          {runLoading
                            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                          }
                        </button>
                      </div>
                    </div>

                    {/* ── Conteúdo: headers + body + response ── */}
                    <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Headers — colapsável */}
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

                      {/* Body editável */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div className="detail-label" style={{ margin: 0 }}>Body</div>
                          {hasBody && (
                            <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                              onClick={() => { try { setRunBody(JSON.stringify(JSON.parse(runBody), null, 2)); } catch { /* ignore */ } }}
                              disabled={!runBody.trim()}>
                              Beautify
                            </button>
                          )}
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

                      {/* ── Response ── */}
                      {runLoading && (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aguardando resposta...</div>
                      )}
                      {runResponse && (
                        <div style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'var(--surface-alt)', borderBottom: '1px solid var(--divider)', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14, color: runResponse.ok ? '#50fa7b' : '#ff5555' }}>
                              {runResponse.status || 'ERR'}
                            </span>
                            <span style={{ fontSize: 12, color: runResponse.ok ? '#50fa7b' : '#ff5555', fontWeight: 600 }}>{runResponse.ok ? 'OK' : 'Erro'}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{runResponse.elapsed} ms</span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                              {(['body', 'headers'] as const).map((t) => (
                                <button key={t} onClick={() => setRunResTab(t)}
                                  style={{ fontSize: 11, padding: '3px 10px', border: 'none', borderRadius: 4, cursor: 'pointer', background: runResTab === t ? 'var(--accent)' : 'transparent', color: runResTab === t ? '#fff' : 'var(--text-muted)', fontWeight: runResTab === t ? 600 : 400 }}>
                                  {t === 'body' ? 'Body' : `Headers (${Object.keys(runResponse.resHeaders).length})`}
                                </button>
                              ))}
                              <button onClick={() => navigator.clipboard.writeText(runResTab === 'body' ? prettyRunBody : JSON.stringify(runResponse.resHeaders, null, 2)).then(() => showToast('Copiado!', 'success'))}
                                className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                                Copiar
                              </button>
                            </div>
                          </div>
                          <div style={{ background: '#1e1e2e', maxHeight: 420, overflow: 'auto' }}>
                            {runResTab === 'body' ? (
                              <pre style={{ margin: 0, padding: 14, fontFamily: '"Fira Code", monospace', fontSize: 12, lineHeight: 1.6, color: '#cdd6f4' }}
                                dangerouslySetInnerHTML={{ __html: (() => { try { return Prism.highlight(prettyRunBody, Prism.languages.json, 'json'); } catch { return prettyRunBody || '<em style="opacity:.4">Sem conteúdo</em>'; } })() }} />
                            ) : (
                              <div>
                                {Object.entries(runResponse.resHeaders).map(([k, v]) => (
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
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* ── Tab: Serviços (Health Check) ── */}
      {tab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Health Check</span>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Serviços monitorados na tela de Health Check.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openNewSvc}>+ Novo</button>
          </div>
          {config.services.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum serviço cadastrado.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {config.services.map((svc) => {
              const open = !!expandedItems[svc.id];
              const envCount = Object.values(svc.envUrls).filter(Boolean).length;
              const SVC_COLOR: Record<string, string> = { GET: '#50fa7b', POST: '#ffb86c' };
              return (
                <div key={svc.id} style={{ border: '1px solid var(--divider)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <button type="button"
                    onClick={() => toggleExpand(svc.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#50fa7b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{svc.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: SVC_COLOR[svc.method] ?? 'var(--text-muted)', background: 'var(--surface-alt)', padding: '2px 7px', borderRadius: 4 }}>
                      {svc.method}
                    </span>
                    <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {svc.healthPath}
                    </code>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                      {envCount} env
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {open && (
                    <div style={{ borderTop: '1px solid var(--divider)', background: 'var(--surface-alt)' }}>
                      {/* Caminho */}
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--text-muted)', marginBottom: 4 }}>Caminho health</div>
                        <code style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)' }}>{svc.healthPath || <em style={{ opacity: .4 }}>não definido</em>}</code>
                      </div>
                      {/* URLs por ambiente */}
                      {config.environments.length > 0 && (
                        <div style={{ borderBottom: '1px solid var(--divider)' }}>
                          {config.environments.map((env, i, arr) => {
                            const url = svc.envUrls[env.id] ?? '';
                            return (
                              <div key={env.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', minWidth: 100, flexShrink: 0 }}>{env.name}</span>
                                <code style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: url ? 'var(--text-primary)' : 'var(--text-muted)', background: url ? 'var(--bg-card)' : 'transparent', border: url ? '1px solid var(--divider)' : 'none', borderRadius: 4, padding: url ? '3px 8px' : '3px 0', wordBreak: 'break-all' }}>
                                  {url ? `${url}${svc.healthPath}` : <em style={{ opacity: .4 }}>não configurado</em>}
                                </code>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Headers */}
                      {Object.keys(svc.headers ?? {}).length > 0 && (
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--divider)' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--text-muted)', marginBottom: 6 }}>Headers ({Object.keys(svc.headers).length})</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {Object.entries(svc.headers).map(([k, v]) => (
                              <div key={k} style={{ display: 'flex', gap: 8, fontFamily: 'monospace', fontSize: 11 }}>
                                <span style={{ color: 'var(--accent)', minWidth: 140 }}>{k}</span>
                                <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: '10px 16px' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditSvc(svc)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteSvc(svc.id)}>Remover</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal — Ambiente */}
      {envModal.open && (
        <Modal
          title={envModal.env ? 'Editar Ambiente' : 'Novo Ambiente'}
          onClose={() => setEnvModal({ open: false, env: null })}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEnvModal({ open: false, env: null })}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEnv} disabled={!envForm.name.trim()}>Salvar</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label>Nome</label>
              <input className="input" placeholder="ex: QA K8S" value={envForm.name} onChange={(e) => setEnvForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal — Host */}
      {hostModal.open && (
        <Modal
          title={hostModal.host ? 'Editar Host' : 'Novo Host'}
          onClose={() => setHostModal({ open: false, host: null })}
          large
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setHostModal({ open: false, host: null })}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveHost} disabled={!hostForm.name.trim()}>Salvar</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label>Nome do host</label>
              <input className="input" placeholder="ex: Accounting" value={hostForm.name} onChange={(e) => setHostForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>URL base por ambiente</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {config.environments.map((env) => (
                  <div key={env.id} className="form-row" style={{ alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 130, flexShrink: 0 }}>{env.name}</span>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={hostForm.envUrls[env.id] ?? ''}
                      onChange={(e) => setHostForm((f) => ({ ...f, envUrls: { ...f.envUrls, [env.id]: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal — Endpoint (API) */}
      {epModal.open && (
        <Modal
          title={epModal.ep ? 'Editar API' : 'Nova API'}
          onClose={() => setEpModal({ open: false, ep: null })}
          large
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEpModal({ open: false, ep: null })}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEp} disabled={!epForm.name.trim() || !epForm.hostId}>Salvar</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* cURL import */}
            <div style={{ background: 'var(--surface-2, var(--bg-card))', border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                type="button"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}
                onClick={() => setCurlOpen((o) => !o)}
              >
                <span style={{ fontSize: 14 }}>{curlOpen ? '▾' : '▸'}</span>
                Importar via cURL
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>preenche os campos automaticamente</span>
              </button>
              {curlOpen && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder={`curl -X POST 'https://api.exemplo.com/v1/recurso' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"chave":"valor"}'`}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
                    value={curlInput}
                    onChange={(e) => setCurlInput(e.target.value)}
                  />

                  <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={handleParseCurl} disabled={!curlInput.trim()}>
                    Analisar cURL
                  </button>
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Nome da API</label>
                <input className="input" placeholder="ex: Buscar voos" value={epForm.name} onChange={(e) => setEpForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Pasta</label>
                {(() => {
                  const isExisting = allFolderPaths.includes(epForm.folder ?? '');
                  const showNew = folderCreating || (!isExisting && !!(epForm.folder ?? '').trim());
                  return (
                    <>
                      {!showNew ? (
                        <select
                          className="input"
                          value={epForm.folder ?? ''}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              setFolderCreating(true);
                              setEpForm((f) => ({ ...f, folder: '' }));
                            } else {
                              setEpForm((f) => ({ ...f, folder: e.target.value }));
                            }
                          }}
                        >
                          <option value="">Sem pasta</option>
                          {allFolderPaths.map((p) => <option key={p} value={p}>{p}</option>)}
                          <option value="__new__">+ Nova pasta...</option>
                        </select>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            className="input"
                            autoFocus
                            placeholder="ex: Sell ou Sell/Location"
                            value={epForm.folder ?? ''}
                            onChange={(e) => setEpForm((f) => ({ ...f, folder: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ flexShrink: 0 }}
                            onClick={() => { setFolderCreating(false); setEpForm((f) => ({ ...f, folder: '' })); }}
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {showNew && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                          Use / para sub-pasta — ex: <code style={{ fontSize: 10 }}>Sell/Location</code>
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Host</label>
                <select className="input" value={epForm.hostId} onChange={(e) => setEpForm((f) => ({ ...f, hostId: e.target.value }))}>
                  <option value="">Selecione um host...</option>
                  {config.hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 110 }}>
                <label>Método</label>
                <select className="input" value={epForm.method} onChange={(e) => setEpForm((f) => ({ ...f, method: e.target.value as ApiEndpoint['method'] }))}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Caminho</label>
              <input className="input" placeholder="/api/v1/recurso" value={epForm.path} onChange={(e) => setEpForm((f) => ({ ...f, path: e.target.value }))} />
              {epForm.hostId && hostById(epForm.hostId) && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Ex. prod: {(hostById(epForm.hostId)?.envUrls['prod'] ?? '…')}{epForm.path}
                </p>
              )}
            </div>

            {/* Headers */}
            <div className="form-group" style={{ borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Headers</label>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                  onClick={() => setEpHeaderPairs((p) => [...p, { key: '', value: '' }])}>
                  + Adicionar
                </button>
              </div>
              {epHeaderPairs.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Nenhum header configurado.</p>
              )}
              {epHeaderPairs.map((pair, i) => (
                <div key={i} className="form-row" style={{ gap: 6, marginBottom: 4 }}>
                  <input className="input" placeholder="Chave" value={pair.key}
                    onChange={(e) => setEpHeaderPairs((p) => p.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                  <input className="input" placeholder="Valor" value={pair.value}
                    onChange={(e) => setEpHeaderPairs((p) => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <button type="button" className="btn btn-danger btn-sm" style={{ flexShrink: 0 }}
                    onClick={() => setEpHeaderPairs((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>

            {/* Body */}
            <JsonBodyField value={epForm.body} onChange={(v) => setEpForm((f) => ({ ...f, body: v }))} />
          </div>
        </Modal>
      )}

      {/* Modal — Serviço (Health Check) */}
      {svcModal.open && (
        <Modal
          title={svcModal.svc ? 'Editar Serviço' : 'Novo Serviço'}
          onClose={() => setSvcModal({ open: false, svc: null })}
          large
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setSvcModal({ open: false, svc: null })}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveSvc} disabled={!svcForm.name.trim()}>Salvar</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Nome</label>
                <input className="input" placeholder="ex: Accounting" value={svcForm.name} onChange={(e) => setSvcForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ maxWidth: 120 }}>
                <label>Método</label>
                <select className="input" value={svcForm.method} onChange={(e) => setSvcForm((f) => ({ ...f, method: e.target.value as 'GET' | 'POST' }))}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Caminho do endpoint</label>
              <input className="input" placeholder="/HealthCheck" value={svcForm.healthPath} onChange={(e) => setSvcForm((f) => ({ ...f, healthPath: e.target.value }))} />
            </div>
            <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>URLs por ambiente</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {config.environments.map((env) => (
                  <div key={env.id} className="form-row" style={{ alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 130, flexShrink: 0 }}>{env.name}</span>
                    <input className="input" placeholder="https://..." value={svcForm.envUrls[env.id] ?? ''}
                      onChange={(e) => setSvcForm((f) => ({ ...f, envUrls: { ...f.envUrls, [env.id]: e.target.value } }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Headers</label>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                  onClick={() => setSvcHeaderPairs((p) => [...p, { key: '', value: '' }])}>
                  + Adicionar
                </button>
              </div>
              {svcHeaderPairs.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Nenhum header configurado.</p>
              )}
              {svcHeaderPairs.map((pair, i) => (
                <div key={i} className="form-row" style={{ gap: 6, marginBottom: 4 }}>
                  <input className="input" placeholder="Chave" value={pair.key}
                    onChange={(e) => setSvcHeaderPairs((p) => p.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                  <input className="input" placeholder="Valor" value={pair.value}
                    onChange={(e) => setSvcHeaderPairs((p) => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <button type="button" className="btn btn-danger btn-sm" style={{ flexShrink: 0 }}
                    onClick={() => setSvcHeaderPairs((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <JsonBodyField value={svcForm.body} onChange={(v) => setSvcForm((f) => ({ ...f, body: v }))} />
          </div>
        </Modal>
      )}
      {/* Modal — Nova Pasta */}
      {folderModal && (() => {
        const fullPath = folderModalParent
          ? `${folderModalParent}/${folderModalName.trim()}`
          : folderModalName.trim();
        const valid = folderModalName.trim().length > 0;
        const confirmFolder = () => {
          if (!valid) return;
          // Persiste a pasta mesmo sem endpoints
          if (!config.folders.includes(fullPath)) {
            persist({ ...config, folders: [...config.folders, fullPath] });
          }
          setFolderSel(fullPath);
          setFolderModal(false);
          showToast(`Pasta "${fullPath}" criada.`, 'success');
        };
        const folderRootsModal = buildFolderTree(config.endpoints, config.folders);

        function FolderPickerNode({ node, depth }: { node: typeof folderRootsModal[0]; depth: number }) {
          const [open, setOpen] = useState(true);
          const isSelected = folderModalParent === node.fullPath;
          return (
            <div>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: `5px 8px 5px ${10 + depth * 16}px`,
                  borderRadius: 6, cursor: 'pointer',
                  background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                {node.children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
                ) : (
                  <span style={{ width: 11, flexShrink: 0 }} />
                )}
                <button
                  type="button"
                  onClick={() => setFolderModalParent(isSelected ? '' : node.fullPath)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, padding: 0, color: isSelected ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isSelected ? 600 : 400 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.segment}</span>
                </button>
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              {open && node.children.map((child) => (
                <FolderPickerNode key={child.fullPath} node={child} depth={depth + 1} />
              ))}
            </div>
          );
        }

        return (
          <Modal
            title="Nova pasta"
            onClose={() => setFolderModal(false)}
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => setFolderModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={confirmFolder} disabled={!valid}>Criar pasta</button>
              </>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Localização na árvore */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Onde criar — opcional</label>
                <div style={{ border: '1px solid var(--divider)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  {/* Raiz */}
                  <button
                    type="button"
                    onClick={() => setFolderModalParent('')}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 12px', background: folderModalParent === '' ? 'var(--accent-subtle)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--divider)', cursor: 'pointer',
                      color: folderModalParent === '' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: folderModalParent === '' ? 600 : 400, fontSize: 13,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Raiz (pasta principal)
                    {folderModalParent === '' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 'auto' }}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                  {/* Árvore */}
                  {folderRootsModal.length > 0 && (
                    <div style={{ padding: '6px 6px', maxHeight: 220, overflowY: 'auto' }}>
                      {folderRootsModal.map((node) => (
                        <FolderPickerNode key={node.fullPath} node={node} depth={0} />
                      ))}
                    </div>
                  )}
                  {folderRootsModal.length === 0 && (
                    <p style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
                      Nenhuma pasta criada ainda.
                    </p>
                  )}
                </div>
              </div>

              {/* Nome */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Nome da pasta *</label>
                <input
                  className="input"
                  autoFocus
                  placeholder="ex: Location, Auth, v2..."
                  value={folderModalName}
                  onChange={(e) => setFolderModalName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmFolder(); }}
                />
              </div>

              {/* Preview */}
              {valid && (
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--divider)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Caminho:</span>
                  <code style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace' }}>{fullPath}</code>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}
      {/* ── Modal: confirmar exclusão de endpoint ── */}
      {deletingEpId && (() => {
        const ep = config.endpoints.find((e) => e.id === deletingEpId);
        if (!ep) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setDeletingEpId(null)}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12, padding: '24px 28px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: 'rgba(255,85,85,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff5555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Excluir API</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Tem certeza que deseja excluir <strong style={{ color: 'var(--text-primary)' }}>"{ep.name}"</strong>? Esta ação não pode ser desfeita.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setDeletingEpId(null)}>Cancelar</button>
                <button className="btn btn-danger" onClick={() => {
                  deleteEp(deletingEpId);
                  if (viewEpId === deletingEpId) selectEp(null);
                  setDeletingEpId(null);
                  showToast(`API "${ep.name}" excluída.`, 'success');
                }}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal: confirmar exclusão de pasta ── */}
      {deletingFolder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setDeletingFolder(null)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)', borderRadius: 12, padding: '24px 28px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, background: 'rgba(255,85,85,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff5555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Excluir pasta</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Tem certeza que deseja excluir <strong style={{ color: 'var(--text-primary)' }}>"{deletingFolder.split('/').pop()}"</strong>?
                  {config.endpoints.some((ep) => ep.folder === deletingFolder || ep.folder?.startsWith(deletingFolder + '/')) && (
                    <span> As APIs dentro dela ficarão sem pasta.</span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeletingFolder(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => {
                const folderPath = deletingFolder;
                const filtered = config.folders.filter((f) => f !== folderPath && !f.startsWith(folderPath + '/'));
                const ancestors = folderPath.split('/').slice(0, -1).reduce<string[]>((acc, seg) => {
                  acc.push(acc.length ? `${acc[acc.length - 1]}/${seg}` : seg);
                  return acc;
                }, []);
                persist({
                  ...config,
                  folders: [...new Set([...filtered, ...ancestors.filter((a) => !filtered.includes(a))])],
                  endpoints: config.endpoints.map((ep) =>
                    ep.folder === folderPath || ep.folder?.startsWith(folderPath + '/')
                      ? { ...ep, folder: '' }
                      : ep
                  ),
                });
                if (folderSel === folderPath || folderSel.startsWith(folderPath + '/')) setFolderSel('all');
                showToast(`Pasta "${folderPath.split('/').pop()}" excluída.`, 'success');
                setDeletingFolder(null);
              }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </ApisLayout>
  );
}
