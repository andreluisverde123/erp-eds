/// Catálogo de unidades de medida usado nos itens de solicitação de compra.
///
/// O campo `unit` é `String` livre no banco (`PurchaseRequestItem.unit`), e o
/// seed já gravou abreviações do setor — SC, M2, M3, BR, DIA. Esta lista
/// padroniza a ENTRADA sem exigir migration: registros antigos com uma
/// unidade fora da lista continuam válidos e são preservados na edição
/// (ver `unitOptionsFor`).
export interface MeasurementUnit {
  /// O que vai pro banco. Sempre em caixa alta, sem acento.
  code: string;
  /// Nome por extenso, mostrado na lista suspensa.
  name: string;
}

export const MEASUREMENT_UNITS: MeasurementUnit[] = [
  { code: 'UN', name: 'Unidade' },
  { code: 'PC', name: 'Peça' },
  { code: 'CX', name: 'Caixa' },
  { code: 'PCT', name: 'Pacote' },
  { code: 'SC', name: 'Saco' },
  { code: 'MI', name: 'Milheiro' },
  { code: 'BR', name: 'Barra' },
  { code: 'RL', name: 'Rolo' },
  { code: 'CJ', name: 'Conjunto' },
  { code: 'PAR', name: 'Par' },
  { code: 'M', name: 'Metro linear' },
  { code: 'M2', name: 'Metro quadrado' },
  { code: 'M3', name: 'Metro cúbico' },
  { code: 'KG', name: 'Quilograma' },
  { code: 'TON', name: 'Tonelada' },
  { code: 'L', name: 'Litro' },
  { code: 'GL', name: 'Galão' },
  { code: 'H', name: 'Hora' },
  { code: 'DIA', name: 'Diária' },
  { code: 'MES', name: 'Mês' },
  { code: 'VB', name: 'Verba' },
];

/// Opções a exibir para um valor já gravado. Se a unidade do registro não
/// estiver no catálogo (dado antigo ou digitado pela API), ela entra como uma
/// opção extra no topo — sem isso o select apagaria silenciosamente a unidade
/// do item ao abrir a tela de edição.
export function unitOptionsFor(currentValue: string | undefined): MeasurementUnit[] {
  const value = currentValue?.trim();
  if (!value || MEASUREMENT_UNITS.some((unit) => unit.code === value)) return MEASUREMENT_UNITS;
  return [{ code: value, name: 'unidade cadastrada anteriormente' }, ...MEASUREMENT_UNITS];
}
