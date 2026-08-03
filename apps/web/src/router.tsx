import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';

import { AppLayout } from '@/layouts/app-layout';
import { PlaceholderPage } from '@/pages/placeholder-page';
import { ProtectedRoute } from '@/features/auth/protected-route';
import { RequirePermission } from '@/features/auth/require-permission';
import { navLinks } from '@/config/nav';
import { PUBLIC_SIGNUP_ENABLED } from '@/config/company';

import {
  AlocacoesPage,
  CadastroPage,
  ConfiguracoesPage,
  ContasAPagarPage,
  DashboardPage,
  EditarSolicitacaoPage,
  FornecedoresPage,
  FuncionariosPage,
  HoleritesPage,
  LoginPage,
  NotasFiscaisPage,
  NovaSolicitacaoPage,
  ObraDetailPage,
  ObrasPage,
  OrdensDeCompraPage,
  PagamentosPage,
  PontoPage,
  ProducaoPage,
  RelatoriosPage,
  SolicitacaoDetailPage,
  SolicitacoesPage,
  SuspendedOutlet,
  TrocarSenhaPage,
  TerceirosPage,
  WorkflowPage,
} from '@/router-pages';

const PAGE_OVERRIDES: Record<string, ReactNode> = {
  '/dashboard': <DashboardPage />,
  '/engenharia/obras': <ObrasPage />,
  '/engenharia/solicitacoes': <SolicitacoesPage />,
  '/engenharia/terceirizados': <TerceirosPage />,
  '/compras/pendentes': (
    <SolicitacoesPage
      fixedStatus="PENDING"
      title="Pendentes"
      description="Solicitações aguardando ação do time de Compras."
    />
  ),
  '/compras/ordens-de-compra': <OrdensDeCompraPage />,
  '/compras/fornecedores': <FornecedoresPage />,
  '/financeiro/notas-fiscais': <NotasFiscaisPage />,
  '/financeiro/contas-a-pagar': <ContasAPagarPage />,
  '/financeiro/pagamentos': <PagamentosPage />,
  '/rh/funcionarios': <FuncionariosPage />,
  '/rh/ponto': <PontoPage />,
  '/rh/producao': <ProducaoPage />,
  '/rh/holerites': <HoleritesPage />,
  '/relatorios': <RelatoriosPage />,
  '/workflow': <WorkflowPage />,
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <SuspendedOutlet>
        <LoginPage />
      </SuspendedOutlet>
    ),
  },
  // Auto-cadastro de construtora. Este ERP é da EDS e tem uma empresa só, então
  // a rota fica desligada: quem chegar nela vai para o login. A tela e o
  // endpoint continuam no código (`PUBLIC_SIGNUP_ENABLED` na API os reabilita)
  // porque provisionar uma nova base ainda passa por eles — mas isso é operação
  // de implantação, não função da aplicação.
  {
    path: '/cadastro',
    element: PUBLIC_SIGNUP_ENABLED ? (
      <SuspendedOutlet>
        <CadastroPage />
      </SuspendedOutlet>
    ) : (
      <Navigate to="/login" replace />
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      // Dentro do ProtectedRoute (exige sessão) mas FORA do AppLayout: com
      // senha temporária a API recusa tudo, então sidebar e header apareceriam
      // vazios/quebrados.
      {
        path: 'trocar-senha',
        element: (
          <SuspendedOutlet>
            <TrocarSenhaPage />
          </SuspendedOutlet>
        ),
      },
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          ...navLinks
            .filter((link) => link.path !== '/configuracoes')
            .map((link) => ({
              path: link.path.slice(1),
              element: (
                <SuspendedOutlet>
                  {PAGE_OVERRIDES[link.path] ?? (
                    <PlaceholderPage title={link.title} icon={link.icon} />
                  )}
                </SuspendedOutlet>
              ),
            })),
          {
            path: 'engenharia/obras/:id',
            element: (
              <SuspendedOutlet>
                <ObraDetailPage />
              </SuspendedOutlet>
            ),
          },
          {
            path: 'engenharia/solicitacoes/nova',
            element: (
              <SuspendedOutlet>
                <NovaSolicitacaoPage />
              </SuspendedOutlet>
            ),
          },
          {
            path: 'engenharia/solicitacoes/:id/editar',
            element: (
              <SuspendedOutlet>
                <EditarSolicitacaoPage />
              </SuspendedOutlet>
            ),
          },
          {
            path: 'engenharia/solicitacoes/:id',
            element: (
              <SuspendedOutlet>
                <SolicitacaoDetailPage />
              </SuspendedOutlet>
            ),
          },
          {
            path: 'rh/funcionarios/alocacoes',
            element: (
              <SuspendedOutlet>
                <AlocacoesPage />
              </SuspendedOutlet>
            ),
          },
          {
            element: <RequirePermission permission="admin.manage_users" />,
            children: [
              {
                path: 'configuracoes',
                element: (
                  <SuspendedOutlet>
                    <ConfiguracoesPage />
                  </SuspendedOutlet>
                ),
              },
            ],
          },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
