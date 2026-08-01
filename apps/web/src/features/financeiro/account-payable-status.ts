import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { AccountPayableStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const ACCOUNT_PAYABLE_STATUS_OPTIONS: { value: AccountPayableStatus; label: string }[] = [
  { value: 'OPEN', label: 'Aberta' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'PAID', label: 'Paga' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_LABEL: Record<AccountPayableStatus, string> = Object.fromEntries(
  ACCOUNT_PAYABLE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AccountPayableStatus, string>;

const STATUS_BADGE_VARIANT: Record<AccountPayableStatus, BadgeVariant> = {
  OPEN: 'secondary',
  PARTIAL: 'warning',
  PAID: 'success',
  CANCELLED: 'destructive',
};

export function getAccountPayableStatusLabel(status: AccountPayableStatus): string {
  return STATUS_LABEL[status];
}

export function getAccountPayableStatusBadgeVariant(status: AccountPayableStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
