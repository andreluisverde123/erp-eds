import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { PurchaseOrderStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const PURCHASE_ORDER_STATUS_OPTIONS: { value: PurchaseOrderStatus; label: string }[] = [
  { value: 'OPEN', label: 'Aberta' },
  { value: 'ISSUED', label: 'Emitida' },
  { value: 'RECEIVED', label: 'Recebida' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = Object.fromEntries(
  PURCHASE_ORDER_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PurchaseOrderStatus, string>;

const STATUS_BADGE_VARIANT: Record<PurchaseOrderStatus, BadgeVariant> = {
  OPEN: 'secondary',
  ISSUED: 'info',
  RECEIVED: 'success',
  CANCELLED: 'destructive',
};

export function getOrderStatusLabel(status: PurchaseOrderStatus): string {
  return STATUS_LABEL[status];
}

export function getOrderStatusBadgeVariant(status: PurchaseOrderStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
