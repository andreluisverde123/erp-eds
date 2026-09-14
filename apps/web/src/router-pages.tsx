import { lazy, Suspense, type ReactNode } from 'react';
import { LoadingState } from '@repo/ui';

// Cada página carrega sob demanda — só entra no bundle quando o usuário
// realmente navega até ela (mesmo padrão já usado em relatorios-page.tsx
// para as abas de relatório).
export const DashboardPage = lazy(() =>
  import('@/pages/dashboard/dashboard-page').then((m) => ({ default: m.DashboardPage })),
);
export const ObrasPage = lazy(() =>
  import('@/pages/engenharia/obras-page').then((m) => ({ default: m.ObrasPage })),
);
export const ObraDetailPage = lazy(() =>
  import('@/pages/engenharia/obra-detail-page').then((m) => ({ default: m.ObraDetailPage })),
);
export const SolicitacoesPage = lazy(() =>
  import('@/pages/compras/solicitacoes-page').then((m) => ({ default: m.SolicitacoesPage })),
);
export const NovaSolicitacaoPage = lazy(() =>
  import('@/pages/compras/nova-solicitacao-page').then((m) => ({ default: m.NovaSolicitacaoPage })),
);
export const EditarSolicitacaoPage = lazy(() =>
  import('@/pages/compras/editar-solicitacao-page').then((m) => ({
    default: m.EditarSolicitacaoPage,
  })),
);
export const SolicitacaoDetailPage = lazy(() =>
  import('@/pages/compras/solicitacao-detail-page').then((m) => ({
    default: m.SolicitacaoDetailPage,
  })),
);
export const OrdensDeCompraPage = lazy(() =>
  import('@/pages/compras/ordens-de-compra-page').then((m) => ({ default: m.OrdensDeCompraPage })),
);
export const FornecedoresPage = lazy(() =>
  import('@/pages/compras/fornecedores-page').then((m) => ({ default: m.FornecedoresPage })),
);
export const NotasFiscaisPage = lazy(() =>
  import('@/pages/financeiro/notas-fiscais-page').then((m) => ({ default: m.NotasFiscaisPage })),
);
export const IntegracaoFiscalPage = lazy(() =>
  import('@/pages/administracao/integracao-fiscal-page').then((m) => ({
    default: m.IntegracaoFiscalPage,
  })),
);
export const ConciliacaoPage = lazy(() =>
  import('@/pages/financeiro/conciliacao-page').then((m) => ({ default: m.ConciliacaoPage })),
);
export const ConciliacaoDetailPage = lazy(() =>
  import('@/pages/financeiro/conciliacao-detail-page').then((m) => ({
    default: m.ConciliacaoDetailPage,
  })),
);
export const ContasAPagarPage = lazy(() =>
  import('@/pages/financeiro/contas-a-pagar-page').then((m) => ({ default: m.ContasAPagarPage })),
);
export const PagamentosPage = lazy(() =>
  import('@/pages/financeiro/pagamentos-page').then((m) => ({ default: m.PagamentosPage })),
);
export const InsumosPage = lazy(() =>
  import('@/pages/engenharia/insumos-page').then((m) => ({ default: m.InsumosPage })),
);
export const ComposicoesPage = lazy(() =>
  import('@/pages/engenharia/composicoes-page').then((m) => ({ default: m.ComposicoesPage })),
);
export const ComposicaoDetailPage = lazy(() =>
  import('@/pages/engenharia/composicao-detail-page').then((m) => ({
    default: m.ComposicaoDetailPage,
  })),
);
export const OrcamentosPage = lazy(() =>
  import('@/pages/engenharia/orcamentos-page').then((m) => ({ default: m.OrcamentosPage })),
);
export const OrcamentoDetailPage = lazy(() =>
  import('@/pages/engenharia/orcamento-detail-page').then((m) => ({
    default: m.OrcamentoDetailPage,
  })),
);
export const BasesDeReferenciaPage = lazy(() =>
  import('@/pages/engenharia/bases-de-referencia-page').then((m) => ({ default: m.BasesDeReferenciaPage })),
);
export const BaseDeReferenciaDetailPage = lazy(() =>
  import('@/pages/engenharia/base-de-referencia-detail-page').then((m) => ({
    default: m.BaseDeReferenciaDetailPage,
  })),
);
export const FuncionariosPage = lazy(() =>
  import('@/pages/rh/funcionarios-page').then((m) => ({ default: m.FuncionariosPage })),
);
export const AlocacoesPage = lazy(() =>
  import('@/pages/rh/alocacoes-page').then((m) => ({ default: m.AlocacoesPage })),
);
export const ApontamentoPage = lazy(() =>
  import('@/pages/rh/apontamento-page').then((m) => ({ default: m.ApontamentoPage })),
);
export const CustosPage = lazy(() =>
  import('@/pages/rh/custos-page').then((m) => ({ default: m.CustosPage })),
);
export const PontoPage = lazy(() =>
  import('@/pages/rh/ponto-page').then((m) => ({ default: m.PontoPage })),
);
export const ProducaoPage = lazy(() =>
  import('@/pages/rh/producao-page').then((m) => ({ default: m.ProducaoPage })),
);
export const HoleritesPage = lazy(() =>
  import('@/pages/rh/holerites-page').then((m) => ({ default: m.HoleritesPage })),
);
export const TerceirosPage = lazy(() =>
  import('@/pages/engenharia/terceiros/terceiros-page').then((m) => ({ default: m.TerceirosPage })),
);
export const RelatoriosPage = lazy(() =>
  import('@/pages/relatorios/relatorios-page').then((m) => ({ default: m.RelatoriosPage })),
);
export const WorkflowPage = lazy(() =>
  import('@/pages/workflow/workflow-page').then((m) => ({ default: m.WorkflowPage })),
);
export const UsuariosPage = lazy(() =>
  import('@/pages/administracao/usuarios-page').then((m) => ({ default: m.UsuariosPage })),
);
export const NovoUsuarioPage = lazy(() =>
  import('@/pages/administracao/novo-usuario-page').then((m) => ({ default: m.NovoUsuarioPage })),
);
export const EditarUsuarioPage = lazy(() =>
  import('@/pages/administracao/editar-usuario-page').then((m) => ({
    default: m.EditarUsuarioPage,
  })),
);
export const UsuarioDetailPage = lazy(() =>
  import('@/pages/administracao/usuario-detail-page').then((m) => ({
    default: m.UsuarioDetailPage,
  })),
);
export const ConfiguracoesPage = lazy(() =>
  import('@/pages/configuracoes/configuracoes-page').then((m) => ({
    default: m.ConfiguracoesPage,
  })),
);
export const LoginPage = lazy(() =>
  import('@/pages/login/login-page').then((m) => ({ default: m.LoginPage })),
);
export const TrocarSenhaPage = lazy(() =>
  import('@/pages/trocar-senha/trocar-senha-page').then((m) => ({ default: m.TrocarSenhaPage })),
);
export const CadastroPage = lazy(() =>
  import('@/pages/cadastro/cadastro-page').then((m) => ({ default: m.CadastroPage })),
);

function RouteFallback() {
  return <LoadingState />;
}

export function SuspendedOutlet({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}
