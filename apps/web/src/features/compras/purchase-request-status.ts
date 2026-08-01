import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { PurchaseRequestStatus } from './types';

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

export function getRequestStatusBadgeVariant(status: PurchaseRequestStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}

export function getAllowedTransitions(status: PurchaseRequestStatus): PurchaseRequestStatus[] {
  return ALLOWED_TRANSITIONS[status];
}
