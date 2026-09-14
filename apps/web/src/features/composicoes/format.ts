/// Formatadores da composição de custo.
///
/// Os valores chegam do servidor como texto com escala fixa ("37.5000",
/// "0.800000"). Estas funções só MOSTRAM — nenhuma conta de custo é refeita no
/// navegador.

/// Custo em reais com no mínimo 2 e no máximo 4 casas: "R$ 37,50" para o
/// comum, "R$ 0,0062" para o item de coeficiente minúsculo, que em duas casas
/// apareceria como um centavo que ele não custa.
export function formatCost(value: string): string {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/// Coeficiente sem zeros à direita inúteis: "0,8" em vez de "0,800000".
export function formatCoefficient(value: string): string {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

/// O valor cru que o `NumberInput` espera: "25.000000" vira "25".
export function toRawDecimal(value: string): string {
  const numero = Number(value);
  return Number.isFinite(numero) ? String(numero) : '';
}
