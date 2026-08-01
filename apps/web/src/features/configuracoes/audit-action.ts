import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { AuditAction } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const AUDIT_ACTION_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: 'CREATE', label: 'Criação' },
  { value: 'UPDATE', label: 'Atualização' },
  { value: 'DELETE', label: 'Exclusão' },
];

const ACTION_LABEL: Record<AuditAction, string> = Object.fromEntries(
  AUDIT_ACTION_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AuditAction, string>;

const ACTION_BADGE_VARIANT: Record<AuditAction, BadgeVariant> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'destructive',
};

export function getAuditActionLabel(action: AuditAction): string {
  return ACTION_LABEL[action];
}

export function getAuditActionBadgeVariant(action: AuditAction): BadgeVariant {
  return ACTION_BADGE_VARIANT[action];
}
