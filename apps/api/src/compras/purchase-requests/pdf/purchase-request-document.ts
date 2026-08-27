import type { Prisma } from '../../../../generated/prisma/client';
import {
  buildCompanyHeader,
  field,
  formatCurrency,
  formatDate,
  formatQuantity,
  type CompanySource,
  type DocumentColumn,
  type PrintableDocument,
} from '../../../common/pdf/printable-document';
import {
  calculateItemTotals,
  calculateQuoteTotals,
  isQuoted,
  type DiscountType,
} from '../quote-totals';

/// Montagem do conteúdo do PDF da Solicitação de Compra.
///
/// Mesma divisão do documento da Ordem: aqui só o que é específico da
/// solicitação; o desenho da página, o cabeçalho da empresa e os formatadores
/// vêm de `common/pdf/`. O documento impresso precisa parecer parte do mesmo
/// sistema, e isso não se garante copiando estilo — se garante usando o mesmo
/// renderizador.

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  QUOTING: 'Em Cotação',
  APPROVED: 'Aprovada',
  CANCELLED: 'Cancelada',
};

/// Espelha os rótulos da tela (`features/compras/purchase-request-status.ts`).
/// O documento impresso e a tela têm de chamar o mesmo status pelo mesmo nome.
export function formatStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/// A numeração da linha ganha uma coluna própria porque o documento é lido em
/// voz alta na obra ("confere o item 3") — sem ela, a conferência é por
/// descrição, que é longa e se repete.
///
/// Valor unitário e subtotal existem porque a cotação vive NA solicitação
/// (não há entidade de cotação separada — ver regra C-3): omiti-los faria o
/// papel valer menos que a tela. Ficam em "—" enquanto ninguém cotou.
export const PURCHASE_REQUEST_COLUMNS: readonly DocumentColumn[] = [
  { key: 'index', label: 'Item', width: 0.05, align: 'right', muted: true },
  { key: 'description', label: 'Descrição', width: 0.35, align: 'left' },
  { key: 'quantity', label: 'Qtd.', width: 0.09, align: 'right' },
  { key: 'unit', label: 'Un.', width: 0.07, align: 'left' },
  { key: 'unitPrice', label: 'Valor Unit.', width: 0.14, align: 'right' },
  { key: 'discount', label: 'Desconto', width: 0.14, align: 'right', muted: true },
  { key: 'totalPrice', label: 'Total', width: 0.16, align: 'right' },
];

/// Formato mínimo que o documento precisa da solicitação. Declarado à parte do
/// tipo gerado pelo Prisma para o builder poder ser testado sem montar um
/// payload de banco inteiro.
export interface PurchaseRequestSource {
  code: string;
  status: string;
  createdAt: Date;
  neededBy: Date | null;
  notes: string | null;
  /// Desconto GERAL da cotação, sobre o subtotal já líquido dos descontos de
  /// item. Ver `quote-totals.ts`.
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
  requestedBy: { name: string };
  constructionSite: { code: string; name: string } | null;
  costCenter: { code: string; name: string } | null;
  items: {
    description: string;
    unit: string;
    quantity: Prisma.Decimal;
    estimatedUnitPrice: Prisma.Decimal | null;
    notes: string | null;
    unavailable: boolean;
    unavailabilityNote: string | null;
    discountType: DiscountType;
    discountValue: Prisma.Decimal;
  }[];
}

export function buildPurchaseRequestDocument(
  request: PurchaseRequestSource,
  company: CompanySource,
): PrintableDocument {
  const cotados = request.items.filter(isQuoted);
  const indisponiveis = request.items.filter((item) => item.unavailable).length;

  // A MESMA conta do service e da tela — uma função só, em `quote-totals.ts`.
  // Reimplementá-la aqui produziria um papel que discorda do sistema no dia
  // em que alguém mudasse a ordem dos descontos num dos dois lugares.
  const totals = calculateQuoteTotals(request.items, {
    type: request.discountType,
    value: request.discountValue,
  });

  return {
    ...buildCompanyHeader(company),
    title: 'SOLICITAÇÃO DE COMPRA',
    code: request.code,
    blocks: [
      {
        title: 'SOLICITAÇÃO',
        fields: [
          { label: 'Número', value: request.code },
          { label: 'Abertura', value: formatDate(request.createdAt) },
          { label: 'Status', value: formatStatus(request.status) },
          ...(request.neededBy ? field('Necessário até', formatDate(request.neededBy)) : []),
        ],
      },
      {
        title: 'DESTINO',
        fields: [
          { label: 'Solicitante', value: request.requestedBy.name },
          ...field(
            'Obra',
            request.constructionSite
              ? `${request.constructionSite.code} — ${request.constructionSite.name}`
              : null,
          ),
          // Opcional na solicitação: quem pede pode não saber em qual centro
          // de custo o material entra, e Compras define isso na emissão da
          // Ordem. Ausente, a linha simplesmente não aparece.
          ...field(
            'Centro de custo',
            request.costCenter ? `${request.costCenter.code} — ${request.costCenter.name}` : null,
          ),
        ],
      },
    ],
    columns: PURCHASE_REQUEST_COLUMNS,
    rows: request.items.map((item, index) => {
      const cotado = isQuoted(item);
      const linha = calculateItemTotals(item);

      return {
        index: String(index + 1),
        description: buildDescription(item),
        quantity: formatQuantity(item.quantity),
        unit: item.unit,
        // Traço, não "R$ 0,00": zero é preço (brinde), ausência é ausência.
        unitPrice: cotado ? formatCurrency(item.estimatedUnitPrice!) : '—',
        // O desconto sai com o SINAL e, quando foi informado em porcentagem,
        // com ela ao lado — o papel precisa dizer o que foi combinado, não só
        // quanto deu.
        discount: linha.discount.isZero()
          ? '—'
          : `- ${formatCurrency(linha.discount)}${
              item.discountType === 'PERCENT' ? ` (${formatPercent(item.discountValue)})` : ''
            }`,
        totalPrice: cotado ? formatCurrency(linha.net) : '—',
      };
    }),
    emptyRowsMessage: 'Esta solicitação não tem itens.',
    total: {
      label: 'TOTAL COTADO',
      // Zerado significa "ainda não cotado", não "de graça" — imprimir
      // R$ 0,00 aqui leria como erro de cálculo. Mesma decisão da tela.
      value: cotados.length > 0 ? formatCurrency(totals.total) : 'Aguardando cotação',
      // As etapas só aparecem quando há desconto: sem eles, "subtotal" e
      // "total" seriam o mesmo número impresso duas vezes.
      lines:
        cotados.length > 0 && (!totals.itemsDiscount.isZero() || !totals.generalDiscount.isZero())
          ? [
              { label: 'Subtotal dos itens', value: formatCurrency(totals.itemsSubtotal) },
              ...(totals.itemsDiscount.isZero()
                ? []
                : [
                    {
                      label: 'Descontos nos itens',
                      value: `- ${formatCurrency(totals.itemsDiscount)}`,
                    },
                    {
                      label: 'Subtotal após descontos',
                      value: formatCurrency(totals.subtotalAfterItemDiscounts),
                    },
                  ]),
              ...(totals.generalDiscount.isZero()
                ? []
                : [
                    {
                      label:
                        request.discountType === 'PERCENT'
                          ? `Desconto geral (${formatPercent(request.discountValue)})`
                          : 'Desconto geral',
                      value: `- ${formatCurrency(totals.generalDiscount)}`,
                    },
                  ]),
            ]
          : undefined,
      caption: buildTotalCaption(cotados.length, request.items.length, indisponiveis),
    },
    notes: request.notes?.trim() ? { title: 'OBSERVAÇÕES', text: request.notes.trim() } : null,
    footer: null,
  };
}

/// A descrição carrega o que o solicitante escreveu e, quando o item não foi
/// achado, o aviso de Compras. Tudo em UMA célula porque a tabela já tem seis
/// colunas — uma sétima só para "situação" espremeria a descrição, que é o
/// que a obra realmente lê.
function buildDescription(item: PurchaseRequestSource['items'][number]): string {
  const linhas = [item.description];

  if (item.notes?.trim()) {
    linhas.push(item.notes.trim());
  }

  if (item.unavailable) {
    linhas.push(
      item.unavailabilityNote?.trim()
        ? `Não disponível — ${item.unavailabilityNote.trim()}`
        : 'Não disponível',
    );
  }

  return linhas.join('\n');
}

/// A legenda do total explica de onde ele saiu. É onde o item indisponível
/// aparece explicitamente: sem isso, quem soma as linhas do papel na mão não
/// entenderia por que o total não bate com a lista.
function buildTotalCaption(cotados: number, itens: number, indisponiveis: number): string {
  if (itens === 0) return 'Solicitação sem itens.';

  if (cotados === 0) {
    return indisponiveis > 0
      ? `Nenhum item cotado até aqui. ${plural(indisponiveis, 'item não disponível', 'itens não disponíveis')} no fornecedor consultado.`
      : 'Nenhum item cotado até aqui — os valores são informados pelo setor de Compras.';
  }

  const base = `${cotados} de ${itens} ${itens === 1 ? 'item cotado' : 'itens cotados'}.`;

  return indisponiveis > 0
    ? `${base} ${plural(indisponiveis, 'item não disponível', 'itens não disponíveis')} no fornecedor consultado — fora do total.`
    : `${base} Total calculado a partir dos itens cotados.`;
}

/// "10" vira "10%" e "7.5" vira "7,5%" — sem casas decimais forçadas, porque
/// desconto redondo é o caso comum e "10,00%" só ocupa espaço.
function formatPercent(value: Prisma.Decimal): string {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function plural(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}
