/// Espelha `AUDIT_LOG_MODULES` do backend (apps/api/src/configuracoes/audit-logs)
/// só para exibição — mapeia o `entityType` de cada linha de auditoria de
/// volta para o rótulo de módulo mostrado na tabela.
const ENTITY_TYPE_TO_MODULE: Record<string, string> = {
  ConstructionSite: 'engenharia',
  CostCenter: 'engenharia',
  PurchaseRequest: 'compras',
  PurchaseOrder: 'compras',
  Supplier: 'compras',
  Invoice: 'financeiro',
  AccountPayable: 'financeiro',
  Payment: 'financeiro',
  Employee: 'rh',
  EmployeeAllocation: 'rh',
  TimeEntry: 'rh',
  ProductionEntry: 'rh',
  Payslip: 'rh',
  Contractor: 'terceiros',
  ContractorContract: 'terceiros',
  ContractDocument: 'terceiros',
  ContractEmployee: 'terceiros',
  Company: 'configuracoes',
  User: 'configuracoes',
  Role: 'configuracoes',
  BankAccount: 'dados_bancarios',
};

export function getModuleForEntityType(entityType: string): string {
  return ENTITY_TYPE_TO_MODULE[entityType] ?? entityType;
}
