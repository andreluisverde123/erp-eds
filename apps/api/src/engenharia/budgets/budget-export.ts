import ExcelJS from 'exceljs';

import type {
  DocumentBlock,
  DocumentColumn,
  DocumentField,
  DocumentRow,
  PrintableDocument,
} from '../../common/pdf/printable-document';

/// Exportação do orçamento (XLSX e PDF). Sem Prisma e sem Nest: recebe o
/// orçamento JÁ DETALHADO — com EAP numerada, totais e snapshot — e só dispõe.
/// Nenhuma conta é refeita aqui; os valores são os mesmos da tela.

export interface ExportReference {
  source: string;
  code: string | null;
  competence: string | null;
  uf: string | null;
  regime: string | null;
  versionLabel: string | null;
}

export interface BudgetExportSource {
  code: string;
  version: number;
  name: string;
  description: string | null;
  referenceDate: string;
  status: 'DRAFT' | 'CLOSED';
  closedAt: Date | null;
  isOfficial: boolean;
  constructionSite: { code: string; name: string };
  directCost: string;
  bdiPercent: string;
  bdiNote: string | null;
  bdiValue: string;
  finalPrice: string;
  nodes: { id: string; code: string; depth: number; name: string; subtotal: string }[];
  items: {
    id: string;
    budgetNodeId: string;
    code: string | null;
    position: number;
    source: string;
    sourceCode: string | null;
    description: string;
    unit: string;
    quantity: string;
    unitCost: string;
    totalCost: string;
    reference: ExportReference | null;
  }[];
}

export interface BudgetExportLine {
  kind: 'GROUP' | 'ITEM';
  depth: number;
  code: string;
  description: string;
  origin: string;
  unit: string;
  quantity: string | null;
  unitCost: string | null;
  total: string;
}

export const REGIME_LABELS: Record<string, string> = {
  NAO_DESONERADO: 'Não desonerado',
  DESONERADO: 'Desonerado',
  SEM_ENCARGOS: 'Sem encargos',
};

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Rascunho', CLOSED: 'Fechado' };

/// "SINAPI 104658 · 08/2026 · SP · Não desonerado".
export function originLabel(item: BudgetExportSource['items'][number]): string {
  switch (item.source) {
    case 'REFERENCE': {
      const ref = item.reference;
      if (!ref) return 'Base referencial';
      return [
        `${ref.source}${ref.code ? ` ${ref.code}` : ''}`,
        ref.competence ? competenciaLegivel(ref.competence) : null,
        ref.uf,
        ref.regime ? REGIME_LABELS[ref.regime] ?? ref.regime : null,
        ref.versionLabel || null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'COMPOSITION':
      return `Composição${item.sourceCode ? ` ${item.sourceCode}` : ''}`;
    case 'CATALOG_ITEM':
      return `Insumo${item.sourceCode ? ` ${item.sourceCode}` : ''}`;
    default:
      return 'Manual';
  }
}

/// A EAP na ordem da tela: cada grupo, os itens dele, depois os subgrupos.
export function buildBudgetExportLines(source: BudgetExportSource): BudgetExportLine[] {
  const linhas: BudgetExportLine[] = [];
  for (const node of source.nodes) {
    linhas.push({
      kind: 'GROUP',
      depth: node.depth,
      code: node.code,
      description: node.name,
      origin: '',
      unit: '',
      quantity: null,
      unitCost: null,
      total: node.subtotal,
    });
    const itens = source.items
      .filter((item) => item.budgetNodeId === node.id)
      .sort((a, b) => a.position - b.position);
    for (const item of itens) {
      linhas.push({
        kind: 'ITEM',
        depth: node.depth + 1,
        code: item.code ?? '',
        description: item.description,
        origin: originLabel(item),
        unit: item.unit,
        quantity: item.quantity,
        unitCost: item.unitCost,
        total: item.totalCost,
      });
    }
  }
  return linhas;
}

export function exportFileName(source: Pick<BudgetExportSource, 'code' | 'version'>): string {
  return `${source.code}-v${source.version}`;
}

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERCENT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const QUANTITY = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const UNIT_COST = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const formatMoney = (valor: string) => MONEY.format(Number(valor));
export const formatPercent = (valor: string) => `${PERCENT.format(Number(valor))}%`;

function dataCivil(valor: string): string {
  const [ano, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${ano}`;
}

function competenciaLegivel(valor: string): string {
  const [ano, mes] = valor.split('-');
  return `${mes}/${ano}`;
}

function campos(source: BudgetExportSource): DocumentField[] {
  return [
    { label: 'Obra', value: `${source.constructionSite.code} — ${source.constructionSite.name}` },
    { label: 'Orçamento', value: source.name },
    { label: 'Código', value: source.code },
    { label: 'Versão', value: `v${source.version}` },
    { label: 'Data-base', value: dataCivil(source.referenceDate) },
    { label: 'Status', value: STATUS_LABELS[source.status] ?? source.status },
    { label: 'Orçamento oficial da obra', value: source.isOfficial ? 'Sim' : 'Não' },
    ...(source.description ? [{ label: 'Descrição', value: source.description }] : []),
  ];
}

function resumo(source: BudgetExportSource): { label: string; value: string }[] {
  return [
    { label: 'Custo direto', value: formatMoney(source.directCost) },
    { label: `BDI (${formatPercent(source.bdiPercent)})`, value: formatMoney(source.bdiValue) },
  ];
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

export async function buildBudgetWorkbook(source: BudgetExportSource, generatedAt: Date): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook();
  pasta.created = generatedAt;
  const aba = pasta.addWorksheet('Orçamento');
  aba.columns = [
    { width: 12 },
    { width: 60 },
    { width: 38 },
    { width: 9 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
  ];

  const titulo = aba.addRow([`Orçamento ${source.code} — v${source.version}`]);
  titulo.font = { bold: true, size: 14 };
  for (const campo of campos(source)) {
    const linha = aba.addRow([campo.label, campo.value]);
    linha.getCell(1).font = { bold: true };
  }
  aba.addRow([]);

  const cabecalho = aba.addRow(['EAP', 'Descrição', 'Origem', 'Unidade', 'Quantidade', 'Custo unitário', 'Total']);
  cabecalho.font = { bold: true };
  cabecalho.eachCell((celula) => {
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });

  for (const linha of buildBudgetExportLines(source)) {
    const row = aba.addRow([
      linha.code,
      linha.description,
      linha.origin || null,
      linha.unit || null,
      linha.quantity === null ? null : Number(linha.quantity),
      linha.unitCost === null ? null : Number(linha.unitCost),
      Number(linha.total),
    ]);
    row.getCell(2).alignment = { indent: Math.max(0, linha.depth - 1), wrapText: true };
    row.getCell(5).numFmt = '#,##0.00##';
    row.getCell(6).numFmt = '"R$" #,##0.00##';
    row.getCell(7).numFmt = '"R$" #,##0.00';
    if (linha.kind === 'GROUP') row.font = { bold: true };
  }

  aba.addRow([]);
  const totais: [string, number][] = [
    ['Custo direto', Number(source.directCost)],
    [`BDI (${formatPercent(source.bdiPercent)})`, Number(source.bdiValue)],
    ['Preço final', Number(source.finalPrice)],
  ];
  for (const [rotulo, valor] of totais) {
    const linha = aba.addRow([null, null, null, null, null, rotulo, valor]);
    linha.getCell(6).font = { bold: true };
    linha.getCell(7).numFmt = '"R$" #,##0.00';
    if (rotulo === 'Preço final') linha.font = { bold: true };
  }
  if (source.bdiNote) aba.addRow([null, `Observação do BDI: ${source.bdiNote}`]);
  aba.addRow([
    null,
    'Subtotais e custo direto somam os valores exatos e arredondam uma vez; a soma dos totais de linha pode diferir em centavos.',
  ]);
  aba.addRow([null, `Gerado em ${generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`]);

  return Buffer.from(await pasta.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// PDF (conteúdo; o desenho é o `pdf-renderer` comum)
// ---------------------------------------------------------------------------

export const BUDGET_PDF_COLUMNS: readonly DocumentColumn[] = [
  { key: 'code', label: 'EAP', width: 0.07, align: 'left' },
  { key: 'description', label: 'Descrição', width: 0.31, align: 'left' },
  { key: 'origin', label: 'Origem', width: 0.18, align: 'left', muted: true },
  { key: 'unit', label: 'Un.', width: 0.05, align: 'left' },
  { key: 'quantity', label: 'Qtd.', width: 0.1, align: 'right' },
  { key: 'unitCost', label: 'Custo unit.', width: 0.13, align: 'right' },
  { key: 'total', label: 'Total', width: 0.16, align: 'right' },
];

export function buildBudgetDocument(
  source: BudgetExportSource,
  company: Pick<PrintableDocument, 'companyName' | 'companyFields' | 'companyLogo'>,
  generatedAt: Date,
): PrintableDocument {
  const rows: DocumentRow[] = buildBudgetExportLines(source).map((linha) => ({
    code: linha.code,
    description: linha.kind === 'GROUP' ? linha.description.toUpperCase() : linha.description,
    origin: linha.origin,
    unit: linha.unit,
    quantity: linha.quantity === null ? '' : QUANTITY.format(Number(linha.quantity)),
    unitCost: linha.unitCost === null ? '' : UNIT_COST.format(Number(linha.unitCost)),
    total: formatMoney(linha.total),
  }));

  const blocks: DocumentBlock[] = [{ title: 'Orçamento', fields: campos(source) }];

  return {
    ...company,
    title: 'Orçamento de obra',
    code: `${source.code} v${source.version}`,
    blocks,
    highlight: null,
    columns: BUDGET_PDF_COLUMNS,
    rows,
    emptyRowsMessage: 'Este orçamento não tem EAP.',
    total: {
      label: 'Preço final',
      value: formatMoney(source.finalPrice),
      lines: resumo(source),
      caption:
        'Linhas em caixa alta são grupos da EAP, com o subtotal. Subtotais e custo direto somam os valores exatos e arredondam uma vez.',
    },
    notes: source.bdiNote ? { title: 'Observação do BDI', text: source.bdiNote } : null,
    footer: {
      title: 'Rastreabilidade',
      fields: [
        ...(source.closedAt
          ? [{ label: 'Fechado em', value: source.closedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }]
          : []),
        { label: 'Gerado em', value: generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) },
      ],
    },
    signatures: [],
  };
}
