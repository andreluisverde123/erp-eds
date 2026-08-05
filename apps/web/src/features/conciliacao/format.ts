/// Formatadores da conciliação. Ficam num arquivo só porque as duas telas do
/// módulo (listagem e comparação) precisam exatamente dos mesmos — repetir a
/// função em cada componente, como o resto do sistema faz, deixaria a
/// formatação de valor divergir entre os dois lados da comparação, que é o
/// único lugar do ERP onde dois números ficam lado a lado para serem
/// confrontados.

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/// Aceita a string que vem do Decimal do Prisma. Valor ausente vira travessão,
/// nunca "R$ 0,00" — zero e "não informado" são coisas diferentes numa nota.
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return formatCurrency(Number(value));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/// CNPJ (14 dígitos) ou CPF (11). Documento com tamanho inesperado é devolvido
/// como veio, em vez de mascarado errado — a nota é um documento fiscal e
/// exibir o número deformado seria pior que exibir cru.
export function formatDocument(document: string): string {
  const digits = document.replace(/\D/g, '');

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return document;
}

/// Quantidade dos itens: até 4 casas, sem zeros à direita inúteis (2,5 em vez
/// de 2,5000).
export function formatQuantity(value: string): string {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}
