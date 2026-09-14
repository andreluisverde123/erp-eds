import type { ReferenceSource } from './types';

export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

export const REFERENCE_SOURCE_LABELS: Record<ReferenceSource, string> = {
  SINAPI: 'SINAPI (CAIXA)',
  SICRO: 'SICRO (DNIT)',
};

/// Tipo de linha da composição analítica.
export const REFERENCE_KIND_LABELS: Record<string, string> = {
  INPUT: 'Insumo',
  COMPOSITION: 'Composição',
  EQUIPMENT: 'Equipamento',
  LABOR: 'Mão de obra',
  MATERIAL: 'Material',
  AUXILIARY: 'Atividade auxiliar',
  FIXED_TIME: 'Tempo fixo',
  TRANSPORT: 'Transporte',
};
