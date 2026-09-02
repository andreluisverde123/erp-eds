import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/context';
import { getContractsExpiringSummary } from '@/features/terceiros/api';
import { getCertificateAlert } from '@/features/integracao-fiscal/api';
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
  // O aviso de certificado vai só para quem pode RESOLVÊ-LO subindo o arquivo
  // novo — é a mesma permissão que abre Administração > Integração Fiscal.
  const podeVerFiscal = permissoes.includes('admin.fiscal_integration');

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

  const { data: certificado } = useQuery({
    queryKey: ['fiscal', 'certificate-alert'],
    queryFn: getCertificateAlert,
    enabled: podeVerFiscal,
    // O vencimento muda uma vez por dia, não a cada foco de janela. Sem isto a
    // Home refaria a consulta a cada volta para a aba.
    staleTime: 60 * 60_000,
  });

  const alertas: PendingAlert[] = [];

  /// PRIMEIRO da lista quando o certificado já venceu, e é deliberado: a
  /// sincronização fiscal está PARADA neste momento, e cada dia de atraso é um
  /// dia a mais de notas represadas na fila da SEFAZ — que não guarda a fila
  /// para sempre. As outras pendências esperam alguém; esta já está custando.
  if (podeVerFiscal && certificado && certificado.status === 'EXPIRED') {
    const dias = Math.abs(certificado.diasParaExpirar ?? 0);
    alertas.push({
      key: 'certificado-vencido',
      title: 'O certificado digital venceu',
      emphasis:
        dias === 0 ? 'Venceu hoje' : dias === 1 ? 'Venceu ontem' : `Venceu há ${dias} dias`,
      // Diz o EFEITO, não só o fato: "certificado vencido" não deixa óbvio que
      // as notas fiscais pararam de entrar sozinhas.
      detail: 'e a importação automática de notas fiscais está parada.',
      to: '/administracao/integracao-fiscal',
    });
  }

  if (podeVerFiscal && certificado && certificado.status === 'EXPIRING') {
    const dias = certificado.diasParaExpirar ?? 0;
    alertas.push({
      key: 'certificado-vencendo',
      title: 'O certificado digital está vencendo',
      emphasis: dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`,
      // A antecedência existe porque renovar um A1 exige agendar validação com
      // a autoridade certificadora — não se resolve na véspera.
      detail: 'e a importação automática de notas fiscais para quando ele vencer.',
      to: '/administracao/integracao-fiscal',
    });
  }

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
