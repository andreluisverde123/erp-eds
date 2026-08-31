import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render } from '@testing-library/react';

import { AuthContext, type AuthContextValue } from '@/features/auth/context';
import type { AuthUser } from '@/features/auth/types';

/// Sessão de teste. Usa a MESMA `AuthContext` da aplicação — o Diário não tem
/// autenticação própria, e um contexto falso paralelo faria os testes
/// exercitarem algo que não existe em produção.
export const USUARIO: AuthUser = {
  id: 'user-1',
  name: 'Eduardo Engenharia',
  email: 'engenharia@eds.app',
  roles: ['Engenharia'],
  permissions: ['diario.access', 'diario.report.manage'],
  mustChangePassword: false,
  tenant: { id: 'empresa-1', name: 'EDS', logoUrl: null, erpName: null },
};

function contexto(user: AuthUser | null): AuthContextValue {
  return {
    status: user ? 'authenticated' : 'unauthenticated',
    user,
    login: async () => {},
    signup: async () => {},
    changePassword: async () => {},
    logout: async () => {},
  };
}

interface Opcoes {
  /// Endereço inicial. Usado para exercitar `?obra=` e `/relatorios/:id`.
  rota?: string;
  /// Padrão da rota da tela sob teste. Precisa ser informado quando o endereço
  /// tem parâmetro (`/relatorios/rdo-24` → `/relatorios/:id`): sem ele o React
  /// Router casaria o caminho literal e `useParams()` viria vazio, deixando a
  /// tela presa no carregamento.
  path?: string;
  /// Rotas extras, para verificar navegação de verdade em vez de espionar o
  /// `navigate`.
  outrasRotas?: { path: string; element: ReactNode }[];
  user?: AuthUser | null;
}

export function renderDiario(
  tela: ReactElement,
  { rota = '/', path, outrasRotas = [], user = USUARIO }: Opcoes = {},
) {
  // `retry: false` para um erro de teste falhar na primeira tentativa em vez de
  // esperar a política de repetição do app.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={contexto(user)}>
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route path={path ?? rotaDoElemento(rota, outrasRotas)} element={tela} />
            {outrasRotas.map((extra) => (
              <Route key={extra.path} path={extra.path} element={extra.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

/// A tela sob teste responde pelo caminho inicial, a não ser que ele já esteja
/// coberto por uma das rotas extras.
function rotaDoElemento(rota: string, outras: { path: string }[]): string {
  const caminho = rota.split('?')[0]!;
  return outras.some((extra) => extra.path === caminho) ? '*' : caminho;
}
