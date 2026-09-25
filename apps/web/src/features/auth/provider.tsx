import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PAYMENT_PENDING_CODE } from '@/config/billing-notice';
import { ApiError, setAccessToken, setUnauthorizedHandler } from '@/lib/api-client';

import * as authApi from './api';
import { AuthContext, type AuthStatus } from './context';
import type { AuthUser } from './types';

/// Atalho de desenvolvimento: entrar no site LOCAL sem digitar senha.
///
/// Só liga no servidor de dev (`import.meta.env.DEV`, sempre `false` em
/// `vite build` — o código nem entra no bundle publicado) E com a flag opt-in
/// `VITE_DEV_AUTH_BYPASS=true` no `.env.local`. Sem sessão no boot, o site
/// pede à API local uma sessão de verdade (`POST /auth/dev-login`) para o
/// usuário de `DEV_LOGIN_EMAIL` do `apps/api/.env.local`. Token e cookie são
/// reais, então menu, permissões e telas funcionam como com login.
///
/// Antes era um usuário fictício sem token: o menu ficava vazio e toda tela
/// respondia 401.
const DEV_AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  // O refresh token é de uso único (rotação a cada chamada), então o boot
  // abaixo não pode disparar duas vezes: em StrictMode (dev) o React
  // invoca o efeito de montagem duas vezes, e a segunda chamada usaria um
  // cookie já revogado pela primeira, derrubando a sessão que acabou de
  // funcionar. O ref garante uma única tentativa por ciclo de vida do app.
  const hasAttemptedBootRefresh = useRef(false);

  const [paymentPending, setPaymentPending] = useState(false);

  const applySession = useCallback((token: string, sessionUser: AuthUser) => {
    setAccessToken(token);
    setUser(sessionUser);
    setStatus('authenticated');
    setPaymentPending(false);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Refresh recusado com `PAYMENT_PENDING`: a empresa foi suspensa com gente
  // logada. A sessão cai do mesmo jeito, mas o login já abre explicando o porquê.
  const dropSession = useCallback(
    (error: unknown) => {
      setPaymentPending(error instanceof ApiError && error.code === PAYMENT_PENDING_CODE);
      clearSession();
    },
    [clearSession],
  );

  // Interceptor do api-client: quando uma chamada autenticada leva 401 (access
  // token expirado em pleno uso), tenta um refresh silencioso via cookie e
  // devolve o novo token para a chamada original ser repetida uma vez.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      try {
        const session = await authApi.refresh();
        applySession(session.accessToken, session.user);
        return session.accessToken;
      } catch (error) {
        dropSession(error);
        return null;
      }
    });

    return () => setUnauthorizedHandler(null);
  }, [applySession, dropSession]);

  // Loading inicial: o access token só vive em memória (nunca em
  // localStorage), então some a cada reload. No boot, tenta restaurar a
  // sessão a partir do cookie httpOnly do refresh token antes de decidir se
  // o usuário está autenticado ou não.
  useEffect(() => {
    if (hasAttemptedBootRefresh.current) return;
    hasAttemptedBootRefresh.current = true;

    // Com o atalho de dev, sem sessão no cookie entra direto pelo login de
    // desenvolvimento em vez de cair na tela de login.
    authApi
      .refresh()
      .catch((error: unknown) => (DEV_AUTH_BYPASS ? authApi.devLogin() : Promise.reject(error)))
      .then((session) => applySession(session.accessToken, session.user))
      .catch(dropSession);
  }, [applySession, dropSession]);

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
    () => ({ status, user, paymentPending, login, signup, changePassword, logout }),
    [status, user, paymentPending, login, signup, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
