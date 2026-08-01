import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { ComprasStage } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const COMPRAS_STAGE_OPTIONS: { value: ComprasStage; label: string }[] = [
  { value: 'SOLICITACAO', label: 'Solicitação' },
  { value: 'COTACAO', label: 'Cotação' },
  { value: 'APROVACAO', label: 'Aprovação' },
  { value: 'ORDEM', label: 'Ordem' },
  { value: 'RECEBIMENTO', label: 'Recebimento' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const STAGE_LABEL: Record<ComprasStage, string> = Object.fromEntries(
  COMPRAS_STAGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ComprasStage, string>;

const STAGE_BADGE_VARIANT: Record<ComprasStage, BadgeVariant> = {
  SOLICITACAO: 'secondary',
  COTACAO: 'info',
  APROVACAO: 'warning',
  ORDEM: 'warning',
  RECEBIMENTO: 'info',
  FINANCEIRO: 'success',
  CANCELADO: 'destructive',
};

export function getComprasStageLabel(stage: ComprasStage): string {
  return STAGE_LABEL[stage];
}

export function getComprasStageBadgeVariant(stage: ComprasStage): BadgeVariant {
  return STAGE_BADGE_VARIANT[stage];
}
