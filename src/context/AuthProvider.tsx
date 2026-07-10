/* ═══════════════════════════════════════════════════════════
   AuthProvider — sessão reativa em cima de lib/auth.
   ═══════════════════════════════════════════════════════════ */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Auth } from '../lib/auth';
import type { Session } from '../types';

interface AuthContextValue {
  session: Session | null;
  login: (login: string, senha: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => Auth.currentUser());

  useEffect(() => {
    let active = true;
    (async () => {
      await Auth.init();
      if (active) setSession(Auth.currentUser());
    })();
    return () => { active = false; };
  }, []);

  // auto-logout quando o token de 8h expira + revalida ao voltar o foco
  useEffect(() => {
    if (!session) return;
    const ms = session.expiresAt - Date.now();
    const timer = window.setTimeout(() => { Auth.logout(); setSession(null); }, Math.max(0, ms));
    const recheck = () => { if (!Auth.isAuthenticated()) setSession(null); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [session]);

  const login = useCallback(async (loginName: string, senha: string) => {
    const result = await Auth.login(loginName, senha);
    if (result.ok) setSession(Auth.currentUser());
    return result;
  }, []);

  const logout = useCallback(() => {
    Auth.logout();
    setSession(null);
  }, []);

  const refresh = useCallback(() => setSession(Auth.currentUser()), []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, login, logout, refresh }),
    [session, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
