import { apiClient } from '@/lib/api-client';

import type { AuthSession, AuthUser } from './types';

/// As três chamadas abaixo nunca devem passar pelo interceptor de
/// "401 -> tenta refresh -> repete a chamada" do api-client — ele existe para
/// chamadas de recursos protegidos, não para o próprio fluxo de autenticação
/// (evitaria um loop: refresh falhando chamaria a si mesmo de novo).
const AUTH_REQUEST_OPTIONS = { skipAuthRetry: true } as const;

export function login(email: string, password: string): Promise<AuthSession> {
  return apiClient.post<AuthSession>('/auth/login', { email, password }, AUTH_REQUEST_OPTIONS);
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  companyName: string;
  acceptedTerms: boolean;
}

/// Cadastro self-service: cria a empresa, os papéis padrão e o primeiro
/// usuário (Administrador), e já devolve a sessão — o usuário entra direto,
/// sem passar pela tela de login.
export function signup(input: SignupInput): Promise<AuthSession> {
  return apiClient.post<AuthSession>('/onboarding/signup', input, AUTH_REQUEST_OPTIONS);
}

/// Renovações em FILA entre abas. O cookie de refresh é de uso único e é o
/// mesmo para todas as abas: duas renovando juntas mandariam o mesmo cookie, e
/// a segunda seria recusada e mandada para o login. Com o lock, a segunda só
/// sai quando a primeira terminou — e aí o navegador já manda o cookie novo.
/// Sem Web Locks (navegador antigo), segue sem fila, como antes.
export function refresh(): Promise<AuthSession> {
  const renovar = () =>
    apiClient.post<AuthSession>('/auth/refresh', undefined, AUTH_REQUEST_OPTIONS);
  if (typeof navigator === 'undefined' || !navigator.locks) return renovar();
  return navigator.locks.request('eds-auth-refresh', renovar);
}

/// Login de desenvolvimento, sem senha. A API só responde no ambiente local
/// (fora dele é 404); ver `DevAuthController`.
export function devLogin(): Promise<AuthSession> {
  return apiClient.post<AuthSession>('/auth/dev-login', undefined, AUTH_REQUEST_OPTIONS);
}

export function logout(): Promise<void> {
  return apiClient.post<void>('/auth/logout', undefined, AUTH_REQUEST_OPTIONS);
}

export function changePassword(currentPassword: string, newPassword: string): Promise<AuthSession> {
  return apiClient.post<AuthSession>(
    '/auth/change-password',
    { currentPassword, newPassword },
    AUTH_REQUEST_OPTIONS,
  );
}

export function me(): Promise<AuthUser> {
  return apiClient.get<AuthUser>('/auth/me');
}
