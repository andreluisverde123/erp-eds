import type { Prisma } from '../../../../generated/prisma/client';
import {
  buildCompanyHeader,
  field,
  formatCurrency,
  formatDate,
  formatDocument,
  formatPhone,
  formatQuantity,
  formatZipCode,
  joinAddress,
  type CompanySource,
  type DocumentColumn,
  type PrintableDocument,
} from '../../../common/pdf/printable-document';

/// Montagem do conteúdo do PDF da Ordem de Compra.
///
/// Só o que é ESPECÍFICO da ordem mora aqui: quais campos entram em cada
/// bloco, como cada linha da tabela é formatada e o que conta como origem do
/// item. Formatação de moeda/data/documento e o desenho da página são
/// compartilhados — ver `common/pdf/`.

export {
  formatCurrency,
  formatDate,
  formatDocument,
  formatPhone,
  formatQuantity,
  formatZipCode,
  joinAddress,
};
export type { CompanySource };

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  ISSUED: 'Emitida',
  RECEIVED: 'Recebida',
  CANCELLED: 'Cancelada',
};

/// Espelha os rótulos da tela (`features/compras/purchase-order-status.ts`).
/// O documento impresso e a tela têm de chamar o mesmo status pelo mesmo nome.
export function formatStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/// Larguras da tabela de itens, em proporção da largura útil. Somam 1.
/// Descrição fica com quase metade porque é a única coluna que quebra em
/// várias linhas; as demais têm tamanho previsível.
export const PURCHASE_ORDER_COLUMNS: readonly DocumentColumn[] = [
  { key: 'description', label: 'Descrição', width: 0.4, align: 'left' },
  { key: 'quantity', label: 'Qtd.', width: 0.09, align: 'right' },
  { key: 'unit', label: 'Un.', width: 0.07, align: 'left' },
  { key: 'unitPrice', label: 'Valor Unit.', width: 0.14, align: 'right' },
  { key: 'totalPrice', label: 'Valor Total', width: 0.15, align: 'right' },
  { key: 'origin', label: 'Origem', width: 0.15, align: 'left', muted: true },
];

/// Formato mínimo que o documento precisa da ordem. Declarado à parte do tipo
/// gerado pelo Prisma para o builder poder ser testado sem montar um payload
/// de banco inteiro.
export interface PurchaseOrderSource {
  code: string;
  status: string;
  issueDate: Date;
  expectedDeliveryDate: Date | null;
  totalAmount: Prisma.Decimal;
  supplier: {
    legalName: string;
    tradeName: string | null;
    document: string;
    stateRegistration: string | null;
    address: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    email: string | null;
  };
  purchaseRequest: { code: string; notes: string | null };
  constructionSite: { code: string; name: string } | null;
  costCenter: { code: string; name: string };
  items: {
    description: string;
    unit: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
    notes: string | null;
    purchaseRequestItem: {
      quantity: Prisma.Decimal;
      unit: string;
      purchaseRequest: { code: string };
    };
  }[];
}

export function buildPurchaseOrderDocument(
  order: PurchaseOrderSource,
  company: CompanySource,
): PrintableDocument {
  const supplierAddress = joinAddress([
    order.supplier.address,
    order.supplier.addressNumber,
    order.supplier.addressComplement,
    order.supplier.neighborhood,
    joinAddress([order.supplier.city, order.supplier.state]),
    formatZipCode(order.supplier.zipCode),
  ]);

  return {
    ...buildCompanyHeader(company),
    title: 'ORDEM DE COMPRA',
    code: order.code,
    blocks: [
      {
        title: 'ORDEM DE COMPRA',
        fields: [
          { label: 'Número', value: order.code },
          { label: 'Emissão', value: formatDate(order.issueDate) },
          { label: 'Status', value: formatStatus(order.status) },
          ...(order.expectedDeliveryDate
            ? field('Previsão de entrega', formatDate(order.expectedDeliveryDate))
            : []),
        ],
      },
      {
        title: 'FORNECEDOR',
        fields: [
          { label: 'Razão social', value: order.supplier.legalName },
          ...(order.supplier.tradeName && order.supplier.tradeName !== order.supplier.legalName
            ? field('Nome fantasia', order.supplier.tradeName)
            : []),
          ...field('CNPJ', formatDocument(order.supplier.document)),
          ...field('Inscrição estadual', order.supplier.stateRegistration),
          ...field('Endereço', supplierAddress),
          ...field('Telefone', formatPhone(order.supplier.phone)),
          ...field('E-mail', order.supplier.email),
        ],
      },
    ],
    columns: PURCHASE_ORDER_COLUMNS,
    rows: order.items.map((item) => {
      const comprada = Number(item.quantity);
      const solicitada = Number(item.purchaseRequestItem.quantity);
      const origem = item.purchaseRequestItem.purchaseRequest.code;

      return {
        description: item.notes ? `${item.description}\n${item.notes}` : item.description,
        quantity: formatQuantity(item.quantity),
        unit: item.unit,
        unitPrice: formatCurrency(item.unitPrice),
        totalPrice: formatCurrency(item.totalPrice),
        // A divergência entre pedido e comprado é impressa: é a informação
        // que o fornecedor e o almoxarife vão conferir na entrega.
        origin:
          comprada === solicitada
            ? origem
            : `${origem} (solic. ${formatQuantity(item.purchaseRequestItem.quantity)} ${item.purchaseRequestItem.unit})`,
      };
    }),
    emptyRowsMessage: 'Esta ordem não tem itens detalhados.',
    total: {
      label: 'TOTAL DA ORDEM DE COMPRA',
      value: formatCurrency(order.totalAmount),
      caption: 'Total calculado automaticamente a partir dos itens desta ordem.',
    },
    /// Observações da solicitação de origem. A ordem de compra NÃO tem campo
    /// próprio de observação no modelo atual.
    notes: order.purchaseRequest.notes?.trim()
      ? { title: 'OBSERVAÇÕES', text: order.purchaseRequest.notes.trim() }
      : null,
    footer: {
      title: 'ORIGEM DA COMPRA',
      fields: [
        { label: 'Solicitação de origem', value: order.purchaseRequest.code },
        ...field(
          'Obra',
          order.constructionSite
            ? `${order.constructionSite.code} — ${order.constructionSite.name}`
            : null,
        ),
        { label: 'Centro de custo', value: `${order.costCenter.code} — ${order.costCenter.name}` },
      ],
    },
  };
}
