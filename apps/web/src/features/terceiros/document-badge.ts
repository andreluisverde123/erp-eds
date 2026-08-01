import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { DocumentBadgeStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const DOCUMENT_BADGE_OPTIONS: { value: DocumentBadgeStatus; label: string }[] = [
  { value: 'VALID', label: 'Válido' },
  { value: 'EXPIRING', label: 'Vencendo' },
  { value: 'EXPIRED', label: 'Vencido' },
];

const BADGE_LABEL: Record<DocumentBadgeStatus, string> = Object.fromEntries(
  DOCUMENT_BADGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<DocumentBadgeStatus, string>;

const BADGE_VARIANT: Record<DocumentBadgeStatus, BadgeVariant> = {
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'destructive',
};

export function getDocumentBadgeLabel(status: DocumentBadgeStatus): string {
  return BADGE_LABEL[status];
}

export function getDocumentBadgeVariant(status: DocumentBadgeStatus): BadgeVariant {
  return BADGE_VARIANT[status];
}
