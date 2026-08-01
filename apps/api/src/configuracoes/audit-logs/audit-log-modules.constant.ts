/// Mapeia o filtro "Módulo" da tela de Auditoria para os `entityType`
/// gravados em `AuditLog.entityType` por cada módulo. `AuditLog` não guarda
/// o módulo diretamente — é derivado aqui, puramente para leitura/filtro,
/// sem exigir nenhuma mudança nos módulos de domínio existentes.
export const AUDIT_LOG_MODULES: Record<string, string[]> = {
  engenharia: ['ConstructionSite', 'CostCenter'],
  compras: ['PurchaseRequest', 'PurchaseOrder', 'Supplier'],
  financeiro: ['Invoice', 'AccountPayable', 'Payment'],
  rh: ['Employee', 'EmployeeAllocation', 'TimeEntry', 'ProductionEntry', 'Payslip'],
  terceiros: ['Contractor', 'ContractorContract', 'ContractDocument', 'ContractEmployee'],
  configuracoes: ['Company', 'User', 'Role'],
};
