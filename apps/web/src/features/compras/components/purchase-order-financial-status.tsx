import { Check, Minus, X } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@repo/ui';

import type { PurchaseOrderFinancialStage, PurchaseOrderFinancialStatus } from '../types';

/// Em que ponto do financeiro esta compra está.
///
/// Só EXIBE — não há workflow novo, nem botão que mude nada aqui. Quem compra
/// precisa saber se a nota chegou e se o fornecedor foi pago; alterar conta a
/// pagar, dar baixa ou mexer em vencimento continua no módulo Financeiro,
/// atrás das permissões dele.
const STAGE_LABEL: Record<PurchaseOrderFinancialStage, string> = {
  WITHOUT_INVOICE: 'Aguardando NF',
  INVOICE_RECEIVED: 'NF recebida',
  RECONCILED: 'NF conciliada',
  PAYABLE_CREATED: 'Conta a pagar aberta',
  PAID: 'Pago',
};

const STAGE_VARIANT: Record<PurchaseOrderFinancialStage, 'secondary' | 'info' | 'success'> = {
  WITHOUT_INVOICE: 'secondary',
  INVOICE_RECEIVED: 'info',
  RECONCILED: 'info',
  PAYABLE_CREATED: 'info',
  PAID: 'success',
};

/// Só o estágio, em um badge. Para onde a lista já é densa — a Solicitação
/// mostra várias ordens, e ali o que importa é "chegou até onde?".
export function PurchaseOrderFinancialBadge({ status }: { status: PurchaseOrderFinancialStatus }) {
  return <Badge variant={STAGE_VARIANT[status.stage]}>{STAGE_LABEL[status.stage]}</Badge>;
}

export function PurchaseOrderFinancialStatusPanel({
  status,
}: {
  status: PurchaseOrderFinancialStatus;
}) {
  const { payables } = status;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Financeiro</span>
        <Badge variant={STAGE_VARIANT[status.stage]}>{STAGE_LABEL[status.stage]}</Badge>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Marco titulo="NF recebida" atingido={status.hasInboundInvoice} />
        <Marco titulo="Conciliada" atingido={status.isReconciled} />
        <Marco
          titulo={payables.total > 0 ? `Conta a pagar (${payables.total})` : 'Conta a pagar'}
          atingido={status.hasPayable}
        />
        <Marco
          titulo={
            payables.total > 0 && !status.isFullyPaid
              ? `Pago (${payables.paid}/${payables.total})`
              : 'Pago'
          }
          atingido={status.isFullyPaid}
          // Antes de existir parcela, "pago" nem é uma pergunta: não é um "não",
          // é um "ainda não se aplica".
          naoSeAplica={!status.hasPayable}
        />
      </div>

      {status.inboundInvoices.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">NF-e:</span>
          {status.inboundInvoices.map((nota) => (
            <Link
              key={nota.id}
              to={`/financeiro/conciliacao/${nota.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {nota.series ? `${nota.number}/${nota.series}` : nota.number}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Marco({
  titulo,
  atingido,
  naoSeAplica = false,
}: {
  titulo: string;
  atingido: boolean;
  naoSeAplica?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      {naoSeAplica ? (
        <Minus className="size-4 text-muted-foreground/60" />
      ) : atingido ? (
        <Check className="size-4 text-success" />
      ) : (
        <X className="size-4 text-muted-foreground/60" />
      )}
      <span className={atingido ? 'text-foreground' : 'text-muted-foreground'}>{titulo}</span>
    </span>
  );
}
