import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { InvoiceStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'RECEIVED', label: 'Recebida' },
  { value: 'VALIDATED', label: 'Validada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_LABEL: Record<InvoiceStatus, string> = Object.fromEntries(
  INVOICE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<InvoiceStatus, string>;

const STATUS_BADGE_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  RECEIVED: 'secondary',
  VALIDATED: 'success',
  CANCELLED: 'destructive',
};

export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  return STATUS_LABEL[status];
}

export function getInvoiceStatusBadgeVariant(status: InvoiceStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
