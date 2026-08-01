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

export function refresh(): Promise<AuthSession> {
  return apiClient.post<AuthSession>('/auth/refresh', undefined, AUTH_REQUEST_OPTIONS);
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
