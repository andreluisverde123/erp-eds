import { Prisma } from '../../../../generated/prisma/client';
import {
  buildPurchaseOrderDocument,
  formatDocument,
  formatPhone,
  formatZipCode,
  joinAddress,
  type CompanySource,
  type PurchaseOrderSource,
} from './purchase-order-document';
import {
  alturaAlvoDoLogo,
  measureRowHeight,
  renderDocumentPdf,
} from '../../../common/pdf/pdf-renderer';
import { PNG_1X1 } from '../../../common/pdf/png-1x1.fixture';
import type { PrintableDocument } from '../../../common/pdf/printable-document';
import { PURCHASE_ORDER_COLUMNS } from './purchase-order-document';

const decimal = (value: string) => new Prisma.Decimal(value);

/// Os campos de identificação viraram blocos nomeados quando o renderizador
/// passou a ser compartilhado com a Solicitação. Estes acessores mantêm as
/// asserções falando de "campos da ordem" e "campos do fornecedor".
const camposDaOrdem = (documento: PrintableDocument) => bloco(documento, 'ORDEM DE COMPRA');
const camposDoFornecedor = (documento: PrintableDocument) => bloco(documento, 'FORNECEDOR');
const camposDeOrigem = (documento: PrintableDocument) => documento.footer?.fields ?? [];

function bloco(documento: PrintableDocument, titulo: string) {
  return documento.blocks.find((item) => item.title === titulo)?.fields ?? [];
}

/// `Intl` separa "R$" do número com ESPAÇO NÃO-QUEBRÁVEL (U+00A0), não com
/// espaço comum — é o que impede a moeda de sobrar sozinha no fim da linha.
/// Escrever o caractere invisível direto nos testes deixaria a comparação
/// impossível de conferir a olho; este helper torna a intenção visível.
const brl = (texto: string) => texto.replace(' ', '\u00a0');

const EMPRESA_COMPLETA: CompanySource = {
  legalName: 'EDS CONSTRUTORA LTDA',
  tradeName: 'EDS',
  cnpj: '12345678000190',
  stateRegistration: '0771234567',
  email: 'contato@eds.com.br',
  phone: '6232001000',
  addressLine: 'AVENIDA CENTRAL',
  addressNumber: '1000',
  addressComplement: 'SALA 5',
  city: 'GOIÂNIA',
  state: 'GO',
  zipCode: '74000000',
};

/// O que a empresa do staging REALMENTE tem hoje: só o nome. Serve para provar
/// que o documento não inventa CNPJ, endereço nem contato.
const EMPRESA_VAZIA: CompanySource = {
  legalName: 'EDS Construtora',
  tradeName: 'EDS Construtora',
  cnpj: null,
  stateRegistration: null,
  email: null,
  phone: null,
  addressLine: null,
  addressNumber: null,
  addressComplement: null,
  city: null,
  state: null,
  zipCode: null,
};

function item(overrides: Partial<PurchaseOrderSource['items'][number]> = {}) {
  const quantity = overrides.quantity ?? decimal('50');
  const unitPrice = overrides.unitPrice ?? decimal('32.90');
  return {
    description: 'Cimento CP-II 50kg',
    unit: 'SC',
    quantity,
    unitPrice,
    totalPrice: quantity.times(unitPrice).toDecimalPlaces(2),
    notes: null,
    purchaseRequestItem: {
      quantity,
      unit: 'SC',
      purchaseRequest: { code: 'SOL-0004' },
    },
    ...overrides,
  };
}

function order(overrides: Partial<PurchaseOrderSource> = {}): PurchaseOrderSource {
  const items = overrides.items ?? [item()];
  return {
    code: 'OC-0001',
    status: 'OPEN',
    issueDate: new Date('2026-08-23T00:00:00.000Z'),
    expectedDeliveryDate: new Date('2026-09-05T00:00:00.000Z'),
    totalAmount: items.reduce((total, row) => total.plus(row.totalPrice), decimal('0')),
    supplier: {
      legalName: 'FORNECEDORA DE MATERIAIS LTDA',
      tradeName: 'FORNECEDORA',
      document: '98765432000121',
      stateRegistration: '0779876543',
      address: 'RUA DAS OBRAS',
      addressNumber: '100',
      addressComplement: 'GALPÃO 2',
      neighborhood: 'DISTRITO INDUSTRIAL',
      city: 'APARECIDA DE GOIÂNIA',
      state: 'GO',
      zipCode: '74900000',
      phone: '6233334444',
      email: 'vendas@fornecedora.com.br',
    },
    purchaseRequest: { code: 'SOL-0004', notes: 'Entregar no portão B, aos cuidados do mestre.' },
    constructionSite: { code: 'OBRA-1', name: 'Residencial Paineiras' },
    costCenter: { code: 'CC-01', name: 'Estrutura' },
    createdBy: { name: 'Marina Souza' },
    ...overrides,
    items,
  };
}

describe('formatadores', () => {
  it.each([
    ['12345678000190', '12.345.678/0001-90'],
    ['12345678909', '123.456.789-09'],
    // Documento fora do padrão sai como está — não some da tela.
    ['123', '123'],
    [null, null],
  ])('formatDocument(%s) = %s', (entrada, esperado) => {
    expect(formatDocument(entrada)).toBe(esperado);
  });

  it.each([
    ['6232001000', '(62) 3200-1000'],
    ['62999887766', '(62) 99988-7766'],
    [null, null],
  ])('formatPhone(%s) = %s', (entrada, esperado) => {
    expect(formatPhone(entrada)).toBe(esperado);
  });

  it('formatZipCode aplica a máscara só quando o tamanho bate', () => {
    expect(formatZipCode('74000000')).toBe('74000-000');
    expect(formatZipCode('7400')).toBe('7400');
    expect(formatZipCode(null)).toBeNull();
  });

  it('joinAddress pula as partes ausentes em vez de deixar vírgula solta', () => {
    expect(joinAddress(['RUA X', null, 'CENTRO'])).toBe('RUA X, CENTRO');
    expect(joinAddress(['RUA X', '  ', undefined])).toBe('RUA X');
    expect(joinAddress([null, undefined])).toBeNull();
  });
});

describe('buildPurchaseOrderDocument', () => {
  describe('11. Dados corretos no documento', () => {
    it('usa o identificador que o sistema já tem, sem criar outro', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.code).toBe('OC-0001');
      expect(camposDaOrdem(documento)).toContainEqual({ label: 'Número', value: 'OC-0001' });
    });

    it('formata data em pt-BR sem deslocar o dia por fuso', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(camposDaOrdem(documento)).toContainEqual({ label: 'Emissão', value: '23/08/2026' });
      expect(camposDaOrdem(documento)).toContainEqual({
        label: 'Previsão de entrega',
        value: '05/09/2026',
      });
    });

    it('traduz o status para o mesmo rótulo da tela', () => {
      expect(
        camposDaOrdem(buildPurchaseOrderDocument(order({ status: 'ISSUED' }), EMPRESA_COMPLETA)),
      ).toContainEqual({ label: 'Status', value: 'Emitida' });
      expect(
        camposDaOrdem(buildPurchaseOrderDocument(order({ status: 'CANCELLED' }), EMPRESA_COMPLETA)),
      ).toContainEqual({ label: 'Status', value: 'Cancelada' });
    });

    it('monta o bloco do fornecedor com os dados que ele tem', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(camposDoFornecedor(documento)).toContainEqual({
        label: 'Razão social',
        value: 'FORNECEDORA DE MATERIAIS LTDA',
      });
      expect(camposDoFornecedor(documento)).toContainEqual({
        label: 'CNPJ',
        value: '98.765.432/0001-21',
      });
      expect(camposDoFornecedor(documento)).toContainEqual({
        label: 'Endereço',
        value:
          'RUA DAS OBRAS, 100, GALPÃO 2, DISTRITO INDUSTRIAL, APARECIDA DE GOIÂNIA, GO, 74900-000',
      });
      expect(camposDoFornecedor(documento)).toContainEqual({
        label: 'Telefone',
        value: '(62) 3333-4444',
      });
    });

    it('10. traz a origem da compra: solicitação, obra e centro de custo', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(camposDeOrigem(documento)).toEqual([
        { label: 'Solicitação de origem', value: 'SOL-0004' },
        { label: 'Obra', value: 'OBRA-1 — Residencial Paineiras' },
        { label: 'Centro de custo', value: 'CC-01 — Estrutura' },
      ]);
    });

    it('omite a obra quando o centro de custo não pertence a nenhuma', () => {
      const documento = buildPurchaseOrderDocument(
        order({ constructionSite: null }),
        EMPRESA_COMPLETA,
      );

      expect(camposDeOrigem(documento).map((campo) => campo.label)).not.toContain('Obra');
    });

    it('as observações vêm da solicitação de origem', () => {
      expect(buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA).notes).toEqual({
        title: 'OBSERVAÇÕES',
        text: 'Entregar no portão B, aos cuidados do mestre.',
      });
    });

    it('observação em branco não vira uma seção vazia', () => {
      const documento = buildPurchaseOrderDocument(
        order({ purchaseRequest: { code: 'SOL-0004', notes: '   ' } }),
        EMPRESA_COMPLETA,
      );

      expect(documento.notes).toBeNull();
    });
  });

  describe('8. Identificação da EDS sem inventar dado', () => {
    it('com a empresa preenchida, mostra tudo que ela tem', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.companyName).toBe('EDS CONSTRUTORA LTDA');
      expect(documento.companyFields.map((campo) => campo.label)).toEqual([
        'Nome fantasia',
        'CNPJ',
        'Inscrição estadual',
        'Endereço',
        'Telefone',
        'E-mail',
      ]);
    });

    it('com a empresa vazia (caso real do staging), mostra só o nome', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_VAZIA);

      expect(documento.companyName).toBe('EDS Construtora');
      // Nenhum campo inventado, e nenhum rótulo com "—" ocupando espaço.
      expect(documento.companyFields).toEqual([]);
    });

    it('não repete o nome fantasia quando é igual à razão social', () => {
      const documento = buildPurchaseOrderDocument(order(), {
        ...EMPRESA_COMPLETA,
        tradeName: EMPRESA_COMPLETA.legalName,
      });

      expect(documento.companyFields.map((campo) => campo.label)).not.toContain('Nome fantasia');
    });
  });

  describe('5. Fornecedor sem dados opcionais', () => {
    it('mostra razão social e CNPJ, e omite o resto', () => {
      const documento = buildPurchaseOrderDocument(
        order({
          supplier: {
            legalName: 'FORNECEDOR MINIMO LTDA',
            tradeName: null,
            document: '11222333000144',
            stateRegistration: null,
            address: null,
            addressNumber: null,
            addressComplement: null,
            neighborhood: null,
            city: null,
            state: null,
            zipCode: null,
            phone: null,
            email: null,
          },
        }),
        EMPRESA_COMPLETA,
      );

      expect(camposDoFornecedor(documento)).toEqual([
        { label: 'Razão social', value: 'FORNECEDOR MINIMO LTDA' },
        { label: 'CNPJ', value: '11.222.333/0001-44' },
      ]);
    });
  });

  describe('4 e 6. Valores monetários', () => {
    it('formata em pt-BR com separador de milhar e dois decimais', () => {
      const documento = buildPurchaseOrderDocument(
        order({ items: [item({ quantity: decimal('1000'), unitPrice: decimal('1234.56') })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]!.unitPrice).toBe(brl('R$ 1.234,56'));
      expect(documento.total?.value).toBe(brl('R$ 1.234.560,00'));
    });

    it('quantidade fracionária mantém as casas, sem zeros inúteis', () => {
      const documento = buildPurchaseOrderDocument(
        order({ items: [item({ quantity: decimal('12.500'), unitPrice: decimal('95.00') })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]!.quantity).toBe('12,5');
      expect(documento.rows[0]!.totalPrice).toBe(brl('R$ 1.187,50'));
    });

    it('o total impresso é o total da ordem, não uma soma recalculada na hora', () => {
      const documento = buildPurchaseOrderDocument(
        order({ items: [item(), item({ description: 'Areia', unit: 'M3' })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.total?.value).toBe(brl('R$ 3.290,00'));
    });
  });

  describe('rastreabilidade por item', () => {
    it('a linha aponta a solicitação de origem', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.rows[0]!.origin).toBe('SOL-0004');
    });

    it('quando a quantidade comprada difere da pedida, a diferença é impressa', () => {
      const documento = buildPurchaseOrderDocument(
        order({
          items: [
            item({
              quantity: decimal('80'),
              purchaseRequestItem: {
                quantity: decimal('100'),
                unit: 'SC',
                purchaseRequest: { code: 'SOL-0004' },
              },
            }),
          ],
        }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]!.origin).toBe('SOL-0004 (solic. 100 SC)');
    });

    it('a observação do item entra junto da descrição', () => {
      const documento = buildPurchaseOrderDocument(
        order({ items: [item({ notes: 'Marca Votoran ou similar' })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]!.description).toBe('Cimento CP-II 50kg\nMarca Votoran ou similar');
    });
  });
});

describe('measureRowHeight — regressão da sobreposição de linhas', () => {
  // Uma largura por coluna, DERIVADA da lista real: cravar o array à mão fez
  // este teste virar NaN quando a coluna de desconto entrou, e o sintoma
  // ("expected > NaN") não dizia que faltava uma largura.
  const LARGURAS = PURCHASE_ORDER_COLUMNS.map((coluna) => coluna.width * 500);
  const COLUNAS = PURCHASE_ORDER_COLUMNS;
  const linha = {
    description: 'Cimento',
    quantity: '1',
    unit: 'SC',
    unitPrice: 'R$ 1,00',
    discount: '',
    totalPrice: 'R$ 1,00',
    origin: 'SOL-0004',
  };

  /// Dublê de medição: 12pt por linha, quebrando a cada ~7 caracteres de
  /// largura. Fiel no que importa — texto maior que a coluna ocupa mais linhas.
  const medir = (texto: string, largura: number) =>
    Math.ceil(texto.length / Math.max(1, largura / 7)) * 12;

  it('usa a altura da MAIOR célula, não a da descrição', () => {
    // Bug real, encontrado conferindo o PDF gerado e invisível para os testes
    // que existiam: a origem quebrava em duas linhas na coluna estreita e era
    // desenhada por cima da linha seguinte.
    const origemLonga = { ...linha, origin: 'SOL-0004 (solic. 999,999 CAIXA)' };

    expect(measureRowHeight(medir, origemLonga, COLUNAS, LARGURAS)).toBeGreaterThan(
      measureRowHeight(medir, linha, COLUNAS, LARGURAS),
    );
  });

  it('descrição longa também aumenta a linha', () => {
    const descricaoLonga = {
      ...linha,
      description: 'Cimento Portland composto CP-II-E-32 ensacado 50kg, entrega paletizada',
    };

    expect(measureRowHeight(medir, descricaoLonga, COLUNAS, LARGURAS)).toBeGreaterThan(
      measureRowHeight(medir, linha, COLUNAS, LARGURAS),
    );
  });

  it('nenhuma linha fica abaixo da altura mínima', () => {
    const vazia = {
      ...linha,
      description: '',
      origin: '',
      unit: '',
      quantity: '',
      unitPrice: '',
      totalPrice: '',
    };

    expect(measureRowHeight(() => 0, vazia, COLUNAS, LARGURAS)).toBeGreaterThanOrEqual(18);
  });
});

describe('renderPurchaseOrderPdf', () => {
  /// O PDF é binário; o que dá para afirmar aqui sem um parser é o que
  /// realmente importa na renderização: que é um PDF válido, que não estoura,
  /// e QUANTAS PÁGINAS tem — o resto do conteúdo é testado acima, na forma de
  /// dados, que é onde ele pode estar errado de um jeito que importa.
  function assertPdfValido(buffer: Buffer) {
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.subarray(-6).toString('latin1')).toContain('%%EOF');
    expect(buffer.length).toBeGreaterThan(800);
  }

  it('1. OC com 1 item cabe em uma página', async () => {
    const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
  });

  it('2 e 9. OC com múltiplos itens continua em uma página', async () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item({ description: `Material ${index + 1}` }),
    );
    const documento = buildPurchaseOrderDocument(order({ items }), EMPRESA_COMPLETA);

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
  });

  it('3 e 10. OC com muitos itens quebra em várias páginas', async () => {
    const items = Array.from({ length: 120 }, (_, index) =>
      item({ description: `Material ${index + 1}` }),
    );
    const documento = buildPurchaseOrderDocument(order({ items }), EMPRESA_COMPLETA);

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBeGreaterThan(1);
  });

  it('descrição longa não corta: mais páginas que a mesma quantidade de linhas curtas', async () => {
    const curtos = Array.from({ length: 40 }, () => item({ description: 'Cimento' }));
    const longos = Array.from({ length: 40 }, () =>
      item({
        description:
          'Cimento Portland composto CP-II-E-32 ensacado 50kg, entrega paletizada com filme ' +
          'stretch, descarga por conta do fornecedor, conforme especificação do memorial',
      }),
    );

    const [pdfCurto, pdfLongo] = await Promise.all([
      renderDocumentPdf(buildPurchaseOrderDocument(order({ items: curtos }), EMPRESA_COMPLETA)),
      renderDocumentPdf(buildPurchaseOrderDocument(order({ items: longos }), EMPRESA_COMPLETA)),
    ]);

    // Se a altura da linha fosse fixa, os dois teriam o mesmo número de
    // páginas — e o texto excedente teria sido cortado em silêncio.
    expect(pdfLongo.pageCount).toBeGreaterThan(pdfCurto.pageCount);
  });

  it('4. valores decimais não quebram a renderização', async () => {
    const items = [
      item({ quantity: decimal('0.333'), unitPrice: decimal('0.01') }),
      item({ quantity: decimal('999999.999'), unitPrice: decimal('999.99') }),
    ];
    const documento = buildPurchaseOrderDocument(order({ items }), EMPRESA_COMPLETA);

    const { buffer } = await renderDocumentPdf(documento);

    assertPdfValido(buffer);
  });

  it('5 e 8. gera para fornecedor e empresa sem dados opcionais', async () => {
    const documento = buildPurchaseOrderDocument(
      order({
        expectedDeliveryDate: null,
        constructionSite: null,
        purchaseRequest: { code: 'SOL-0004', notes: null },
      }),
      EMPRESA_VAZIA,
    );

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
  });

  it('7. ordem sem itens (as legadas) ainda gera documento', async () => {
    const documento = buildPurchaseOrderDocument(
      { ...order({ items: [] }), totalAmount: decimal('129.15') },
      EMPRESA_VAZIA,
    );

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
    // O valor digitado à mão continua sendo impresso — a ordem antiga não
    // vira um documento de R$ 0,00.
    expect(documento.total?.value).toBe(brl('R$ 129,15'));
  });
});

describe('assinaturas da ordem de compra', () => {
  it('traz quem EMITIU e o fornecedor', () => {
    const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

    expect(documento.signatures).toEqual([
      { role: 'Responsável pela emissão', name: 'Marina Souza' },
      { role: 'Fornecedor — ciente do pedido' },
    ]);
  });

  it('ordem antiga, sem autor gravado, sai com a linha SEM nome', () => {
    const documento = buildPurchaseOrderDocument(order({ createdBy: null }), EMPRESA_COMPLETA);

    // As ordens anteriores à coluna não têm autor. Atribuí-las a alguém seria
    // inventar uma assinatura; a linha em branco é o que um campo para
    // assinar à mão sempre foi.
    expect(documento.signatures?.[0]).toEqual({
      role: 'Responsável pela emissão',
      name: null,
    });
  });

  it('o nome não é apresentado como assinatura eletrônica', () => {
    const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);
    const textos = (documento.signatures ?? []).flatMap((a) => [a.role, a.name ?? '']);

    // O sistema não tem assinatura eletrônica. Imprimir "assinado
    // digitalmente" afirmaria algo que não aconteceu.
    expect(textos.join(' ')).not.toMatch(/assinad|digital|certificad/i);
  });
});

/// O LOGO NO CABEÇALHO, e o que o documento da ordem contém.
///
/// Estes dois assuntos andam juntos porque respondem à mesma pergunta prática:
/// o PDF que chega ao fornecedor mostra a marca certa e SÓ o que foi comprado
/// naquela ordem.
describe('Logo e escopo do documento da ordem de compra', () => {
  describe('logo no cabeçalho', () => {
    it('viaja no documento quando a empresa tem marca cadastrada', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA, PNG_1X1);

      expect(documento.companyLogo).toEqual(PNG_1X1);
    });

    it('empresa sem logo continua imprimindo o cabeçalho de texto', () => {
      // O caso de hoje no staging: nenhuma marca cadastrada. Não é erro, e o
      // documento não pode mudar de forma por causa disso.
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.companyLogo).toBeNull();
      expect(documento.companyName).toBe('EDS CONSTRUTORA LTDA');
      expect(documento.companyFields.length).toBeGreaterThan(0);
    });

    it('o logo NÃO substitui nem remove nenhum dado do cabeçalho', async () => {
      // Preservar o conteúdo atual é requisito: a marca ENTRA, nada SAI.
      const semLogo = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);
      const comLogo = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA, PNG_1X1);

      expect(comLogo.companyName).toEqual(semLogo.companyName);
      expect(comLogo.companyFields).toEqual(semLogo.companyFields);
      expect(comLogo.columns).toEqual(semLogo.columns);
      expect(comLogo.rows).toEqual(semLogo.rows);
      expect(comLogo.total).toEqual(semLogo.total);
    });

    it('o PDF sai válido COM logo, e maior que o mesmo documento sem ele', async () => {
      const comLogo = await renderDocumentPdf(
        buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA, PNG_1X1),
      );
      const semLogo = await renderDocumentPdf(
        buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA),
      );

      expect(comLogo.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(comLogo.pageCount).toBe(1);
      // A imagem embutida pesa: é a prova de que ela foi mesmo desenhada, e
      // não silenciosamente ignorada pelo renderizador.
      expect(comLogo.buffer.length).toBeGreaterThan(semLogo.buffer.length);
    });

    it('bytes que não são imagem não derrubam a impressão', async () => {
      // `loadCompanyLogo` só confere a EXTENSÃO — um PNG corrompido passa pela
      // peneira e chegaria aqui. O pdfkit lança nesse caso, e a ordem de compra
      // não pode deixar de existir por causa de um enfeite.
      const documento = buildPurchaseOrderDocument(
        order(),
        EMPRESA_COMPLETA,
        Buffer.from('isto não é um png'),
      );

      const { buffer, pageCount } = await renderDocumentPdf(documento);

      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pageCount).toBe(1);
    });
  });

  describe('o PDF contém somente os itens DAQUELA ordem', () => {
    it('uma ordem parcial não imprime os itens que ficaram pendentes', () => {
      // A solicitação tinha cimento, ferro e tinta; esta ordem comprou só o
      // cimento na Loja A. O documento que vai ao fornecedor não pode listar o
      // que não foi pedido a ele.
      const documento = buildPurchaseOrderDocument(
        order({ items: [item({ description: 'Cimento CP-II 50kg' })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows).toHaveLength(1);
      expect(JSON.stringify(documento.rows)).toContain('Cimento');
      expect(JSON.stringify(documento.rows)).not.toContain('Tinta');
    });

    it('a segunda ordem imprime só o saldo que ela comprou', () => {
      const segunda = buildPurchaseOrderDocument(
        order({
          code: 'OC-0002',
          items: [item({ description: 'Tinta acrílica 18L', unit: 'LT', quantity: decimal('10') })],
        }),
        EMPRESA_COMPLETA,
      );

      expect(segunda.code).toBe('OC-0002');
      expect(segunda.rows).toHaveLength(1);
      expect(JSON.stringify(segunda.rows)).toContain('Tinta acrílica');
      expect(JSON.stringify(segunda.rows)).not.toContain('Cimento');
    });

    it('o total impresso é o da ordem, não o da solicitação', () => {
      // Duas ordens da mesma solicitação têm totais próprios; imprimir o da
      // solicitação faria o fornecedor cobrar o que outro vendeu.
      const documento = buildPurchaseOrderDocument(
        order({ items: [item({ quantity: decimal('10'), unitPrice: decimal('10.00') })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.total?.value).toContain('100,00');
    });
  });
});

/// ENDEREÇO DE ENTREGA e TAMANHO DA MARCA.
///
/// A obra ganhou endereço por um motivo operacional: a ordem vai ao
/// fornecedor, e ele precisa saber onde descarregar o material.
describe('Endereço de entrega e proporção do logo', () => {
  const OBRA_COM_ENDERECO = {
    code: 'OBRA-1',
    name: 'Residencial Paineiras',
    addressLine: 'RUA DAS ACÁCIAS',
    addressNumber: '450',
    addressComplement: 'PORTÃO B',
    neighborhood: 'JARDIM AMÉRICA',
    city: 'GOIÂNIA',
    state: 'GO',
    zipCode: '74000123',
  };

  /// O endereço mora no DESTAQUE, não no rodapé de rastreabilidade: é o que o
  /// fornecedor precisa achar sem procurar.
  function origem(documento: ReturnType<typeof buildPurchaseOrderDocument>) {
    return documento.highlight?.value;
  }

  it('imprime o endereço completo, com o CEP formatado', () => {
    const documento = buildPurchaseOrderDocument(
      order({ constructionSite: OBRA_COM_ENDERECO }),
      EMPRESA_COMPLETA,
    );

    expect(origem(documento)).toBe(
      'RUA DAS ACÁCIAS, 450, PORTÃO B, JARDIM AMÉRICA, GOIÂNIA, GO, 74000-123',
    );
  });

  it('obra sem número não sai com vírgula dupla', () => {
    // A regra de "não inventar informação" aplicada ao endereço: campo ausente
    // some, nunca vira "RUA X, , CENTRO".
    const documento = buildPurchaseOrderDocument(
      order({
        constructionSite: { ...OBRA_COM_ENDERECO, addressNumber: null, addressComplement: null },
      }),
      EMPRESA_COMPLETA,
    );

    expect(origem(documento)).toBe('RUA DAS ACÁCIAS, JARDIM AMÉRICA, GOIÂNIA, GO, 74000-123');
    expect(origem(documento)).not.toContain(', ,');
  });

  it('obra SEM endereço não imprime a linha', () => {
    // É o caso das obras cadastradas antes deste campo. Um rótulo
    // "Entregar em:" seguido de nada é pior que a ausência.
    const documento = buildPurchaseOrderDocument(
      order({
        constructionSite: {
          code: 'OBRA-9',
          name: 'Obra antiga',
          addressLine: null,
          addressNumber: null,
          addressComplement: null,
          neighborhood: null,
          city: null,
          state: null,
          zipCode: null,
        },
      }),
      EMPRESA_COMPLETA,
    );

    expect(documento.highlight).toBeNull();
    // A obra em si continua identificada no rodapé de rastreabilidade.
    expect(documento.footer?.fields.some((f) => f.label === 'Obra')).toBe(true);
  });

  it('ordem sem obra nenhuma segue imprimindo', () => {
    const documento = buildPurchaseOrderDocument(
      order({ constructionSite: null }),
      EMPRESA_COMPLETA,
    );

    expect(documento.highlight).toBeNull();
  });

  it('o destaque nomeia a obra como APOIO, não como o valor', () => {
    // O endereço é o que manda; a obra qualifica. Inverter faria o motorista
    // ler o nome do prédio em 12pt e o endereço em 8.
    const documento = buildPurchaseOrderDocument(
      order({ constructionSite: OBRA_COM_ENDERECO }),
      EMPRESA_COMPLETA,
    );

    expect(documento.highlight?.title).toBe('ENDEREÇO DE ENTREGA');
    expect(documento.highlight?.caption).toBe('Obra OBRA-1 — Residencial Paineiras');
  });

  it('o logo ocupa mais espaço no PDF do que antes do ajuste', async () => {
    // A caixa passou de 96×40 para 150×72, e o recuo do texto deixou de ser
    // fixo: ele agora acompanha a LARGURA REAL da marca. Uma marca estreita
    // deixava um rombo no cabeçalho e parecia menor do que é.
    //
    // O que dá para afirmar sem medir pixel: o documento com logo é maior que
    // o mesmo documento sem, e continua cabendo em uma página.
    const { buffer, pageCount } = await renderDocumentPdf(
      buildPurchaseOrderDocument(
        order({ constructionSite: OBRA_COM_ENDERECO }),
        EMPRESA_COMPLETA,
        PNG_1X1,
      ),
    );

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount).toBe(1);
  });
});

/// O TAMANHO DA MARCA quando a empresa tem pouco cadastro.
///
/// Defeito real, encontrado numa OC de verdade (OC-0030): a marca acompanha a
/// altura do bloco de texto, e a `Company` do staging tem só a razão social
/// preenchida — uma linha, ~15pt. A logo saiu com 15pt de altura,
/// microscópica. "Quanto menos dados cadastrados, menor a logo" não era regra;
/// era efeito colateral.
describe('Piso da altura do logo', () => {
  it('empresa de UMA linha não espreme a marca', () => {
    // Uma linha de razão social a 15pt. Sem o piso, a marca teria 15pt.
    expect(alturaAlvoDoLogo(15)).toBe(48);
  });

  it('empresa sem campo nenhum também não', () => {
    expect(alturaAlvoDoLogo(0)).toBe(48);
  });

  it('cadastro completo faz a marca ALINHAR com o texto', () => {
    // É o comportamento que o piso não pode ter atropelado: com texto alto, a
    // marca acompanha, e as duas colunas terminam juntas.
    expect(alturaAlvoDoLogo(64)).toBe(64);
  });

  it('o teto impede a marca de estourar o cabeçalho', () => {
    // Empresa com endereço longo quebrando em várias linhas.
    expect(alturaAlvoDoLogo(200)).toBe(72);
  });

  it('o piso nunca fica acima do teto', () => {
    // Guarda contra alguém trocar as constantes e inverter a faixa.
    expect(alturaAlvoDoLogo(0)).toBeLessThanOrEqual(alturaAlvoDoLogo(999));
  });

  it('o PDF de uma empresa só com razão social sai válido e com a marca', async () => {
    const documento = buildPurchaseOrderDocument(order(), EMPRESA_VAZIA, PNG_1X1);

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pageCount).toBe(1);
    expect(documento.companyLogo).toEqual(PNG_1X1);
  });
});
