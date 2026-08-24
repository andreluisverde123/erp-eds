import { Building2, FileText, ReceiptText, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@repo/ui';

import type { AccountPayableTraceability } from '../types';

/// De onde a despesa veio, dentro da própria listagem de Contas a Pagar.
///
/// Nenhuma tela nova: o Financeiro expande a linha e vê a cadeia
/// obra -> solicitação -> ordem -> NF-e que originou aquele pagamento. Cada
/// elo é um link para a tela que já existe daquele registro; o que não tem
/// tela própria (a Ordem de Compra) leva à listagem dela já filtrada pelo
/// código.
const DEPTH_LABEL: Record<AccountPayableTraceability['depth'], string> = {
  MANUAL: 'Lançamento manual',
  INVOICE: 'NF-e (compra de balcão)',
  PURCHASE_ORDER: 'NF-e com ordem de compra',
  PURCHASE_REQUEST: 'Solicitação da Engenharia',
};

export function AccountPayableOrigin({
  traceability,
}: {
  traceability: AccountPayableTraceability;
}) {
  const { constructionSite, purchaseRequest, purchaseOrder, inboundInvoice, invoice } =
    traceability;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Origem</span>
        <Badge variant={traceability.depth === 'MANUAL' ? 'secondary' : 'info'}>
          {DEPTH_LABEL[traceability.depth]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OriginField
          icon={Building2}
          label="Obra"
          value={constructionSite ? `${constructionSite.code} — ${constructionSite.name}` : null}
          to={constructionSite ? `/engenharia/obras/${constructionSite.id}` : null}
          emptyLabel={traceability.costCenter?.name ?? 'Sem obra'}
        />

        <OriginField
          icon={FileText}
          label="Solicitação"
          value={purchaseRequest?.code ?? null}
          to={purchaseRequest ? `/engenharia/solicitacoes/${purchaseRequest.id}` : null}
        />

        <OriginField
          icon={ShoppingCart}
          label="Ordem de Compra"
          value={purchaseOrder?.code ?? null}
          // A Ordem de Compra não tem tela própria — a listagem É a tela dela
          // (ver o comentário em `purchase-orders-table.tsx`). O link leva a
          // ela já filtrada pelo código.
          to={
            purchaseOrder
              ? `/compras/ordens-de-compra?busca=${encodeURIComponent(purchaseOrder.code)}`
              : null
          }
        />

        <OriginField
          icon={ReceiptText}
          label="NF-e"
          value={documentLabel(inboundInvoice ?? invoice)}
          // A NF-e capturada tem a tela de conciliação; a nota lançada à mão
          // não tem tela própria e fica como texto.
          to={inboundInvoice ? `/financeiro/conciliacao/${inboundInvoice.id}` : null}
        />
      </div>
    </div>
  );
}

function documentLabel(doc: { number: string; series: string | null } | null): string | null {
  if (!doc) return null;
  return doc.series ? `${doc.number}/${doc.series}` : doc.number;
}

function OriginField({
  icon: Icon,
  label,
  value,
  to,
  emptyLabel = '—',
}: {
  icon: typeof Building2;
  label: string;
  value: string | null;
  to: string | null;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      {value === null ? (
        <span className="text-sm text-muted-foreground">{emptyLabel}</span>
      ) : to ? (
        <Link to={to} className="text-sm text-primary underline-offset-4 hover:underline">
          {value}
        </Link>
      ) : (
        <span className="text-sm text-foreground">{value}</span>
      )}
    </div>
  );
}
