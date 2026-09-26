import PDFDocument from 'pdfkit';

import { code128cWidths } from './code128';
import type { DanfeData, DanfeItem } from './danfe-data';

/// Desenho do DANFE retrato (MOC, Anexo II), a partir do `DanfeData`.
///
/// Uma regra só guia este arquivo, a mesma do `pdf-renderer.ts`: nada pode ser
/// cortado nem sobreposto. Campo de linha única ENCOLHE a fonte até caber;
/// parágrafo (canhoto, emitente, dados adicionais) é medido antes de desenhar;
/// linha da tabela de itens tem a altura da célula mais alta.

export interface DanfeRenderOptions {
  /// Carimba "NF-e CANCELADA" em todas as folhas. O XML autorizado continua
  /// o mesmo depois do cancelamento — quem sabe que a nota caiu é o nosso
  /// registro, não o documento.
  cancelled?: boolean;
}

export interface RenderedDanfe {
  buffer: Buffer;
  pageCount: number;
}

type Doc = InstanceType<typeof PDFDocument>;

const MARGIN = 20;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const LINE_WIDTH = 0.5;
const LABEL_SIZE = 5;
const VALUE_SIZE = 8;
const MIN_VALUE_SIZE = 4.5;
const FIELD_HEIGHT = 18;
const SECTION_TITLE_HEIGHT = 9;
const ITEM_FONT_SIZE = 5.5;
const CELL_PADDING = 1.5;

/// Altura do quadro emitente + DANFE + chave, sem as duas linhas de baixo.
const HEADER_BOX_HEIGHT = 116;

const FREIGHT_MODE: Record<string, string> = {
  '0': '0-POR CONTA DO EMIT',
  '1': '1-POR CONTA DO DEST',
  '2': '2-POR CONTA DE TERCEIROS',
  '3': '3-PRÓPRIO POR CONTA DO REM',
  '4': '4-PRÓPRIO POR CONTA DO DEST',
  '9': '9-SEM TRANSPORTE',
};

interface ItemColumn {
  label: string;
  width: number;
  align: 'left' | 'right' | 'center';
  value: (item: DanfeItem) => string;
}

/// Larguras em pontos; a descrição fica com o que sobrar da largura útil.
const ITEM_COLUMNS: readonly ItemColumn[] = [
  { label: 'CÓDIGO PRODUTO', width: 42, align: 'left', value: (i) => i.code },
  { label: 'DESCRIÇÃO DO PRODUTO / SERVIÇO', width: 0, align: 'left', value: (i) => i.description },
  { label: 'NCM/SH', width: 32, align: 'center', value: (i) => i.ncm },
  { label: 'CST', width: 20, align: 'center', value: (i) => i.cst },
  { label: 'CFOP', width: 20, align: 'center', value: (i) => i.cfop },
  { label: 'UN', width: 20, align: 'center', value: (i) => i.unit },
  { label: 'QUANT', width: 36, align: 'right', value: (i) => quantity(i.quantity) },
  { label: 'VALOR UNIT', width: 40, align: 'right', value: (i) => quantity(i.unitPrice) },
  { label: 'VALOR TOTAL', width: 40, align: 'right', value: (i) => money(i.totalPrice) },
  { label: 'B.CÁLC ICMS', width: 38, align: 'right', value: (i) => money(i.icmsBase) },
  { label: 'VALOR ICMS', width: 34, align: 'right', value: (i) => money(i.icmsAmount) },
  { label: 'VALOR IPI', width: 30, align: 'right', value: (i) => money(i.ipiAmount) },
  { label: 'ALÍQ. ICMS', width: 22, align: 'right', value: (i) => rate(i.icmsRate) },
  { label: 'ALÍQ. IPI', width: 22, align: 'right', value: (i) => rate(i.ipiRate) },
];

export async function renderDanfePdf(
  data: DanfeData,
  options: DanfeRenderOptions = {},
): Promise<RenderedDanfe> {
  // Margem ZERO para o pdfkit: a paginação é toda nossa. Com margem, um texto
  // desenhado perto do rodapé faria o pdfkit abrir página sozinho.
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  new DanfeRenderer(doc, data).render();

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    if (options.cancelled) stamp(doc, 'NF-e CANCELADA', '#C00000');
    else if (data.isHomologation) stamp(doc, 'SEM VALOR FISCAL', '#808080');
  }
  // "FOLHA x/y" só depois da última linha: o total não se conhece antes.
  fillPageNumbers(doc, range.count);

  doc.end();
  await finished;
  return { buffer: Buffer.concat(chunks), pageCount: range.count };
}

/// Onde cada folha escreve o "FOLHA x/y", guardado ao desenhar o cabeçalho.
const folhaPositions = new WeakMap<Doc, { x: number; y: number; width: number }[]>();

class DanfeRenderer {
  private readonly left = MARGIN;
  private readonly width: number;
  private readonly bottom: number;
  private y = MARGIN;

  constructor(
    private readonly doc: Doc,
    private readonly data: DanfeData,
  ) {
    this.width = doc.page.width - MARGIN * 2;
    this.bottom = doc.page.height - MARGIN;
    doc.lineWidth(LINE_WIDTH).strokeColor('#000000').fillColor('#000000');
    folhaPositions.set(doc, []);
  }

  render() {
    this.drawStub();
    this.drawHeader();
    this.drawRecipient();
    this.drawDuplicates();
    this.drawTaxes();
    this.drawCarrier();
    this.drawItems();
    this.drawIssqn();
    this.drawAdditionalInfo();
  }

  // ---------------------------------------------------------------- canhoto

  private drawStub() {
    const { data } = this;
    const numberWidth = 100;
    const mainWidth = this.width - numberWidth;
    const rowHeight = 22;

    const destino = [data.recipient.name, data.recipient.street, data.recipient.city]
      .filter(Boolean)
      .join(' - ');
    const texto =
      `RECEBEMOS DE ${data.issuer.name} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ` +
      `ELETRÔNICA INDICADA AO LADO. EMISSÃO: ${data.issueDate ?? ''} ` +
      `VALOR TOTAL: R$ ${money(data.totals.invoiceAmount)} DESTINATÁRIO: ${destino}`;

    this.rect(this.left, this.y, mainWidth, rowHeight);
    this.paragraph(texto, this.left + 2, this.y + 2, mainWidth - 4, rowHeight - 3, 6.5);

    this.field(this.left, this.y + rowHeight, 110, rowHeight, 'DATA DE RECEBIMENTO', '');
    this.field(
      this.left + 110,
      this.y + rowHeight,
      mainWidth - 110,
      rowHeight,
      'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR',
      '',
    );

    const nx = this.left + mainWidth;
    this.rect(nx, this.y, numberWidth, rowHeight * 2);
    this.centered('NF-e', nx, this.y + 6, numberWidth, 11, true);
    this.centered(`Nº ${invoiceNumber(data.number)}`, nx, this.y + 20, numberWidth, 8, true);
    this.centered(`SÉRIE ${pad(data.series, 3)}`, nx, this.y + 31, numberWidth, 8, true);

    this.y += rowHeight * 2 + 4;
    this.doc
      .save()
      .dash(3, { space: 2 })
      .moveTo(this.left, this.y)
      .lineTo(this.left + this.width, this.y)
      .stroke()
      .undash()
      .restore();
    this.y += 5;
  }

  // ------------------------------------------------------------- cabeçalho

  private drawHeader() {
    const { data, doc } = this;
    const top = this.y;
    const emitWidth = 240;
    const danfeWidth = 105;
    const keyWidth = this.width - emitWidth - danfeWidth;
    const h = HEADER_BOX_HEIGHT;

    // Emitente.
    this.rect(this.left, top, emitWidth, h);
    this.label('IDENTIFICAÇÃO DO EMITENTE', this.left, top, emitWidth);
    const nameHeight = this.paragraph(
      data.issuer.name,
      this.left + 4,
      top + 12,
      emitWidth - 8,
      32,
      10,
      { bold: true, align: 'center' },
    );
    const endereco = [
      data.issuer.street,
      [data.issuer.neighborhood, data.issuer.zipCode && `CEP ${zip(data.issuer.zipCode)}`]
        .filter(Boolean)
        .join(' - '),
      [data.issuer.city, data.issuer.state].filter(Boolean).join(' - '),
      data.issuer.phone ? `Fone: ${phone(data.issuer.phone)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const addressTop = top + 14 + nameHeight;
    this.paragraph(
      endereco,
      this.left + 4,
      addressTop,
      emitWidth - 8,
      top + h - addressTop - 3,
      7.5,
      {
        align: 'center',
      },
    );

    // Caixa DANFE.
    const dx = this.left + emitWidth;
    this.rect(dx, top, danfeWidth, h);
    this.centered('DANFE', dx, top + 5, danfeWidth, 13, true);
    this.paragraph(
      'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
      dx + 6,
      top + 21,
      danfeWidth - 12,
      18,
      6.5,
      { align: 'center' },
    );
    doc.font(FONT).fontSize(7);
    doc.text('0 - ENTRADA', dx + 10, top + 45, { lineBreak: false });
    doc.text('1 - SAÍDA', dx + 10, top + 54, { lineBreak: false });
    this.rect(dx + 72, top + 44, 18, 18);
    this.centered(data.operationType, dx + 72, top + 48.5, 18, 11, true);
    this.centered(`Nº ${invoiceNumber(data.number)}`, dx, top + 70, danfeWidth, 8.5, true);
    this.centered(`SÉRIE ${pad(data.series, 3)}`, dx, top + 82, danfeWidth, 8.5, true);
    folhaPositions.get(doc)!.push({ x: dx, y: top + 94, width: danfeWidth });

    // Código de barras + chave + consulta.
    const kx = dx + danfeWidth;
    const barcodeBoxHeight = 44;
    this.rect(kx, top, keyWidth, barcodeBoxHeight);
    this.barcode(data.accessKey, kx + 8, top + 5, keyWidth - 16, barcodeBoxHeight - 10);
    this.field(
      kx,
      top + barcodeBoxHeight,
      keyWidth,
      20,
      'CHAVE DE ACESSO',
      formatKey(data.accessKey),
      {
        align: 'center',
        bold: true,
      },
    );
    const consultaTop = top + barcodeBoxHeight + 20;
    this.rect(kx, consultaTop, keyWidth, h - barcodeBoxHeight - 20);
    this.paragraph(
      'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ' +
        'ou no site da Sefaz Autorizadora',
      kx + 6,
      consultaTop + 10,
      keyWidth - 12,
      h - barcodeBoxHeight - 20 - 12,
      8,
      { align: 'center' },
    );

    this.y = top + h;
    this.row([
      { w: emitWidth + danfeWidth, label: 'NATUREZA DA OPERAÇÃO', value: data.operationNature },
      {
        w: keyWidth,
        label: 'PROTOCOLO DE AUTORIZAÇÃO DE USO',
        value: data.protocol ?? '',
        align: 'center',
      },
    ]);
    const third = this.width / 3;
    this.row([
      { w: third, label: 'INSCRIÇÃO ESTADUAL', value: data.issuer.ie ?? '' },
      { w: third, label: 'INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.', value: data.issuer.ieSt ?? '' },
      { w: third, label: 'CNPJ / CPF', value: document(data.issuer.document) },
    ]);
  }

  // --------------------------------------------------------- destinatário

  private drawRecipient() {
    const r = this.data.recipient;
    this.section('DESTINATÁRIO / REMETENTE');
    this.row([
      { w: 0, label: 'NOME / RAZÃO SOCIAL', value: r.name },
      { w: 120, label: 'CNPJ / CPF', value: document(r.document) },
      { w: 90, label: 'DATA DA EMISSÃO', value: this.data.issueDate ?? '', align: 'center' },
    ]);
    this.row([
      { w: 0, label: 'ENDEREÇO', value: r.street ?? '' },
      { w: 130, label: 'BAIRRO / DISTRITO', value: r.neighborhood ?? '' },
      { w: 55, label: 'CEP', value: zip(r.zipCode), align: 'center' },
      { w: 90, label: 'DATA DA SAÍDA/ENTRADA', value: this.data.exitDate ?? '', align: 'center' },
    ]);
    this.row([
      { w: 0, label: 'MUNICÍPIO', value: r.city ?? '' },
      { w: 110, label: 'FONE / FAX', value: phone(r.phone) },
      { w: 25, label: 'UF', value: r.state ?? '', align: 'center' },
      { w: 110, label: 'INSCRIÇÃO ESTADUAL', value: r.ie ?? '' },
      { w: 90, label: 'HORA DA SAÍDA/ENTRADA', value: this.data.exitTime ?? '', align: 'center' },
    ]);
  }

  // --------------------------------------------------------------- fatura

  private drawDuplicates() {
    const dups = this.data.duplicates;
    if (dups.length === 0) return;

    const perRow = 6;
    const boxWidth = this.width / perRow;
    const boxHeight = 22;
    const rows = Math.ceil(dups.length / perRow);
    this.ensureSpace(SECTION_TITLE_HEIGHT + boxHeight);
    this.section('FATURA / DUPLICATAS');

    for (let r = 0; r < rows; r++) {
      this.ensureSpace(boxHeight);
      dups.slice(r * perRow, r * perRow + perRow).forEach((dup, i) => {
        const x = this.left + i * boxWidth;
        this.rect(x, this.y, boxWidth, boxHeight);
        const linhas: [string, string][] = [
          ['Núm.', dup.number ?? ''],
          ['Venc.', dup.dueDate ?? ''],
          ['Valor', `R$ ${money(dup.amount)}`],
        ];
        linhas.forEach(([label, value], line) => {
          const ly = this.y + 2 + line * 6.5;
          this.doc
            .font(FONT)
            .fontSize(5.5)
            .text(label, x + 3, ly, { lineBreak: false });
          this.fitLine(value, x + 22, ly, boxWidth - 25, 6, { bold: true, align: 'right' });
        });
      });
      this.y += boxHeight;
    }
  }

  // ------------------------------------------------------ cálculo do imposto

  private drawTaxes() {
    const t = this.data.totals;
    this.ensureSpace(SECTION_TITLE_HEIGHT + FIELD_HEIGHT * 2);
    this.section('CÁLCULO DO IMPOSTO');
    const r = 'right' as const;
    this.row([
      { w: 0, label: 'BASE DE CÁLC. DO ICMS', value: money(t.icmsBase), align: r },
      { w: 0, label: 'VALOR DO ICMS', value: money(t.icmsAmount), align: r },
      { w: 0, label: 'BASE DE CÁLC. ICMS S.T.', value: money(t.icmsStBase), align: r },
      { w: 0, label: 'VALOR DO ICMS SUBST.', value: money(t.icmsStAmount), align: r },
      { w: 0, label: 'V. IMP. IMPORTAÇÃO', value: money(t.importTaxAmount), align: r },
      { w: 0, label: 'V. TOTAL TRIBUTOS', value: money(t.approximateTaxes), align: r },
      { w: 0, label: 'V. TOTAL PRODUTOS', value: money(t.productsAmount), align: r },
    ]);
    this.row([
      { w: 0, label: 'VALOR DO FRETE', value: money(t.freightAmount), align: r },
      { w: 0, label: 'VALOR DO SEGURO', value: money(t.insuranceAmount), align: r },
      { w: 0, label: 'DESCONTO', value: money(t.discountAmount), align: r },
      { w: 0, label: 'OUTRAS DESPESAS', value: money(t.otherAmount), align: r },
      { w: 0, label: 'VALOR TOTAL IPI', value: money(t.ipiAmount), align: r },
      { w: 0, label: 'V. TOTAL DA NOTA', value: money(t.invoiceAmount), align: r, bold: true },
    ]);
  }

  // ---------------------------------------------------------- transportador

  private drawCarrier() {
    const c = this.data.carrier;
    const v = this.data.volumes;
    this.ensureSpace(SECTION_TITLE_HEIGHT + FIELD_HEIGHT * 3);
    this.section('TRANSPORTADOR / VOLUMES TRANSPORTADOS');
    this.row([
      { w: 0, label: 'NOME / RAZÃO SOCIAL', value: c.name ?? '' },
      {
        w: 105,
        label: 'FRETE POR CONTA',
        value: c.freightMode ? (FREIGHT_MODE[c.freightMode] ?? c.freightMode) : '',
      },
      { w: 55, label: 'CÓDIGO ANTT', value: c.rntc ?? '' },
      { w: 55, label: 'PLACA DO VEÍCULO', value: c.plate ?? '' },
      { w: 22, label: 'UF', value: c.plateState ?? '', align: 'center' },
      { w: 95, label: 'CNPJ / CPF', value: document(c.document) },
    ]);
    this.row([
      { w: 0, label: 'ENDEREÇO', value: c.address ?? '' },
      { w: 160, label: 'MUNICÍPIO', value: c.city ?? '' },
      { w: 22, label: 'UF', value: c.state ?? '', align: 'center' },
      { w: 95, label: 'INSCRIÇÃO ESTADUAL', value: c.ie ?? '' },
    ]);
    this.row([
      { w: 0, label: 'QUANTIDADE', value: v.quantity ?? '', align: 'right' },
      { w: 0, label: 'ESPÉCIE', value: v.species ?? '' },
      { w: 0, label: 'MARCA', value: v.brand ?? '' },
      { w: 0, label: 'NUMERAÇÃO', value: v.numbering ?? '' },
      { w: 0, label: 'PESO BRUTO', value: weight(v.grossWeight), align: 'right' },
      { w: 0, label: 'PESO LÍQUIDO', value: weight(v.netWeight), align: 'right' },
    ]);
  }

  // ----------------------------------------------------------------- itens

  private get itemWidths(): number[] {
    const fixed = ITEM_COLUMNS.reduce((sum, column) => sum + column.width, 0);
    return ITEM_COLUMNS.map((column) => column.width || this.width - fixed);
  }

  private itemsHeader() {
    const { doc } = this;
    const widths = this.itemWidths;
    doc.font(FONT_BOLD).fontSize(LABEL_SIZE);
    const height =
      Math.max(
        ...ITEM_COLUMNS.map((column, i) =>
          doc.heightOfString(column.label, { width: widths[i]! - CELL_PADDING * 2 }),
        ),
      ) + 4;

    this.section('DADOS DOS PRODUTOS / SERVIÇOS');
    let x = this.left;
    ITEM_COLUMNS.forEach((column, i) => {
      this.rect(x, this.y, widths[i]!, height);
      doc
        .font(FONT_BOLD)
        .fontSize(LABEL_SIZE)
        .text(column.label, x + CELL_PADDING, this.y + 2, {
          width: widths[i]! - CELL_PADDING * 2,
          align: 'center',
        });
      x += widths[i]!;
    });
    this.y += height;
  }

  private drawItems() {
    const { doc } = this;
    const widths = this.itemWidths;

    this.ensureSpace(SECTION_TITLE_HEIGHT + 20 + 12);
    this.itemsHeader();

    for (const item of this.data.items) {
      doc.font(FONT).fontSize(ITEM_FONT_SIZE);
      const values = ITEM_COLUMNS.map((column) => column.value(item));
      const height = Math.max(
        10,
        ...values.map(
          (value, i) =>
            doc.heightOfString(value || ' ', { width: widths[i]! - CELL_PADDING * 2 }) + 3,
        ),
      );

      if (this.y + height > this.bottom) {
        this.newPage();
        this.itemsHeader();
      }

      let x = this.left;
      values.forEach((value, i) => {
        const w = widths[i]!;
        this.rect(x, this.y, w, height);
        doc
          .font(FONT)
          .fontSize(ITEM_FONT_SIZE)
          .text(value, x + CELL_PADDING, this.y + 2, {
            width: w - CELL_PADDING * 2,
            align: ITEM_COLUMNS[i]!.align,
          });
        x += w;
      });
      this.y += height;
    }
  }

  // ---------------------------------------------------------------- ISSQN

  private drawIssqn() {
    const issqn = this.data.issqn;
    if (!issqn) return;
    this.ensureSpace(SECTION_TITLE_HEIGHT + FIELD_HEIGHT);
    this.section('CÁLCULO DO ISSQN');
    this.row([
      { w: 0, label: 'INSCRIÇÃO MUNICIPAL', value: this.data.issuer.im ?? '' },
      {
        w: 0,
        label: 'VALOR TOTAL DOS SERVIÇOS',
        value: money(issqn.servicesAmount),
        align: 'right',
      },
      { w: 0, label: 'BASE DE CÁLCULO DO ISSQN', value: money(issqn.base), align: 'right' },
      { w: 0, label: 'VALOR DO ISSQN', value: money(issqn.amount), align: 'right' },
    ]);
  }

  // ------------------------------------------------------ dados adicionais

  private drawAdditionalInfo() {
    const { doc, data } = this;
    const fiscoWidth = 185;
    const infoWidth = this.width - fiscoWidth;
    const info = data.complementaryInfo ?? '';
    const fisco = data.fiscoInfo ?? '';

    // A altura é a do texto mais longo, com um mínimo para o quadro não
    // virar uma tira quando a nota não tem observação nenhuma.
    const maxHeight =
      this.bottom - MARGIN - (HEADER_BOX_HEIGHT + FIELD_HEIGHT * 2) - SECTION_TITLE_HEIGHT;
    let size = 6.5;
    const measure = () => {
      doc.font(FONT).fontSize(size);
      return (
        Math.max(
          info ? doc.heightOfString(info, { width: infoWidth - 6 }) : 0,
          fisco ? doc.heightOfString(fisco, { width: fiscoWidth - 6 }) : 0,
        ) + 12
      );
    };
    let height = Math.max(50, measure());
    // Texto maior que uma folha inteira: encolhe em vez de sair do papel.
    while (height > maxHeight && size > 4) {
      size -= 0.5;
      height = Math.max(50, measure());
    }

    this.ensureSpace(SECTION_TITLE_HEIGHT + height);
    this.section('DADOS ADICIONAIS');
    this.rect(this.left, this.y, infoWidth, height);
    this.label('INFORMAÇÕES COMPLEMENTARES', this.left, this.y, infoWidth);
    doc
      .font(FONT)
      .fontSize(size)
      .text(info, this.left + 3, this.y + 9, { width: infoWidth - 6 });
    this.rect(this.left + infoWidth, this.y, fiscoWidth, height);
    this.label('RESERVADO AO FISCO', this.left + infoWidth, this.y, fiscoWidth);
    doc
      .font(FONT)
      .fontSize(size)
      .text(fisco, this.left + infoWidth + 3, this.y + 9, { width: fiscoWidth - 6 });
    this.y += height;
  }

  // ------------------------------------------------------------ paginação

  private ensureSpace(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }

  /// Folhas seguintes repetem o quadro do emitente (sem o canhoto): quem
  /// pega a folha 3 solta sabe de que nota ela é.
  private newPage() {
    this.doc.addPage({ size: 'A4', margin: 0 });
    this.doc.lineWidth(LINE_WIDTH).strokeColor('#000000').fillColor('#000000');
    this.y = MARGIN;
    this.drawHeader();
  }

  // ------------------------------------------------------------ primitivas

  private section(title: string) {
    this.doc
      .font(FONT_BOLD)
      .fontSize(6.5)
      .text(title, this.left, this.y + 2.5, { lineBreak: false });
    this.y += SECTION_TITLE_HEIGHT;
  }

  /// Uma linha de campos. `w: 0` divide igualmente o que sobrar entre eles.
  private row(
    cells: {
      w: number;
      label: string;
      value: string;
      align?: 'left' | 'right' | 'center';
      bold?: boolean;
    }[],
  ) {
    const fixed = cells.reduce((sum, cell) => sum + cell.w, 0);
    const flexible = cells.filter((cell) => cell.w === 0).length;
    const share = flexible ? (this.width - fixed) / flexible : 0;
    let x = this.left;
    for (const cell of cells) {
      const w = cell.w || share;
      this.field(x, this.y, w, FIELD_HEIGHT, cell.label, cell.value, {
        align: cell.align,
        bold: cell.bold,
      });
      x += w;
    }
    this.y += FIELD_HEIGHT;
  }

  private field(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    opts: { align?: 'left' | 'right' | 'center'; bold?: boolean } = {},
  ) {
    this.rect(x, y, w, h);
    this.label(label, x, y, w);
    this.fitLine(value, x + 2, y + h - VALUE_SIZE - 3, w - 4, VALUE_SIZE, opts);
  }

  private label(text: string, x: number, y: number, w: number) {
    this.doc
      .font(FONT)
      .fontSize(LABEL_SIZE)
      .text(text, x + 2, y + 1.5, { width: w - 4, lineBreak: false, ellipsis: true });
  }

  /// Texto de uma linha que encolhe até caber. Só depois do menor corpo é que
  /// reticências entram — um campo ilegível de tão pequeno é pior que isso.
  private fitLine(
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
    opts: { align?: 'left' | 'right' | 'center'; bold?: boolean } = {},
  ) {
    if (!text) return;
    const { doc } = this;
    doc.font(opts.bold ? FONT_BOLD : FONT);
    let current = size;
    doc.fontSize(current);
    while (doc.widthOfString(text) > width && current > MIN_VALUE_SIZE) {
      current -= 0.25;
      doc.fontSize(current);
    }
    // Baixa o texto menor para ele continuar alinhado pela base.
    doc.text(text, x, y + (size - current), {
      width,
      align: opts.align ?? 'left',
      lineBreak: false,
      ellipsis: true,
    });
  }

  /// Parágrafo que encolhe até caber na altura. Devolve a altura usada.
  private paragraph(
    text: string,
    x: number,
    y: number,
    width: number,
    maxHeight: number,
    size: number,
    opts: { align?: 'left' | 'center'; bold?: boolean } = {},
  ): number {
    const { doc } = this;
    doc.font(opts.bold ? FONT_BOLD : FONT);
    let current = size;
    doc.fontSize(current);
    while (doc.heightOfString(text, { width }) > maxHeight && current > MIN_VALUE_SIZE) {
      current -= 0.25;
      doc.fontSize(current);
    }
    const height = Math.min(doc.heightOfString(text, { width }), maxHeight);
    doc.text(text, x, y, { width, height: maxHeight, align: opts.align ?? 'left', ellipsis: true });
    return height;
  }

  private centered(text: string, x: number, y: number, width: number, size: number, bold = false) {
    this.doc
      .font(bold ? FONT_BOLD : FONT)
      .fontSize(size)
      .text(text, x, y, { width, align: 'center', lineBreak: false });
  }

  private rect(x: number, y: number, w: number, h: number) {
    this.doc.rect(x, y, w, h).stroke();
  }

  private barcode(digits: string, x: number, y: number, width: number, height: number) {
    const widths = code128cWidths(digits);
    const modules = widths.reduce((sum, value) => sum + value, 0);
    const moduleWidth = width / modules;
    let cursor = x;
    widths.forEach((w, index) => {
      // Índices pares são barras; ímpares, espaços.
      if (index % 2 === 0) this.doc.rect(cursor, y, w * moduleWidth, height).fill('#000000');
      cursor += w * moduleWidth;
    });
  }
}

function fillPageNumbers(doc: Doc, total: number) {
  const positions = folhaPositions.get(doc) ?? [];
  const range = doc.bufferedPageRange();
  positions.forEach((position, index) => {
    doc.switchToPage(range.start + index);
    doc
      .font(FONT_BOLD)
      .fontSize(8.5)
      .fillColor('#000000')
      .text(`FOLHA ${index + 1}/${total}`, position.x, position.y, {
        width: position.width,
        align: 'center',
        lineBreak: false,
      });
  });
}

function stamp(doc: Doc, text: string, color: string) {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.rotate(-35, { origin: [cx, cy] });
  doc.font(FONT_BOLD).fontSize(64).fillColor(color).fillOpacity(0.3);
  const w = doc.widthOfString(text);
  doc.text(text, cx - w / 2, cy - 32, { lineBreak: false });
  doc.restore();
  doc.fillColor('#000000').fillOpacity(1);
}

// ---------------------------------------------------------------- formatação

const moneyFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantityFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 10,
});
const weightFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function money(value: string | null): string {
  return moneyFormat.format(Number(value ?? 0) || 0);
}

function quantity(value: string): string {
  return quantityFormat.format(Number(value) || 0);
}

function rate(value: string | null): string {
  return value === null ? '' : moneyFormat.format(Number(value) || 0);
}

function weight(value: string | null): string {
  return value === null ? '' : weightFormat.format(Number(value) || 0);
}

/// `123` → `000.000.123`, como o MOC pede.
export function invoiceNumber(number: string): string {
  return pad(number, 9).replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
}

function pad(value: string, size: number): string {
  return value.replace(/\D/g, '').padStart(size, '0');
}

export function formatKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function document(value: string | null): string {
  const d = value?.replace(/\D/g, '') ?? '';
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return value ?? '';
}

function zip(value: string | null): string {
  const d = value?.replace(/\D/g, '') ?? '';
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (value ?? '');
}

function phone(value: string | null): string {
  const d = value?.replace(/\D/g, '') ?? '';
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  return value ?? '';
}
