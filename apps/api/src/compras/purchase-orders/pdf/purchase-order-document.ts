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
  siteAddress,} from '../../../common/pdf/printable-document';

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
  { key: 'unitPrice', label: 'Valor Unit.', width: 0.13, align: 'right' },
  /// O desconto da LINHA é impresso. O fornecedor confere o total contra o
  /// preço unitário; sem esta coluna, `10 × 25,50 = 229,50` parece erro de
  /// conta no documento que vai para ele.
  { key: 'discount', label: 'Desc.', width: 0.09, align: 'right' },
  { key: 'totalPrice', label: 'Valor Total', width: 0.14, align: 'right' },
  { key: 'origin', label: 'Origem', width: 0.14, align: 'left', muted: true },
];

/// Formato mínimo que o documento precisa da ordem. Declarado à parte do tipo
/// gerado pelo Prisma para o builder poder ser testado sem montar um payload
/// de banco inteiro.
export interface PurchaseOrderSource {
  code: string;
  status: string;
  issueDate: Date;
  expectedDeliveryDate: Date | null;
  discountType: 'AMOUNT' | 'PERCENT';
  discountValue: Prisma.Decimal;
  /// Quem emitiu. `null` nas ordens anteriores ao campo — a linha de
  /// assinatura sai sem nome em vez de atribuída a alguém que não a emitiu.
  createdBy: { name: string } | null;
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
  constructionSite: {
    code: string;
    name: string;
    /// ENDEREÇO DE ENTREGA. O motivo de a obra ter endereço: o documento vai
    /// ao fornecedor, e ele precisa saber onde descarregar.
    addressLine: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  } | null;
  /// Opcional: a ordem pode sair sem atribuição de custo quando a
  /// solicitação de origem também não tinha.
  costCenter: { code: string; name: string } | null;
  items: {
    description: string;
    unit: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discountType: 'AMOUNT' | 'PERCENT';
    discountValue: Prisma.Decimal;
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
  /// Bytes do logo, já lidos pelo service. Opcional: documento sem logo é o
  /// caso normal de empresa que não cadastrou marca.
  companyLogo?: Buffer | null,
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
    ...buildCompanyHeader(company, companyLogo),
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
        discount: formatDiscount(item.discountType, item.discountValue),
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
      // O desconto geral é DITO no documento. Um total menor que a soma da
      // coluna acima, sem explicação impressa, é o tipo de número que o
      // fornecedor contesta — e com razão.
      caption: descreverDescontoGeral(order.discountType, order.discountValue),
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
        // O ENDEREÇO DE ENTREGA, logo abaixo da obra que ele localiza. Some
        // quando a obra não tem endereço cadastrado — um rótulo "Entregar em:"
        // seguido de nada seria pior que a ausência.
        ...field('Entregar em', siteAddress(order.constructionSite)),
        // Sem centro de custo a LINHA some, em vez de sair com um traço: numa
        // lista de origem, um campo vazio parece dado que faltou carregar.
        ...(order.costCenter
          ? [
              {
                label: 'Centro de custo',
                value: `${order.costCenter.code} — ${order.costCenter.name}`,
              },
            ]
          : []),
      ],
    },

    /// Duas linhas: quem emitiu e o fornecedor.
    ///
    /// A ordem de compra é o documento que compromete o dinheiro, e quem a
    /// assina precisa estar identificado — antes disso o PDF saía sem dono, e
    /// o fornecedor recebia um pedido que não dizia de quem partiu.
    ///
    /// O nome NÃO é assinatura: é a identificação de quem assina sobre a
    /// linha, à mão. O sistema não tem assinatura eletrônica, e imprimir
    /// "assinado digitalmente" seria afirmar algo que não aconteceu.
    signatures: [
      { role: 'Responsável pela emissão', name: order.createdBy?.name ?? null },
      { role: 'Fornecedor — ciente do pedido' },
    ],
  };
}

/// Desconto de uma linha, como ele aparece na coluna estreita. Vazio quando não
/// há: um "R$ 0,00" repetido em toda linha só polui a tabela.
function formatDiscount(tipo: 'AMOUNT' | 'PERCENT', valor: Prisma.Decimal): string {
  if (Number(valor) <= 0) return '';
  return tipo === 'PERCENT' ? `${Number(valor)}%` : formatCurrency(valor);
}

/// A legenda abaixo do total. Diz de onde veio o abatimento quando ele existe,
/// e volta à explicação genérica quando não.
function descreverDescontoGeral(tipo: 'AMOUNT' | 'PERCENT', valor: Prisma.Decimal): string {
  if (Number(valor) <= 0) {
    return 'Total calculado automaticamente a partir dos itens desta ordem.';
  }

  const descrito = tipo === 'PERCENT' ? `${Number(valor)}%` : formatCurrency(valor);
  return `Inclui desconto geral de ${descrito} sobre o subtotal dos itens já líquido dos descontos de linha.`;
}
