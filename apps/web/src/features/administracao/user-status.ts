import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { UserStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'PENDING_FIRST_ACCESS', label: 'Primeiro acesso' },
  { value: 'INACTIVE', label: 'Inativo' },
];

const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  PENDING_FIRST_ACCESS: 'Primeiro acesso',
  INACTIVE: 'Inativo',
};

/// Verde para quem já está usando o sistema, âmbar para o que ainda depende de
/// uma ação do usuário, cinza para o que está desligado — as mesmas variantes
/// de Badge já existentes, sem cor nova no Design System.
const USER_STATUS_VARIANTS: Record<UserStatus, BadgeVariant> = {
  ACTIVE: 'success',
  PENDING_FIRST_ACCESS: 'warning',
  INACTIVE: 'secondary',
};

export function getUserStatusLabel(status: UserStatus): string {
  return USER_STATUS_LABELS[status];
}

export function getUserStatusBadgeVariant(status: UserStatus): BadgeVariant {
  return USER_STATUS_VARIANTS[status];
}
