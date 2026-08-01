import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { PayslipStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

const STATUS_LABEL: Record<PayslipStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
};

const STATUS_BADGE_VARIANT: Record<PayslipStatus, BadgeVariant> = {
  PENDING: 'secondary',
  PAID: 'success',
};

export function getPayslipStatusLabel(status: PayslipStatus): string {
  return STATUS_LABEL[status];
}

export function getPayslipStatusBadgeVariant(status: PayslipStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
