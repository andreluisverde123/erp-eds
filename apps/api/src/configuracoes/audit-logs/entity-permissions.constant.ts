/// Permissão exigida pra ver o histórico de um `entityType` — sempre a mesma
/// permissão que já protege o módulo dono daquele registro (confirmado lendo
/// os controllers reais de cada módulo), nunca uma permissão nova.
const ENTITY_TYPE_PERMISSIONS: Record<string, string> = {
  ConstructionSite: 'engenharia.view',
  CostCenter: 'engenharia.view',
  Supplier: 'compras.view',
  PurchaseRequest: 'compras.view',
  PurchaseOrder: 'compras.view',
  Invoice: 'financeiro.view',
  AccountPayable: 'financeiro.view',
  Payment: 'financeiro.view',
  Employee: 'rh.view',
  EmployeeAllocation: 'rh.view',
  TimeEntry: 'rh.view',
  ProductionEntry: 'rh.view',
  Payslip: 'rh.view',
  Contractor: 'terceiros.view',
  ContractorContract: 'terceiros.view',
  ContractDocument: 'terceiros.view',
  ContractEmployee: 'terceiros.view',
};

export function requiredPermissionForEntity(entityType: string): string | undefined {
  return ENTITY_TYPE_PERMISSIONS[entityType];
}
