/* ═══════════════════════════════════════════════════════════
   useReport — estado do relatório + autosave (porta do state/
   triggerAutoSave/createEmptyReport de app.js).

   Se `sessionId` for informado, o relatório passa a viver numa
   SESSÃO COMPARTILHADA do Supabase: carrega do banco, sincroniza
   em tempo real (edições de outros participantes) e persiste as
   mudanças locais (com upload de imagens) em vez do localStorage.
   ═══════════════════════════════════════════════════════════ */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createEmptyReport, debounce, generateId } from '../lib/utils';
import { loadCurrentReport, saveCurrentReport, hydrateTemplateSnapshotImages } from '../lib/storage';
import { currentUser } from '../lib/auth';
import {
  joinPresence,
  loadReportSession,
  pushReportSession,
  subscribeReportSession,
  type SessionParticipant,
  type SessionSavedEvent,
} from '../lib/reportSession';
import type { Report } from '../types';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Funde apenas as URLs de imagem já materializadas (base64 → URL pública) de
 * `uploaded` dentro do estado atual `current`, preservando quaisquer edições
 * feitas durante o upload. Evita que o retorno assíncrono do push sobrescreva
 * texto/critérios alterados no meio-tempo.
 */
function mergeImageUrls(current: Report, uploaded: Report): Report {
  const next = deepClone(current);
  if (next.company?.logoUrl?.startsWith('data:') && !uploaded.company?.logoUrl?.startsWith('data:')) {
    next.company.logoUrl = uploaded.company.logoUrl;
  }
  const urlById = new Map<string, string>();
  for (const crit of uploaded.criteria || []) {
    for (const img of crit.images || []) {
      if (img.dataUrl && !img.dataUrl.startsWith('data:')) urlById.set(img.id, img.dataUrl);
    }
  }
  for (const crit of next.criteria || []) {
    for (const img of crit.images || []) {
      const url = urlById.get(img.id);
      if (url && img.dataUrl?.startsWith('data:')) {
        img.dataUrl = url;
        delete img.cacheKey;
      }
    }
  }
  return next;
}

function initReport(): Report {
  const params = new URLSearchParams(location.search);
  if (params.get('new') === '1') {
    // Remove ?new=1 via URL completa para não deixar resíduo no location.search.
    try {
      const url = new URL(location.href);
      url.searchParams.delete('new');
      history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    } catch { /* no-op */ }
    const r = createEmptyReport();
    saveCurrentReport(r);
    return r;
  }
  const saved = loadCurrentReport();
  if (saved && (saved.story?.id || saved.story?.title || (saved.criteria?.length ?? 0) > 0)) {
    return saved;
  }
  return createEmptyReport();
}

export interface UseReportResult {
  report: Report;
  setReport: Dispatch<SetStateAction<Report>>;
  patch: (fn: (draft: Report) => void) => void;
  replaceReport: (r: Report) => void;
  saveNow: () => void;
  saveState: 'saved' | 'saving';
  generateId: () => string;
  /** Modo sessão compartilhada. */
  session: {
    active: boolean;
    loading: boolean;
    notFound: boolean;
    ownerId: string | null;
    ownerName: string | null;
    isOwner: boolean;
    participants: SessionParticipant[];
    /** Transmite aos demais participantes que o relatório foi salvo. */
    notifySaved: (event: SessionSavedEvent) => void;
    /** Último aviso de "salvou" recebido de outro participante. */
    savedEvent: (SessionSavedEvent & { ts: number }) | null;
  };
}

export function useReport(sessionId?: string | null): UseReportResult {
  const shared = Boolean(sessionId);

  const [report, setReport] = useState<Report>(() => (shared ? createEmptyReport() : initReport()));
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [loading, setLoading] = useState<boolean>(shared);
  const [notFound, setNotFound] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [savedEvent, setSavedEvent] = useState<(SessionSavedEvent & { ts: number }) | null>(null);
  const notifySavedRef = useRef<(event: SessionSavedEvent) => void>(() => {});

  const firstRender = useRef(true);
  // Em modo sessão: controla revisões e evita "eco" das próprias gravações.
  const revRef = useRef(0);
  const echoRevRef = useRef(-1);
  const skipPushRef = useRef(false);
  // Modo local: pula o autosave disparado logo após a reidratação de imagens
  // (evita regravar o base64 grande no localStorage e estourar a cota).
  const skipLocalSaveRef = useRef(false);

  /* ── Autosave local (modo padrão) ── */
  const debouncedSaveLocal = useMemo(
    () =>
      debounce((r: Report) => {
        saveCurrentReport(r);
        setSaveState('saved');
      }, 1500),
    [],
  );

  /* ── Push para a sessão compartilhada (modo sessão) ── */
  const debouncedPushRemote = useMemo(
    () =>
      debounce(async (r: Report) => {
        const user = currentUser();
        if (!user || !sessionId) return;
        const result = await pushReportSession(sessionId, r, user, revRef.current);
        if (!result) {
          setSaveState('saved');
          return;
        }
        revRef.current = result.rev;
        echoRevRef.current = result.rev;
        // Troca só as imagens base64→URL no estado ATUAL, preservando edições
        // feitas durante o upload (sem disparar novo push).
        skipPushRef.current = true;
        setReport((prev) => mergeImageUrls(prev, result.report));
        setSaveState('saved');
      }, 1200),
    [sessionId],
  );

  /* ── Carrega a sessão + assina realtime e presença ── */
  useEffect(() => {
    if (!shared || !sessionId) return;
    let cancelled = false;

    (async () => {
      const data = await loadReportSession(sessionId);
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      revRef.current = data.rev;
      skipPushRef.current = true;
      setReport(data.report);
      setOwnerId(data.ownerId);
      setOwnerName(data.ownerName);
      setLoading(false);
      firstRender.current = false;
    })();

    const unsubData = subscribeReportSession(sessionId, (data) => {
      // Ignora o eco da própria gravação e revisões antigas.
      if (data.rev === echoRevRef.current || data.rev <= revRef.current) return;
      revRef.current = data.rev;
      skipPushRef.current = true;
      setReport(data.report);
    });

    const user = currentUser();
    let unsubPresence = () => {};
    if (user) {
      const presence = joinPresence(
        sessionId,
        user,
        (list) => setParticipants(list),
        (event) => setSavedEvent({ ...event, ts: Date.now() }),
      );
      notifySavedRef.current = presence.notifySaved;
      unsubPresence = presence.unsubscribe;
    }

    return () => {
      cancelled = true;
      notifySavedRef.current = () => {};
      unsubData();
      unsubPresence();
    };
  }, [shared, sessionId]);

  /* ── Persistência ao mudar o relatório ── */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Mudança originada de um update remoto → não re-persistir.
    if (skipPushRef.current) {
      skipPushRef.current = false;
      return;
    }
    if (shared) {
      if (loading) return;
      setSaveState('saving');
      debouncedPushRemote(report);
    } else {
      if (skipLocalSaveRef.current) {
        skipLocalSaveRef.current = false;
        return;
      }
      setSaveState('saving');
      debouncedSaveLocal(report);
    }
  }, [report, shared, loading, debouncedSaveLocal, debouncedPushRemote]);

  /* ── Reidrata imagens vindas do cache (modo local) ──
     O relatório salvo no localStorage guarda só o `cacheKey` das imagens
     (base64 fica no IndexedDB p/ não estourar a cota). Ao abrir a tela,
     converte cacheKey → base64 para exibir e exportar em PDF. */
  useEffect(() => {
    if (shared) return;
    let cancelled = false;
    const needsHydration = (report.criteria || []).some((c) =>
      (c.images || []).some((img) => img.cacheKey && !(img.dataUrl && img.dataUrl.trim())),
    );
    if (!needsHydration) return;
    (async () => {
      const hydrated = await hydrateTemplateSnapshotImages(report);
      if (cancelled) return;
      skipLocalSaveRef.current = true; // não regrava o base64 no localStorage
      setReport(hydrated);
    })();
    return () => { cancelled = true; };
    // Executa só uma vez, no carregamento inicial do relatório local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Aplica uma mutação imperativa sobre um clone do relatório. */
  const patch = useCallback((fn: (draft: Report) => void) => {
    setReport((prev) => {
      const draft = deepClone(prev);
      fn(draft);
      draft.updatedAt = new Date().toISOString();
      return draft;
    });
  }, []);

  /** Substitui o relatório inteiro e persiste imediatamente. */
  const replaceReport = useCallback(
    (r: Report) => {
      setReport(r);
      if (shared) {
        debouncedPushRemote(r);
      } else {
        saveCurrentReport(r);
      }
    },
    [shared, debouncedPushRemote],
  );

  /** Salva imediatamente (Ctrl+S). */
  const saveNow = useCallback(() => {
    if (shared) {
      debouncedPushRemote(report);
    } else {
      saveCurrentReport(report);
      setSaveState('saved');
    }
  }, [report, shared, debouncedPushRemote]);

  const user = currentUser();
  return {
    report,
    setReport,
    patch,
    replaceReport,
    saveNow,
    saveState,
    generateId,
    session: {
      active: shared,
      loading,
      notFound,
      ownerId,
      ownerName,
      isOwner: Boolean(user && ownerId && user.id === ownerId),
      participants,
      notifySaved: (event: SessionSavedEvent) => notifySavedRef.current(event),
      savedEvent,
    },
  };
}
