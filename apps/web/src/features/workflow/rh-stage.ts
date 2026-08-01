import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { RhStage } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const RH_STAGE_OPTIONS: { value: RhStage; label: string }[] = [
  { value: 'CADASTRO', label: 'Cadastro' },
  { value: 'ALOCACAO', label: 'Alocação' },
  { value: 'PRODUCAO', label: 'Produção' },
  { value: 'DESLIGAMENTO', label: 'Desligamento' },
];

const STAGE_LABEL: Record<RhStage, string> = Object.fromEntries(
  RH_STAGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<RhStage, string>;

const STAGE_BADGE_VARIANT: Record<RhStage, BadgeVariant> = {
  CADASTRO: 'secondary',
  ALOCACAO: 'info',
  PRODUCAO: 'warning',
  DESLIGAMENTO: 'destructive',
};

export function getRhStageLabel(stage: RhStage): string {
  return STAGE_LABEL[stage];
}

export function getRhStageBadgeVariant(stage: RhStage): BadgeVariant {
  return STAGE_BADGE_VARIANT[stage];
}
