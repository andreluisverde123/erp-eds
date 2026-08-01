import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { UserStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'INACTIVE', label: 'Inativo' },
];

export function getUserStatusLabel(isActive: boolean): string {
  return isActive ? 'Ativo' : 'Inativo';
}

export function getUserStatusBadgeVariant(isActive: boolean): BadgeVariant {
  return isActive ? 'success' : 'secondary';
}
