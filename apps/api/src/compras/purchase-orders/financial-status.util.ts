import type {
  AccountPayableStatus,
  InboundInvoiceStatus,
  InvoiceStatus,
} from '../../../generated/prisma/client';

/// Situação financeira de uma ordem de compra.
///
/// Camada PURA e, mais importante, camada DERIVADA: não existe status
/// financeiro novo, nem coluna nova em `PurchaseOrder`. Cada estágio é lido do
/// que os módulos do financeiro já gravam — a NF-e capturada, a conciliação, a
/// conta a pagar e a baixa. Guardar isso numa coluna criaria um segundo lugar
/// para a verdade, que divergiria no primeiro pagamento registrado por outra
/// tela.
///
/// Para que serve: a Engenharia abre a ordem e vê em que ponto a compra dela
/// está, sem precisar de acesso ao módulo Financeiro nem de perguntar.

/// Os cinco pontos do caminho, na ordem em que acontecem. Cada um pressupõe o
/// anterior — `PAID` implica conta a pagar, que implica conciliação, e assim
/// por diante.
export type PurchaseOrderFinancialStage =
  'WITHOUT_INVOICE' | 'INVOICE_RECEIVED' | 'RECONCILED' | 'PAYABLE_CREATED' | 'PAID';

export interface PurchaseOrderFinancialStatus {
  stage: PurchaseOrderFinancialStage;
  /// A NF-e chegou (capturada da SEFAZ ou lançada), esteja conciliada ou não.
  hasInboundInvoice: boolean;
  /// Alguma nota recebida já foi conciliada com esta ordem.
  isReconciled: boolean;
  hasPayable: boolean;
  /// TODAS as parcelas em aberto foram baixadas. Uma parcela paga de três não
  /// torna a compra paga.
  isFullyPaid: boolean;
  payables: {
    total: number;
    open: number;
    paid: number;
    cancelled: number;
  };
  /// Documentos ligados à ordem, para a tela conseguir linkar. Só
  /// identificação — nenhum valor monetário que a ordem já não mostre.
  invoices: { id: string; number: string; series: string | null; status: InvoiceStatus }[];
  inboundInvoices: {
    id: string;
    number: string;
    series: string | null;
    status: InboundInvoiceStatus;
    reconciled: boolean;
  }[];
}

export interface FinancialSourceInvoice {
  id: string;
  number: string;
  series: string | null;
  status: InvoiceStatus;
  accountsPayable: { status: AccountPayableStatus }[];
}

export interface FinancialSourceInboundInvoice {
  id: string;
  number: string;
  series: string | null;
  status: InboundInvoiceStatus;
  reconciledAt: Date | null;
}

export function buildFinancialStatus(
  invoices: FinancialSourceInvoice[],
  inboundInvoices: FinancialSourceInboundInvoice[],
): PurchaseOrderFinancialStatus {
  const parcelas = invoices.flatMap((invoice) => invoice.accountsPayable);

  const payables = {
    total: parcelas.length,
    open: parcelas.filter((parcela) => parcela.status === 'OPEN').length,
    paid: parcelas.filter((parcela) => parcela.status === 'PAID').length,
    cancelled: parcelas.filter((parcela) => parcela.status === 'CANCELLED').length,
  };

  const hasInboundInvoice = inboundInvoices.length > 0;
  // A `Invoice` só existe porque houve conciliação (ou lançamento manual da
  // nota), então ela também prova o vínculo — a nota capturada é o caminho
  // novo, o lançamento manual é o antigo, e os dois chegam aqui.
  const isReconciled =
    invoices.length > 0 || inboundInvoices.some((nota) => nota.reconciledAt !== null);
  const hasPayable = payables.total > 0;

  // Parcela cancelada não espera pagamento: uma compra com 2 pagas e 1
  // cancelada está paga. O que impede é parcela EM ABERTO.
  const pendentes = payables.total - payables.paid - payables.cancelled;
  const isFullyPaid = hasPayable && payables.paid > 0 && pendentes === 0;

  return {
    stage: isFullyPaid
      ? 'PAID'
      : hasPayable
        ? 'PAYABLE_CREATED'
        : isReconciled
          ? 'RECONCILED'
          : hasInboundInvoice
            ? 'INVOICE_RECEIVED'
            : 'WITHOUT_INVOICE',
    hasInboundInvoice,
    isReconciled,
    hasPayable,
    isFullyPaid,
    payables,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      series: invoice.series,
      status: invoice.status,
    })),
    inboundInvoices: inboundInvoices.map((nota) => ({
      id: nota.id,
      number: nota.number,
      series: nota.series,
      status: nota.status,
      reconciled: nota.reconciledAt !== null,
    })),
  };
}
