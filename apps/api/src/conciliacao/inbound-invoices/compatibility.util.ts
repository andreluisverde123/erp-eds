import { Prisma } from '../../../generated/prisma/client';

/// Camada de comparação entre a nota recebida e a ordem de compra.
///
/// TUDO AQUI É DETERMINÍSTICO. Nenhum modelo, nenhuma inferência, nenhum
/// "grau de confiança" aprendido: são comparações de valor com `Decimal`,
/// igualdade de unidade e semelhança de texto por sobreposição de palavras.
/// Rodar duas vezes com a mesma entrada dá exatamente o mesmo resultado, e
/// cada divergência apontada pode ser explicada linha a linha para o
/// financeiro — que é o requisito de um documento que vira dívida.
///
/// A camada é PURA de propósito: nada de Prisma, nada de I/O. É o que permite
/// testar cada regra isoladamente e o que mantém a decisão fora do service.

/// Quanto o valor da nota pode diferir do saldo da ordem e ainda ser tratado
/// como "confere". Um centavo é diferença de arredondamento; acima disso é
/// divergência que alguém precisa aceitar.
const AMOUNT_TOLERANCE = new Prisma.Decimal('0.01');

/// Semelhança mínima entre descrições para considerar que duas linhas falam
/// do mesmo material. 0,5 = metade das palavras relevantes em comum.
///
/// O emitente descreve o produto do jeito dele ("CIMENTO CP II-E-32 SC 50KG")
/// e a obra pediu do jeito dela ("Cimento CP-II 50kg"). Exigir igualdade
/// literal não casaria quase nada; um limiar baixo demais casaria cimento com
/// areia. Meio termo, e o usuário confere na tela.
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.5;

/// Palavras que não distinguem material nenhum e só inflariam a semelhança.
const STOPWORDS = new Set(['de', 'da', 'do', 'com', 'para', 'em', 'e', 'a', 'o', 'un', 'und']);

export type CheckResult = 'MATCH' | 'DIVERGENT' | 'UNKNOWN';

export interface CompatibilityCheck {
  key: 'supplier' | 'amount' | 'items' | 'site' | 'date';
  label: string;
  result: CheckResult;
  /// Explicação em uma linha, já pronta para a tela. Fica no backend porque é
  /// o backend que tem os números exatos que a frase precisa citar.
  detail: string;
}

export type ItemComparisonStatus =
  /// Casaram e todos os campos batem.
  | 'MATCH'
  /// Casaram, mas quantidade, unidade ou valor diferem.
  | 'DIVERGENT'
  /// Está na nota e não foi encontrado na ordem.
  | 'ONLY_IN_INVOICE'
  /// Está na ordem e não veio na nota.
  | 'ONLY_IN_ORDER';

export interface ComparableItem {
  description: string;
  unit: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  totalPrice: Prisma.Decimal;
}

export interface ItemComparison {
  status: ItemComparisonStatus;
  invoice: ComparableItem | null;
  order: ComparableItem | null;
  /// Quais campos divergem, quando os dois lados existem.
  differences: ('quantity' | 'unit' | 'unitPrice' | 'totalPrice')[];
  /// 0 a 1 — a semelhança de descrição que produziu o casamento.
  similarity: number;
}

export interface CompatibilityReport {
  checks: CompatibilityCheck[];
  items: ItemComparison[];
  matchedItems: number;
  divergentItems: number;
  /// `true` quando QUALQUER verificação deu divergência. Não bloqueia nada —
  /// quem decide é o usuário, e a regra de aceite continua sendo a do service.
  hasDivergence: boolean;
  /// Só os itens são comparáveis quando os dois lados têm linhas. Ordens
  /// emitidas antes da estrutura de itens não têm, e isso não é divergência:
  /// é ausência de informação.
  itemsComparable: boolean;
}

/// Tira acento, pontuação e caixa. "CIMENTO CP-II/32" e "cimento cp ii 32"
/// viram a mesma coisa.
export function normalizeDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeDescription(value)
      .split(' ')
      .filter((token) => token.length > 0 && !STOPWORDS.has(token)),
  );
}

/// Coeficiente de Dice sobre as palavras: 2·|A∩B| / (|A|+|B|).
///
/// Escolhido em vez de distância de edição porque a diferença entre as duas
/// descrições costuma ser de PALAVRAS inteiras a mais ou a menos ("SC 50KG",
/// "ensacado"), não de letras trocadas.
export function descriptionSimilarity(a: string, b: string): number {
  const setA = tokens(a);
  const setB = tokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

function sameUnit(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // unidade ausente não é divergência, é falta de dado
  return normalizeDescription(a) === normalizeDescription(b);
}

function within(a: Prisma.Decimal, b: Prisma.Decimal, tolerance = AMOUNT_TOLERANCE): boolean {
  return a.minus(b).abs().lessThanOrEqualTo(tolerance);
}

/// Casa as linhas da nota com as da ordem.
///
/// Guloso e estável: para cada linha da ORDEM (que é o pedido aprovado, o
/// lado que manda), procura a linha ainda não usada da nota com a maior
/// semelhança acima do limiar. Guloso basta aqui — a alternativa seria um
/// emparelhamento ótimo (húngaro), que resolve empates que na prática não
/// aparecem numa nota de obra e custaria muito mais para explicar ao usuário.
export function compareItems(
  invoiceItems: ComparableItem[],
  orderItems: ComparableItem[],
): ItemComparison[] {
  const usados = new Set<number>();
  const comparisons: ItemComparison[] = [];

  for (const orderItem of orderItems) {
    let melhorIndice = -1;
    let melhorSemelhanca = 0;

    invoiceItems.forEach((invoiceItem, index) => {
      if (usados.has(index)) return;
      const semelhanca = descriptionSimilarity(orderItem.description, invoiceItem.description);
      if (semelhanca > melhorSemelhanca) {
        melhorSemelhanca = semelhanca;
        melhorIndice = index;
      }
    });

    if (melhorIndice === -1 || melhorSemelhanca < DESCRIPTION_SIMILARITY_THRESHOLD) {
      comparisons.push({
        status: 'ONLY_IN_ORDER',
        invoice: null,
        order: orderItem,
        differences: [],
        similarity: 0,
      });
      continue;
    }

    usados.add(melhorIndice);
    const invoiceItem = invoiceItems[melhorIndice]!;

    const differences: ItemComparison['differences'] = [];
    if (!within(invoiceItem.quantity, orderItem.quantity, new Prisma.Decimal('0.001'))) {
      differences.push('quantity');
    }
    if (!sameUnit(invoiceItem.unit, orderItem.unit)) differences.push('unit');
    if (!within(invoiceItem.unitPrice, orderItem.unitPrice)) differences.push('unitPrice');
    if (!within(invoiceItem.totalPrice, orderItem.totalPrice)) differences.push('totalPrice');

    comparisons.push({
      status: differences.length === 0 ? 'MATCH' : 'DIVERGENT',
      invoice: invoiceItem,
      order: orderItem,
      differences,
      similarity: melhorSemelhanca,
    });
  }

  // O que veio na nota e ninguém pediu — o caso que mais importa ao
  // financeiro, porque é material cobrado sem pedido correspondente.
  invoiceItems.forEach((invoiceItem, index) => {
    if (usados.has(index)) return;
    comparisons.push({
      status: 'ONLY_IN_INVOICE',
      invoice: invoiceItem,
      order: null,
      differences: [],
      similarity: 0,
    });
  });

  return comparisons;
}

export interface InvoiceSide {
  supplierId: string | null;
  supplierDocument: string;
  totalAmount: Prisma.Decimal;
  issueDate: Date;
  items: ComparableItem[];
  /// `false` quando só o resumo da NF-e chegou — a nota não tem itens ainda,
  /// e isso é diferente de "a nota não tem itens".
  hasFullDocument: boolean;
}

export interface OrderSide {
  supplierId: string;
  supplierDocument: string;
  openAmount: Prisma.Decimal;
  issueDate: Date;
  constructionSite: { code: string; name: string } | null;
  items: ComparableItem[];
}

/// Janela de data usada só como CRITÉRIO AUXILIAR: nunca bloqueia, nunca
/// marca divergência. Material de obra atrasa, e uma nota emitida 100 dias
/// depois do pedido continua podendo ser daquele pedido.
const DATE_WINDOW_DAYS = 90;

export function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

/// O relatório completo de compatibilidade entre uma nota e uma ordem.
export function buildCompatibilityReport(
  invoice: InvoiceSide,
  order: OrderSide,
): CompatibilityReport {
  const checks: CompatibilityCheck[] = [];

  // --- Fornecedor -------------------------------------------------------
  // O CNPJ é a identidade. Comparamos o VÍNCULO quando ele existe e caímos
  // no documento quando a nota ainda não foi ligada a um cadastro.
  const mesmoFornecedor = invoice.supplierId
    ? invoice.supplierId === order.supplierId
    : invoice.supplierDocument === order.supplierDocument;

  checks.push({
    key: 'supplier',
    label: 'Fornecedor',
    result: mesmoFornecedor ? 'MATCH' : 'DIVERGENT',
    detail: mesmoFornecedor ? 'Mesmo emitente da ordem.' : 'A ordem é de outro fornecedor.',
  });

  // --- Valor ------------------------------------------------------------
  // Contra o SALDO EM ABERTO, não contra o total: uma ordem de 100 mil que já
  // recebeu 90 mil em notas deve casar com uma nota de 10 mil.
  const diferenca = invoice.totalAmount.minus(order.openAmount);
  const valorConfere = within(invoice.totalAmount, order.openAmount);

  checks.push({
    key: 'amount',
    label: 'Valor',
    result: valorConfere ? 'MATCH' : 'DIVERGENT',
    detail: valorConfere
      ? 'Valor da nota igual ao saldo em aberto da ordem.'
      : `Nota ${diferenca.greaterThan(0) ? 'maior' : 'menor'} que o saldo em aberto em ${diferenca.abs().toFixed(2)}.`,
  });

  // --- Itens ------------------------------------------------------------
  const itemsComparable =
    invoice.hasFullDocument && invoice.items.length > 0 && order.items.length > 0;
  const items = itemsComparable ? compareItems(invoice.items, order.items) : [];
  const matchedItems = items.filter((item) => item.status === 'MATCH').length;
  const divergentItems = items.filter((item) => item.status !== 'MATCH').length;

  checks.push({
    key: 'items',
    label: 'Itens',
    result: !itemsComparable ? 'UNKNOWN' : divergentItems === 0 ? 'MATCH' : 'DIVERGENT',
    detail: !itemsComparable
      ? invoice.hasFullDocument
        ? 'Ordem sem itens detalhados — nada a comparar.'
        : 'A nota ainda não trouxe os itens (só o resumo chegou).'
      : divergentItems === 0
        ? `${matchedItems} ${matchedItems === 1 ? 'item confere' : 'itens conferem'}.`
        : `${matchedItems} de ${items.length} conferem; ${divergentItems} com diferença.`,
  });

  // --- Obra -------------------------------------------------------------
  // A NF-e NÃO carrega obra: não existe campo para isso no documento fiscal
  // nem em `InboundInvoice`. A obra é o que a conciliação DEFINE (vindo da
  // ordem), não algo que ela confere. Por isso o resultado é sempre UNKNOWN —
  // marcar MATCH aqui seria afirmar uma conferência que não aconteceu.
  checks.push({
    key: 'site',
    label: 'Obra',
    result: 'UNKNOWN',
    detail: order.constructionSite
      ? `A despesa será atribuída a ${order.constructionSite.code} — ${order.constructionSite.name}.`
      : 'A ordem não pertence a uma obra (centro de custo administrativo).',
  });

  // --- Data (auxiliar) --------------------------------------------------
  const dias = daysBetween(invoice.issueDate, order.issueDate);
  checks.push({
    key: 'date',
    label: 'Data',
    // Nunca DIVERGENT: data é critério auxiliar por decisão de negócio.
    result: dias <= DATE_WINDOW_DAYS ? 'MATCH' : 'UNKNOWN',
    detail:
      dias === 0
        ? 'Nota e ordem emitidas no mesmo dia.'
        : `${dias} dia(s) entre a emissão da ordem e a da nota.`,
  });

  return {
    checks,
    items,
    matchedItems,
    divergentItems,
    hasDivergence: checks.some((check) => check.result === 'DIVERGENT'),
    itemsComparable,
  };
}
