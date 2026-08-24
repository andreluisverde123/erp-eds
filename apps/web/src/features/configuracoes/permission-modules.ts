/// Rótulos de exibição para os módulos que aparecem em `Permission.module` e
/// no filtro de auditoria — puramente de apresentação (o backend usa as
/// mesmas chaves em `AUDIT_LOG_MODULES` e no catálogo de Permissions).
export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  engenharia: 'Engenharia',
  compras: 'Compras',
  financeiro: 'Financeiro',
  rh: 'RH',
  terceiros: 'Terceirizados',
  relatorios: 'Relatórios',
  admin: 'Administração',
  dados_bancarios: 'Dados bancários',
  configuracoes: 'Configurações',
};

export function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}
