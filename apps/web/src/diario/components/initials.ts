/// Iniciais para o avatar: primeira letra do primeiro nome + primeira do
/// último. Fora do componente de cabeçalho porque a tela de Perfil usa a
/// mesma regra, e duas implementações produziriam avatares diferentes para a
/// mesma pessoa em telas vizinhas.
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}
