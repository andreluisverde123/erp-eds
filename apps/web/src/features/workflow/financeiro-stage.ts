import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { FinanceiroStage } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const FINANCEIRO_STAGE_OPTIONS: { value: FinanceiroStage; label: string }[] = [
  { value: 'NOTA', label: 'Nota' },
  { value: 'CONFERENCIA_APROVACAO', label: 'Conferência/Aprovação' },
  { value: 'PAGAMENTO', label: 'Pagamento' },
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const STAGE_LABEL: Record<FinanceiroStage, string> = Object.fromEntries(
  FINANCEIRO_STAGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<FinanceiroStage, string>;

const STAGE_BADGE_VARIANT: Record<FinanceiroStage, BadgeVariant> = {
  NOTA: 'secondary',
  CONFERENCIA_APROVACAO: 'warning',
  PAGAMENTO: 'info',
  BAIXA: 'success',
  CANCELADO: 'destructive',
};

export function getFinanceiroStageLabel(stage: FinanceiroStage): string {
  return STAGE_LABEL[stage];
}

export function getFinanceiroStageBadgeVariant(stage: FinanceiroStage): BadgeVariant {
  return STAGE_BADGE_VARIANT[stage];
}
