import type { PrismaClient, Prisma } from '../../../generated/prisma/client';
import { auditContextStorage } from '../audit-context';

/// Modelos cobertos pela auditoria genérica — mesma lista de `entityType`s já
/// referenciada por `AUDIT_LOG_MODULES` (tela de Configurações > Auditoria),
/// menos Company/User/Role, que já são logados manualmente pelos próprios
/// services de Configurações (logar aqui também duplicaria a linha).
const AUDITED_MODELS = new Set([
  'ConstructionSite',
  'CostCenter',
  'Supplier',
  'PurchaseRequest',
  'PurchaseOrder',
  'Invoice',
  'AccountPayable',
  'Payment',
  'Employee',
  'EmployeeAllocation',
  'TimeEntry',
  'ProductionEntry',
  'Payslip',
  'Contractor',
  'ContractorContract',
  'ContractDocument',
  'ContractEmployee',
]);

/// Sempre presentes e nunca relevantes pra um diff visível ao usuário.
const IGNORED_FIELDS = new Set(['id', 'companyId', 'createdAt', 'updatedAt']);

type RawRecord = Record<string, unknown>;

interface FindUniqueDelegate {
  findUnique(args: { where: { id: string } }): Promise<RawRecord | null>;
}

function toDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function getDelegate(client: PrismaClient, model: string): FindUniqueDelegate {
  const delegate = (client as unknown as Record<string, FindUniqueDelegate | undefined>)[
    toDelegateName(model)
  ];
  if (!delegate) {
    throw new Error(`Nenhum delegate Prisma encontrado para o modelo auditado "${model}".`);
  }
  return delegate;
}

function serializeValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (
      new Date(a as string | number | Date).getTime() ===
      new Date(b as string | number | Date).getTime()
    );
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function diffRecords(
  before: RawRecord,
  after: RawRecord,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key) || !(key in before)) continue;
    if (!valuesEqual(before[key], after[key])) {
      changes[key] = { from: serializeValue(before[key]), to: serializeValue(after[key]) };
    }
  }
  return changes;
}

/// Client Extension que grava `AuditLog` automaticamente pra todo
/// create/update de um modelo auditado — nenhum service de domínio precisa
/// saber que isso existe. `base` é o cliente NÃO estendido (recebido de fora,
/// ver `prisma.module.ts`), usado pra ler antes/depois e gravar o log sem
/// recursar de volta nesta mesma extensão.
///
/// Simplificação assumida: só cobre `create`/`update` de nível superior (não
/// `createMany`/`updateMany`/`upsert`/writes aninhados) — cobre o padrão real
/// de escrita usado hoje no projeto (uma chamada por registro).
///
/// Limitação conhecida: as leituras de antes/depois usam `base`, uma conexão
/// separada da transação. Pra updates chamados de dentro de um
/// `$transaction(async (tx) => ...)` (hoje só `purchase-requests.service.ts`
/// e `invoices.service.ts`), a leitura de "depois" pode rodar antes do
/// commit e não ver a mudança — pior caso é nenhum diff ser gravado pra
/// aquela chamada específica (silencioso), nunca um diff errado.
export function createAuditExtension(base: PrismaClient) {
  return {
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (
            !model ||
            !AUDITED_MODELS.has(model) ||
            (operation !== 'create' && operation !== 'update')
          ) {
            return query(args);
          }

          const store = auditContextStorage.getStore();
          if (!store) {
            return query(args);
          }

          if (operation === 'create') {
            const result = await query(args);
            const id = (result as RawRecord | null)?.id;
            if (typeof id === 'string') {
              await base.auditLog.create({
                data: {
                  companyId: store.companyId,
                  userId: store.userId,
                  action: 'CREATE',
                  entityType: model,
                  entityId: id,
                },
              });
            }
            return result;
          }

          const whereId = (args as { where?: { id?: string } })?.where?.id;
          if (!whereId) {
            return query(args);
          }

          const delegate = getDelegate(base, model);
          const before = await delegate.findUnique({ where: { id: whereId } });
          const result = await query(args);
          const after = await delegate.findUnique({ where: { id: whereId } });

          if (before && after) {
            const changes = diffRecords(before, after);
            if (Object.keys(changes).length > 0) {
              await base.auditLog.create({
                data: {
                  companyId: store.companyId,
                  userId: store.userId,
                  action: 'UPDATE',
                  entityType: model,
                  entityId: whereId,
                  changes: changes as Prisma.InputJsonValue,
                },
              });
            }
          }

          return result;
        },
      },
    },
  };
}
