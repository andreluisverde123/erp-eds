import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { ConstructionStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const CONSTRUCTION_STATUS_OPTIONS: { value: ConstructionStatus; label: string }[] = [
  { value: 'PLANNING', label: 'Em planejamento' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'PAUSED', label: 'Pausada' },
  { value: 'COMPLETED', label: 'Concluída' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_LABEL: Record<ConstructionStatus, string> = Object.fromEntries(
  CONSTRUCTION_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ConstructionStatus, string>;

const STATUS_BADGE_VARIANT: Record<ConstructionStatus, BadgeVariant> = {
  PLANNING: 'secondary',
  IN_PROGRESS: 'info',
  PAUSED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
};

export function getStatusLabel(status: ConstructionStatus): string {
  return STATUS_LABEL[status];
}

export function getStatusBadgeVariant(status: ConstructionStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
