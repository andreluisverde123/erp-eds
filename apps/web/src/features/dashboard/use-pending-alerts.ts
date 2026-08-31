import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/context';
import { getContractsExpiringSummary } from '@/features/terceiros/api';
import { getPurchaseRequestsPendingSummary } from '@/features/compras/api';

import type { PendingAlert } from './components/pending-alerts-card';

/// Reúne as pendências das várias origens numa lista só.
///
/// **Cada origem é consultada apenas por quem pode vê-la.** A permissão entra
/// no `enabled` da consulta, e não num filtro depois: sem isso o navegador
/// pediria dados que a API recusaria, e a Home encheria de 403 no console de
/// quem não tem o módulo.
///
/// A ordem da lista é a de urgência, não a de módulo: o que tem prazo vencendo
/// vem antes do que está só parado.
export function usePendingAlerts(): PendingAlert[] {
  const { user } = useAuth();
  const permissoes = user?.permissions ?? [];

  const podeVerContratos = permissoes.includes('terceiros.view');
  const podeVerCompras = permissoes.includes('compras.view');
  // Quem APROVA é quem precisa ver a fila de aprovação. Mostrá-la a quem não
  // pode aprovar seria cobrar uma ação que a pessoa não consegue executar.
  const podeAprovar = permissoes.includes('compras.approve');
  // Quem cota é Compras.
  const podeCotar = permissoes.includes('compras.manage');

  const { data: contratos } = useQuery({
    queryKey: ['contracts', 'expiring-summary'],
    queryFn: getContractsExpiringSummary,
    enabled: podeVerContratos,
  });

  const { data: solicitacoes } = useQuery({
    queryKey: ['purchase-requests', 'pending-summary'],
    queryFn: getPurchaseRequestsPendingSummary,
    enabled: podeVerCompras && (podeAprovar || podeCotar),
  });

  const alertas: PendingAlert[] = [];

  if (podeAprovar && solicitacoes && solicitacoes.awaitingApproval > 0) {
    const n = solicitacoes.awaitingApproval;
    alertas.push({
      key: 'solicitacoes-aprovacao',
      title: n === 1 ? 'Existe 1 solicitação aguardando aprovação' : `Existem ${n} solicitações aguardando aprovação`,
      emphasis: 'Já foram cotadas',
      detail: 'e esperam a sua autorização para virar ordem de compra.',
      to: '/engenharia/solicitacoes?status=QUOTING',
    });
  }

  if (podeCotar && solicitacoes && solicitacoes.awaitingQuote > 0) {
    const n = solicitacoes.awaitingQuote;
    alertas.push({
      key: 'solicitacoes-cotacao',
      title: n === 1 ? 'Existe 1 solicitação aguardando cotação' : `Existem ${n} solicitações aguardando cotação`,
      emphasis: 'Foram enviadas',
      detail: 'e ainda não têm preço para seguir para aprovação.',
      to: '/engenharia/solicitacoes?status=PENDING',
    });
  }

  if (podeVerContratos && contratos && contratos.count > 0) {
    alertas.push({
      key: 'contratos-vencendo',
      title:
        contratos.count === 1
          ? 'Existe 1 contrato vencendo'
          : `Existem ${contratos.count} contratos vencendo`,
      emphasis: 'Vencem em até 30 dias',
      detail: 'e precisam da sua atenção.',
      to: '/engenharia/terceirizados?tab=contratos',
    });
  }

  return alertas;
}
