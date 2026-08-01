export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

/// `deletedAt` indo de vazio pra uma data é como o soft-delete aparece no
/// diff genérico — não é um `action` de backend à parte, só um estilo
/// diferente de exibição.
export function isSoftDeleteChange(changes: FieldChanges): boolean {
  const deletedAt = changes.deletedAt;
  return Boolean(deletedAt && !deletedAt.from && deletedAt.to);
}
