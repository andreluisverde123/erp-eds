import type { CompensationType, EmploymentType } from './types';

/// Rótulos de vínculo e remuneração do colaborador.
///
/// Um arquivo só, como `employee-status.ts`, para o mesmo motivo: a tela, o
/// filtro e a tabela precisam do MESMO texto, e três listas soltas divergem na
/// primeira mudança de nomenclatura.

export const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'OWN', label: 'Próprio' },
  { value: 'OUTSOURCED', label: 'Terceirizado' },
];

export const COMPENSATION_TYPE_OPTIONS: { value: CompensationType; label: string }[] = [
  { value: 'CLT', label: 'CLT' },
  { value: 'DAILY', label: 'Diarista' },
];

const EMPLOYMENT_LABEL = Object.fromEntries(
  EMPLOYMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<EmploymentType, string>;

const COMPENSATION_LABEL = Object.fromEntries(
  COMPENSATION_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<CompensationType, string>;

export function getEmploymentTypeLabel(tipo: EmploymentType): string {
  return EMPLOYMENT_LABEL[tipo];
}

export function getCompensationTypeLabel(tipo: CompensationType): string {
  return COMPENSATION_LABEL[tipo];
}

/// Se o valor da diária faz sentido para este tipo de remuneração.
///
/// Uma função, e não um `=== 'DAILY'` espalhado: o formulário usa para mostrar
/// o campo, o schema usa para exigir o valor e a tabela usa para decidir entre
/// exibir o valor e exibir um traço. As três respostas têm de ser a mesma.
export function exigeDiaria(tipo: CompensationType): boolean {
  return tipo === 'DAILY';
}
