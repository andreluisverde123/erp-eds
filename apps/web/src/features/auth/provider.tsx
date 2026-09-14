import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PAYMENT_PENDING_CODE } from '@/config/billing-notice';
import { ApiError, setAccessToken, setUnauthorizedHandler } from '@/lib/api-client';

import * as authApi from './api';
import { AuthContext, type AuthStatus } from './context';
import type { AuthUser } from './types';

/// Atalho de desenvolvimento — NÃO é login de verdade.
///
/// Só liga quando estamos no servidor de dev (`import.meta.env.DEV`, sempre
/// `false` em `vite build`, inclusive staging e produção — o código abaixo nem
/// entra no bundle publicado) E a flag opt-in `VITE_DEV_AUTH_BYPASS` está
/// ativa (defina em `.env.local`, que não vai para o git). Serve para ver a
/// interface local sem subir a API. Fora desses dois trilhos, é como se não
/// existisse: o fluxo normal de login/refresh continua valendo.
const DEV_AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

/// Usuário fictício da sessão de dev. E-mail de propósito diferente de
/// `admin@obrei.com` para que o aviso de atraso apareça na simulação.
const DEV_MOCK_USER: AuthUser = {
  id: 'dev-mock-user',
  name: 'Usuário de Desenvolvimento',
  email: 'dev@localhost',
  roles: ['dev'],
  permissions: [],
  tenant: { id: 'dev', name: 'EDS (dev)', logoUrl: null, erpName: null },
  mustChangePassword: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Com o atalho de dev, já nasce autenticado (estado semeado aqui, sem
  // setState em efeito). Sem ele, o fluxo normal: 'loading' até o refresh.
  const [status, setStatus] = useState<AuthStatus>(DEV_AUTH_BYPASS ? 'authenticated' : 'loading');
  const [user, setUser] = useState<AuthUser | null>(DEV_AUTH_BYPASS ? DEV_MOCK_USER : null);
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
    // Com o atalho de dev ligado não há API para renovar token: um 401 de
    // alguma tela devolve `null` (a chamada falha e a página mostra seu estado
    // de erro), mas NÃO derruba a sessão fictícia — senão o bypass se
    // desfaria no primeiro fetch.
    if (DEV_AUTH_BYPASS) {
      setUnauthorizedHandler(async () => null);
      return () => setUnauthorizedHandler(null);
    }

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

    // Atalho de dev: estado já nasceu autenticado (ver useState acima); aqui
    // só registramos o token fictício no api-client, sem falar com a API.
    // `setAccessToken` é sistema externo, não setState do React.
    if (DEV_AUTH_BYPASS) {
      setAccessToken('dev-mock-token');
      return;
    }

    authApi
      .refresh()
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
