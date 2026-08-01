import type { UserRoleType } from '../../../generated/prisma/client';

/// Catálogo de permissões e papéis padrão de um tenant.
///
/// Fonte única para os DOIS caminhos que criam uma empresa: o seed
/// (`prisma/seed.ts`, ambiente local) e o onboarding self-service
/// (`src/onboarding/`). Antes de existir este arquivo só havia o seed — se o
/// onboarding tivesse a própria cópia, empresas criadas pelo cadastro
/// nasceriam com papéis diferentes das criadas localmente, e a diferença só
/// apareceria em produção.
export interface PermissionSeed {
  code: string;
  module: string;
  action: string;
  description: string;
}

export interface RoleTemplate {
  name: string;
  type: UserRoleType;
  description: string;
  permissionCodes: string[];
}

/// Cada módulo de negócio tem DUAS permissões: `view` (consultar) e `manage`
/// (criar, editar, excluir). Antes existia uma só por módulo — `<módulo>.access`
/// — e quem podia abrir a tela podia mexer em tudo; não havia como ter um
/// mestre de obra que lança apontamento sem também aprovar compra.
///
/// `dashboard.view` continua sendo a chave de leitura das telas transversais
/// (home, busca global e Processos), não de um módulo específico.
export const DEFAULT_PERMISSIONS: PermissionSeed[] = [
  {
    code: 'dashboard.view',
    module: 'dashboard',
    action: 'view',
    description: 'Ver a home, a busca global e as telas de Processos.',
  },
  {
    code: 'engenharia.view',
    module: 'engenharia',
    action: 'view',
    description: 'Consultar obras e centros de custo.',
  },
  {
    code: 'engenharia.manage',
    module: 'engenharia',
    action: 'manage',
    description: 'Criar, editar e excluir obras e centros de custo.',
  },
  {
    code: 'compras.view',
    module: 'compras',
    action: 'view',
    description: 'Consultar solicitações, ordens de compra e fornecedores.',
  },
  /// Separada de `compras.manage` porque quem PEDE não é quem COMPRA: a
  /// Engenharia abre a solicitação e manda para o setor de Compras, mas não
  /// cota, não aprova, não emite ordem e não mexe em fornecedor. Dar
  /// `compras.manage` à Engenharia só para ela conseguir solicitar deixaria
  /// o engenheiro aprovando o próprio pedido — e a alçada por valor viraria
  /// decoração.
  {
    code: 'compras.request',
    module: 'compras',
    action: 'request',
    description: 'Abrir solicitações de compra, editá-las em rascunho e enviá-las para Compras.',
  },
  {
    code: 'compras.manage',
    module: 'compras',
    action: 'manage',
    description: 'Cotar, aprovar, excluir solicitações e gerir ordens de compra e fornecedores.',
  },
  {
    code: 'financeiro.view',
    module: 'financeiro',
    action: 'view',
    description: 'Consultar notas fiscais, contas a pagar e pagamentos.',
  },
  {
    code: 'financeiro.manage',
    module: 'financeiro',
    action: 'manage',
    description: 'Lançar e alterar notas fiscais, contas a pagar e pagamentos.',
  },
  {
    code: 'rh.view',
    module: 'rh',
    action: 'view',
    description: 'Consultar funcionários, ponto, produção e holerites.',
  },
  {
    code: 'rh.manage',
    module: 'rh',
    action: 'manage',
    description: 'Cadastrar e alterar funcionários, ponto, produção e holerites.',
  },
  {
    code: 'terceiros.view',
    module: 'terceiros',
    action: 'view',
    description: 'Consultar terceirizados, contratos e documentação.',
  },
  {
    code: 'terceiros.manage',
    module: 'terceiros',
    action: 'manage',
    description: 'Cadastrar e alterar terceirizados, contratos e documentação.',
  },
  {
    code: 'compras.approve',
    module: 'compras',
    action: 'approve',
    description: 'Aprovar solicitações de compra acima da alçada definida em Configurações.',
  },
  {
    code: 'financeiro.approve',
    module: 'financeiro',
    action: 'approve',
    description: 'Registrar pagamentos acima da alçada definida em Configurações.',
  },
  {
    code: 'admin.manage_users',
    module: 'admin',
    action: 'manage_users',
    description: 'Gerenciar usuários, papéis e permissões do sistema.',
  },
  {
    code: 'relatorios.view',
    module: 'relatorios',
    action: 'view',
    description: 'Ver relatórios e indicadores executivos de todos os módulos.',
  },
];

/// Presente em todo papel: home, busca global, telas de Processos e os
/// relatórios executivos.
const BASE_PERMISSIONS = ['dashboard.view', 'relatorios.view'];

/// O primeiro usuário de uma empresa nova sempre recebe este papel.
export const ADMIN_ROLE_NAME = 'Administrador';

export const DEFAULT_ROLES: RoleTemplate[] = [
  {
    name: ADMIN_ROLE_NAME,
    type: 'ADMIN',
    description: 'Acesso total ao sistema, incluindo administração de usuários e papéis.',
    permissionCodes: DEFAULT_PERMISSIONS.map((permission) => permission.code),
  },
  // Cada papel operacional enxerga o PRÓPRIO módulo mais o que precisa para
  // trabalhar — e nada além disso. As dependências abaixo não são estéticas:
  // sem elas, formulários do dia a dia ficam sem opção para escolher.
  {
    name: 'Engenharia',
    type: 'ENGINEER',
    description: 'Time de engenharia: obras, centros de custo e terceirizados.',
    permissionCodes: [
      ...BASE_PERMISSIONS,
      'engenharia.view',
      'engenharia.manage',
      'terceiros.view',
      'terceiros.manage',
      // Abre a solicitação e manda para o setor de Compras — é o engenheiro
      // quem pede. Acompanha o resto do processo, mas não conduz: cotação,
      // aprovação e ordem de compra exigem `compras.manage`.
      'compras.view',
      'compras.request',
    ],
  },
  {
    name: 'Compras',
    type: 'BUYER',
    description: 'Time de compras: requisições, ordens de compra e fornecedores.',
    permissionCodes: [
      ...BASE_PERMISSIONS,
      'compras.view',
      'compras.request',
      'compras.manage',
      // A solicitação de compra exige escolher o centro de custo.
      'engenharia.view',
    ],
  },
  {
    name: 'Financeiro',
    type: 'FINANCE_ANALYST',
    description: 'Time financeiro: contas a pagar, notas fiscais e pagamentos.',
    permissionCodes: [
      ...BASE_PERMISSIONS,
      'financeiro.view',
      'financeiro.manage',
      // A nota fiscal é lançada a partir de uma ordem de compra.
      'compras.view',
    ],
  },
  {
    name: 'RH',
    type: 'HR_ANALYST',
    description: 'Time de recursos humanos: funcionários, ponto, produção e holerites.',
    permissionCodes: [
      ...BASE_PERMISSIONS,
      'rh.view',
      'rh.manage',
      // Alocar funcionário e apontar produção exigem escolher a obra.
      'engenharia.view',
    ],
  },
  {
    name: 'Diretoria',
    type: 'VIEWER',
    description: 'Visão executiva de todos os módulos operacionais, com alçada de aprovação.',
    permissionCodes: [
      ...BASE_PERMISSIONS,
      'engenharia.view',
      'engenharia.manage',
      'compras.view',
      'compras.request',
      'compras.manage',
      'financeiro.view',
      'financeiro.manage',
      'rh.view',
      'rh.manage',
      'terceiros.view',
      'terceiros.manage',
      'compras.approve',
      'financeiro.approve',
    ],
  },
];
