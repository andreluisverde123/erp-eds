import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { TimeEntryStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

const STATUS_LABEL: Record<TimeEntryStatus, string> = {
  OPEN: 'Aberto',
  CLOSED: 'Fechado',
  INCONSISTENT: 'Inconsistente',
};

const STATUS_BADGE_VARIANT: Record<TimeEntryStatus, BadgeVariant> = {
  OPEN: 'secondary',
  CLOSED: 'success',
  INCONSISTENT: 'destructive',
};

export function getTimeEntryStatusLabel(status: TimeEntryStatus): string {
  return STATUS_LABEL[status];
}

export function getTimeEntryStatusBadgeVariant(status: TimeEntryStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
