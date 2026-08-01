import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { setAccessToken, setUnauthorizedHandler } from '@/lib/api-client';

import * as authApi from './api';
import { AuthContext, type AuthStatus } from './context';
import type { AuthUser } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  // O refresh token é de uso único (rotação a cada chamada), então o boot
  // abaixo não pode disparar duas vezes: em StrictMode (dev) o React
  // invoca o efeito de montagem duas vezes, e a segunda chamada usaria um
  // cookie já revogado pela primeira, derrubando a sessão que acabou de
  // funcionar. O ref garante uma única tentativa por ciclo de vida do app.
  const hasAttemptedBootRefresh = useRef(false);

  const applySession = useCallback((token: string, sessionUser: AuthUser) => {
    setAccessToken(token);
    setUser(sessionUser);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Interceptor do api-client: quando uma chamada autenticada leva 401 (access
  // token expirado em pleno uso), tenta um refresh silencioso via cookie e
  // devolve o novo token para a chamada original ser repetida uma vez.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      try {
        const session = await authApi.refresh();
        applySession(session.accessToken, session.user);
        return session.accessToken;
      } catch {
        clearSession();
        return null;
      }
    });

    return () => setUnauthorizedHandler(null);
  }, [applySession, clearSession]);

  // Loading inicial: o access token só vive em memória (nunca em
  // localStorage), então some a cada reload. No boot, tenta restaurar a
  // sessão a partir do cookie httpOnly do refresh token antes de decidir se
  // o usuário está autenticado ou não.
  useEffect(() => {
    if (hasAttemptedBootRefresh.current) return;
    hasAttemptedBootRefresh.current = true;

    authApi
      .refresh()
      .then((session) => applySession(session.accessToken, session.user))
      .catch(() => clearSession());
  }, [applySession, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await authApi.login(email, password);
      applySession(session.accessToken, session.user);
    },
    [applySession],
  );

  const signup = useCallback(
    async (input: authApi.SignupInput) => {
      const session = await authApi.signup(input);
      applySession(session.accessToken, session.user);
    },
    [applySession],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const session = await authApi.changePassword(currentPassword, newPassword);
      // A resposta já traz a sessão nova (sem `mustChangePassword`), então o
      // app destrava na mesma hora, sem novo login.
      applySession(session.accessToken, session.user);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  // Sem useMemo aqui, esse objeto seria recriado a cada render do provider
  // (mesmo quando status/user/login/logout não mudam) e re-renderizaria todo
  // consumidor de useAuth() — o que é praticamente a árvore inteira, já que
  // este provider envolve o RouterProvider por completo.
  const value = useMemo(
    () => ({ status, user, login, signup, changePassword, logout }),
    [status, user, login, signup, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
