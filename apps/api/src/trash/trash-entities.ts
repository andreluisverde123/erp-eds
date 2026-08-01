import type { PrismaService } from '../prisma/prisma.service';

/// Registro central do que pode ser restaurado.
///
/// A alternativa era espalhar um `POST /:id/restore` por 17 controllers e uma
/// tela de "excluídos" por módulo. Um catálogo só, com um endpoint só,
/// mantém o custo de adicionar a próxima entidade em quatro linhas — e dá ao
/// usuário UMA tela onde procurar o que sumiu, em vez de dezessete.
export interface TrashEntity {
  /// Nome do modelo no schema (também o valor usado na URL de restauração).
  model: string;
  /// Como o registro aparece na lista de excluídos.
  label: string;
  /// Módulo dono — define as permissões `<módulo>.view` e `<módulo>.manage`.
  module: 'engenharia' | 'compras' | 'financeiro' | 'rh' | 'terceiros';
  /// Campos usados para montar o título do item na tela.
  titleFields: string[];
  /// Filtro de posse. Modelos filhos não têm `companyId` próprio e são
  /// escopados pelo pai — o mesmo padrão já usado nos services.
  scope: (companyId: string) => Record<string, unknown>;
  /// Campo único que o delete "sujou" com o sufixo `__deleted__<id>` para
  /// liberar o valor para reuso (ver `mangleDeletedCode`). Restaurar tem que
  /// desfazer isso — e recusar se alguém já tiver reaproveitado o valor.
  uniqueField?: string;
}

const byCompany = (companyId: string) => ({ companyId });
const byEmployee = (companyId: string) => ({ employee: { companyId } });
const byContract = (companyId: string) => ({ contract: { companyId } });
const byAccountPayable = (companyId: string) => ({ accountPayable: { companyId } });

export const TRASH_ENTITIES: TrashEntity[] = [
  {
    model: 'ConstructionSite',
    label: 'Obra',
    module: 'engenharia',
    titleFields: ['code', 'name'],
    scope: byCompany,
    uniqueField: 'code',
  },
  {
    model: 'CostCenter',
    label: 'Centro de custo',
    module: 'engenharia',
    titleFields: ['code', 'name'],
    scope: byCompany,
    uniqueField: 'code',
  },
  {
    model: 'Supplier',
    label: 'Fornecedor',
    module: 'compras',
    titleFields: ['tradeName', 'legalName'],
    scope: byCompany,
    uniqueField: 'document',
  },
  {
    model: 'PurchaseRequest',
    label: 'Solicitação de compra',
    module: 'compras',
    titleFields: ['code'],
    scope: byCompany,
    uniqueField: 'code',
  },
  {
    model: 'PurchaseOrder',
    label: 'Ordem de compra',
    module: 'compras',
    titleFields: ['code'],
    scope: byCompany,
    uniqueField: 'code',
  },
  {
    model: 'Invoice',
    label: 'Nota fiscal',
    module: 'financeiro',
    titleFields: ['number'],
    scope: byCompany,
    uniqueField: 'number',
  },
  {
    model: 'AccountPayable',
    label: 'Conta a pagar',
    module: 'financeiro',
    titleFields: ['amount'],
    scope: byCompany,
  },
  {
    model: 'Payment',
    label: 'Pagamento',
    module: 'financeiro',
    titleFields: ['amount'],
    scope: byAccountPayable,
  },
  {
    model: 'Employee',
    label: 'Funcionário',
    module: 'rh',
    titleFields: ['name'],
    scope: byCompany,
    uniqueField: 'cpf',
  },
  {
    model: 'EmployeeAllocation',
    label: 'Alocação',
    module: 'rh',
    titleFields: [],
    scope: byEmployee,
  },
  {
    model: 'TimeEntry',
    label: 'Apontamento de ponto',
    module: 'rh',
    titleFields: [],
    scope: byEmployee,
  },
  {
    model: 'ProductionEntry',
    label: 'Apontamento de produção',
    module: 'rh',
    titleFields: ['description'],
    scope: byEmployee,
  },
  {
    model: 'Payslip',
    label: 'Holerite',
    module: 'rh',
    titleFields: ['referenceMonth', 'referenceYear'],
    scope: byEmployee,
  },
  {
    model: 'Contractor',
    label: 'Terceirizado',
    module: 'terceiros',
    titleFields: ['tradeName', 'legalName'],
    scope: byCompany,
    uniqueField: 'document',
  },
  {
    model: 'ContractorContract',
    label: 'Contrato',
    module: 'terceiros',
    titleFields: ['code'],
    scope: byCompany,
  },
  {
    model: 'ContractDocument',
    label: 'Documento de contrato',
    module: 'terceiros',
    titleFields: ['name'],
    scope: byContract,
  },
  {
    model: 'ContractEmployee',
    label: 'Funcionário terceirizado',
    module: 'terceiros',
    titleFields: ['name'],
    scope: byContract,
  },
];

export function findTrashEntity(model: string): TrashEntity | undefined {
  return TRASH_ENTITIES.find((entity) => entity.model === model);
}

/// Delegate do Prisma para um modelo do catálogo (`ConstructionSite` →
/// `prisma.constructionSite`).
export interface SoftDeletableDelegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  update(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
}

export function delegateFor(prisma: PrismaService, model: string): SoftDeletableDelegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (prisma as unknown as Record<string, SoftDeletableDelegate | undefined>)[key];
  if (!delegate) {
    throw new Error(`Nenhum delegate Prisma encontrado para o modelo "${model}".`);
  }
  return delegate;
}
