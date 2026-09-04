import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { FulfillmentStatus, PurchaseRequestStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const PURCHASE_REQUEST_STATUS_OPTIONS: { value: PurchaseRequestStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'QUOTING', label: 'Em Cotação' },
  { value: 'APPROVED', label: 'Aprovada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_LABEL: Record<PurchaseRequestStatus, string> = Object.fromEntries(
  PURCHASE_REQUEST_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PurchaseRequestStatus, string>;

const STATUS_BADGE_VARIANT: Record<PurchaseRequestStatus, BadgeVariant> = {
  DRAFT: 'secondary',
  PENDING: 'warning',
  QUOTING: 'info',
  APPROVED: 'success',
  CANCELLED: 'destructive',
};

/// Mesmo grafo de transição aplicado no backend — mantido aqui só pra decidir
/// quais botões de ação mostrar na tela de detalhe, a validação real acontece
/// sempre no servidor.
const ALLOWED_TRANSITIONS: Record<PurchaseRequestStatus, PurchaseRequestStatus[]> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['QUOTING', 'CANCELLED'],
  QUOTING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  CANCELLED: [],
};

export function getRequestStatusLabel(status: PurchaseRequestStatus): string {
  return STATUS_LABEL[status];
}

/// O que a etiqueta da solicitação deve DIZER, considerando também quanto já
/// foi comprado.
///
/// **O problema que isto resolve.** "Aprovada" descreve a decisão, não a
/// compra — e lido na lista parece que tudo já foi comprado. Quando parte dos
/// itens ainda está pendente, a solicitação não está parada nem concluída:
/// está EM ANDAMENTO, e a etiqueta precisa dizer isso. Foi o relato do
/// usuário, com estas palavras: "a tag aprovada confunde, parece que já foi
/// comprado tudo e às vezes ainda falta coisa".
///
/// Só a etiqueta muda. O `status` continua sendo o fluxo de aprovação, e o
/// atendimento continua derivado das ordens — nenhum valor novo no enum, nada
/// gravado. Ver `compras/fulfillment.ts` na API.
///
/// Vale apenas em `APPROVED`: antes dela nenhuma ordem pode existir, então
/// "Pendente" e "Em Cotação" já dizem a verdade inteira.
export function getRequestDisplayStatus(
  status: PurchaseRequestStatus,
  fulfillment?: { status: FulfillmentStatus },
): { label: string; variant: BadgeVariant } {
  if (status !== 'APPROVED' || !fulfillment) {
    return { label: STATUS_LABEL[status], variant: STATUS_BADGE_VARIANT[status] };
  }

  switch (fulfillment.status) {
    // Comprada por inteiro. "Atendida" e não "Aprovada": a decisão saiu de
    // cena, o que importa agora é que a necessidade foi suprida.
    case 'FULFILLED':
      return { label: 'Atendida', variant: 'success' };
    // O caso do relato. `info` e não `success`: ainda há trabalho a fazer, e
    // verde na lista é exatamente o que fazia a pessoa passar batido.
    case 'PARTIAL':
      return { label: 'Parcialmente atendida', variant: 'info' };
    // Aprovada e nada comprado ainda — aqui "Aprovada" é a palavra correta, e
    // trocá-la esconderia que a compra sequer começou.
    default:
      return { label: 'Aprovada', variant: 'success' };
  }
}

export function getRequestStatusBadgeVariant(status: PurchaseRequestStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}

export function getAllowedTransitions(status: PurchaseRequestStatus): PurchaseRequestStatus[] {
  return ALLOWED_TRANSITIONS[status];
}
