import type {
  AccountPayableStatus,
  EmployeeStatus,
  InvoiceStatus,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
} from '../../../generated/prisma/client';

export type ComprasStage =
  'SOLICITACAO' | 'COTACAO' | 'APROVACAO' | 'ORDEM' | 'RECEBIMENTO' | 'FINANCEIRO' | 'CANCELADO';
export type FinanceiroStage =
  'NOTA' | 'CONFERENCIA_APROVACAO' | 'PAGAMENTO' | 'BAIXA' | 'CANCELADO';
export type RhStage = 'CADASTRO' | 'ALOCACAO' | 'PRODUCAO' | 'DESLIGAMENTO';

export const COMPRAS_STAGE_ORDER: ComprasStage[] = [
  'SOLICITACAO',
  'COTACAO',
  'APROVACAO',
  'ORDEM',
  'RECEBIMENTO',
  'FINANCEIRO',
];
export const FINANCEIRO_STAGE_ORDER: FinanceiroStage[] = [
  'NOTA',
  'CONFERENCIA_APROVACAO',
  'PAGAMENTO',
  'BAIXA',
];
export const RH_STAGE_ORDER: RhStage[] = ['CADASTRO', 'ALOCACAO', 'PRODUCAO', 'DESLIGAMENTO'];

interface PurchaseOrderForStage {
  status: PurchaseOrderStatus;
  invoices: { status: InvoiceStatus }[];
}

/// Etapa atual = o maior rank entre o status da requisição, de cada ordem de
/// compra vinculada (não cancelada) e de cada nota vinculada a essas ordens.
/// CANCELLED na requisição é terminal e sobrepõe qualquer coisa.
export function deriveComprasStage(
  request: { status: PurchaseRequestStatus },
  purchaseOrders: PurchaseOrderForStage[],
): ComprasStage {
  if (request.status === 'CANCELLED') return 'CANCELADO';

  let rank = request.status === 'QUOTING' ? 2 : request.status === 'APPROVED' ? 3 : 1;

  for (const order of purchaseOrders) {
    if (order.status === 'CANCELLED') continue;
    rank = Math.max(rank, order.status === 'RECEIVED' ? 5 : 4);

    for (const invoice of order.invoices) {
      if (invoice.status === 'CANCELLED') continue;
      rank = Math.max(rank, 6);
    }
  }

  return COMPRAS_STAGE_ORDER[rank - 1] ?? 'SOLICITACAO';
}

/// Conferência e Aprovação colapsam numa única transição real
/// (RECEIVED→VALIDATED) — o schema não tem estado intermediário entre elas.
export function deriveFinanceiroStage(
  invoice: { status: InvoiceStatus },
  accountPayables: { status: AccountPayableStatus }[],
): FinanceiroStage {
  if (invoice.status === 'CANCELLED') return 'CANCELADO';

  let rank = invoice.status === 'VALIDATED' ? 2 : 1;

  for (const accountPayable of accountPayables) {
    if (accountPayable.status === 'CANCELLED') continue;
    rank = Math.max(rank, accountPayable.status === 'PAID' ? 4 : 3);
  }

  return FINANCEIRO_STAGE_ORDER[rank - 1] ?? 'NOTA';
}

/// Alocação/Produção significam "já teve algum registro alguma vez", não
/// "está alocado agora"/"produziu hoje" — VACATION/ON_LEAVE não empurram a
/// etapa (ficam só como uma "situação atual" separada, exibida no frontend).
export function deriveRhStage(
  employee: { status: EmployeeStatus },
  hasAllocation: boolean,
  hasProduction: boolean,
): RhStage {
  if (employee.status === 'TERMINATED') return 'DESLIGAMENTO';
  if (hasProduction) return 'PRODUCAO';
  if (hasAllocation) return 'ALOCACAO';
  return 'CADASTRO';
}
