import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { ContractBadgeStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const CONTRACT_BADGE_OPTIONS: { value: ContractBadgeStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Vigente' },
  { value: 'EXPIRING', label: 'Vencendo' },
  { value: 'EXPIRED', label: 'Vencido' },
  { value: 'CANCELLED', label: 'Encerrado' },
];

const BADGE_LABEL: Record<ContractBadgeStatus, string> = Object.fromEntries(
  CONTRACT_BADGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ContractBadgeStatus, string>;

const BADGE_VARIANT: Record<ContractBadgeStatus, BadgeVariant> = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'destructive',
  CANCELLED: 'secondary',
};

export function getContractBadgeLabel(status: ContractBadgeStatus): string {
  return BADGE_LABEL[status];
}

export function getContractBadgeVariant(status: ContractBadgeStatus): BadgeVariant {
  return BADGE_VARIANT[status];
}
