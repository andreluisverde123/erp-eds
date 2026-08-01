import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { EmployeeStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const EMPLOYEE_STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'VACATION', label: 'Férias' },
  { value: 'ON_LEAVE', label: 'Afastado' },
  { value: 'TERMINATED', label: 'Desligado' },
];

const STATUS_LABEL: Record<EmployeeStatus, string> = Object.fromEntries(
  EMPLOYEE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<EmployeeStatus, string>;

const STATUS_BADGE_VARIANT: Record<EmployeeStatus, BadgeVariant> = {
  ACTIVE: 'success',
  VACATION: 'info',
  ON_LEAVE: 'warning',
  TERMINATED: 'destructive',
};

export function getEmployeeStatusLabel(status: EmployeeStatus): string {
  return STATUS_LABEL[status];
}

export function getEmployeeStatusBadgeVariant(status: EmployeeStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
