/// Cada entityType rastreável pelo workflow pertence a um módulo de negócio
/// já existente — a permissão exigida pra escrever um evento/comentário/anexo
/// nela é a mesma permissão que already protege esse módulo, nunca uma nova.
const ENTITY_TYPE_PERMISSIONS: Record<string, string> = {
  PurchaseRequest: 'compras.view',
  PurchaseOrder: 'compras.view',
  Invoice: 'financeiro.view',
  AccountPayable: 'financeiro.view',
  Employee: 'rh.view',
};

export const ALLOWED_ENTITY_TYPES = Object.keys(ENTITY_TYPE_PERMISSIONS);

export function requiredPermissionFor(entityType: string): string | undefined {
  return ENTITY_TYPE_PERMISSIONS[entityType];
}
