import type { AccountPayableStatus, Prisma } from '../../../generated/prisma/client';

/// Situação da nota do ponto de vista de quem LANÇOU (a Engenharia): o
/// caminho é lançada → liberada pelo responsável → paga pelo Financeiro.
/// Derivada da conta a pagar, nunca armazenada.
export const SERVICE_INVOICE_SITUATIONS = [
  'AGUARDANDO_LIBERACAO',
  'LIBERADA',
  'PAGA_PARCIAL',
  'PAGA',
  'CANCELADA',
] as const;

export type ServiceInvoiceSituation = (typeof SERVICE_INVOICE_SITUATIONS)[number];

export function situationOf(conta: {
  status: AccountPayableStatus;
  approvedForPaymentAt: Date | null;
}): ServiceInvoiceSituation {
  switch (conta.status) {
    case 'CANCELLED':
      return 'CANCELADA';
    case 'PAID':
      return 'PAGA';
    case 'PARTIAL':
      return 'PAGA_PARCIAL';
    default:
      return conta.approvedForPaymentAt ? 'LIBERADA' : 'AGUARDANDO_LIBERACAO';
  }
}

/// O filtro por situação, traduzido para a conta a pagar.
export function whereForSituation(
  situation: ServiceInvoiceSituation,
): Prisma.AccountPayableWhereInput {
  switch (situation) {
    case 'CANCELADA':
      return { status: 'CANCELLED' };
    case 'PAGA':
      return { status: 'PAID' };
    case 'PAGA_PARCIAL':
      return { status: 'PARTIAL' };
    case 'LIBERADA':
      return { status: 'OPEN', approvedForPaymentAt: { not: null } };
    case 'AGUARDANDO_LIBERACAO':
      return { status: 'OPEN', approvedForPaymentAt: null };
  }
}
