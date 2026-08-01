import { createContext, useContext } from 'react';

import type { SignupInput } from './api';
import type { AuthUser } from './types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  /// Cadastro de uma empresa nova. Como o backend já devolve a sessão, o
  /// usuário sai daqui autenticado — não há passo intermediário de login.
  signup: (input: SignupInput) => Promise<void>;
  /// Troca da própria senha (também usada na tela obrigatória de primeiro
  /// acesso). Devolve sessão nova, então destrava o app imediatamente.
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }

  return context;
}
