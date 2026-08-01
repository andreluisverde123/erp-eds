import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { ContractorStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const CONTRACTOR_STATUS_OPTIONS: { value: ContractorStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'INACTIVE', label: 'Inativo' },
  { value: 'BLOCKED', label: 'Bloqueado' },
];

const STATUS_LABEL: Record<ContractorStatus, string> = Object.fromEntries(
  CONTRACTOR_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ContractorStatus, string>;

const STATUS_BADGE_VARIANT: Record<ContractorStatus, BadgeVariant> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  BLOCKED: 'destructive',
};

export function getContractorStatusLabel(status: ContractorStatus): string {
  return STATUS_LABEL[status];
}

export function getContractorStatusBadgeVariant(status: ContractorStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
