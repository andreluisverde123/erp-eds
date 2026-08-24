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
import { measureRowHeight, renderPurchaseOrderPdf } from './purchase-order-pdf';

const decimal = (value: string) => new Prisma.Decimal(value);

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
      expect(documento.orderFields).toContainEqual({ label: 'Número', value: 'OC-0001' });
    });

    it('formata data em pt-BR sem deslocar o dia por fuso', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.orderFields).toContainEqual({ label: 'Emissão', value: '23/08/2026' });
      expect(documento.orderFields).toContainEqual({
        label: 'Previsão de entrega',
        value: '05/09/2026',
      });
    });

    it('traduz o status para o mesmo rótulo da tela', () => {
      expect(
        buildPurchaseOrderDocument(order({ status: 'ISSUED' }), EMPRESA_COMPLETA).orderFields,
      ).toContainEqual({ label: 'Status', value: 'Emitida' });
      expect(
        buildPurchaseOrderDocument(order({ status: 'CANCELLED' }), EMPRESA_COMPLETA).orderFields,
      ).toContainEqual({ label: 'Status', value: 'Cancelada' });
    });

    it('monta o bloco do fornecedor com os dados que ele tem', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.supplierName).toBe('FORNECEDORA DE MATERIAIS LTDA');
      expect(documento.supplierFields).toContainEqual({
        label: 'CNPJ',
        value: '98.765.432/0001-21',
      });
      expect(documento.supplierFields).toContainEqual({
        label: 'Endereço',
        value:
          'RUA DAS OBRAS, 100, GALPÃO 2, DISTRITO INDUSTRIAL, APARECIDA DE GOIÂNIA, GO, 74900-000',
      });
      expect(documento.supplierFields).toContainEqual({
        label: 'Telefone',
        value: '(62) 3333-4444',
      });
    });

    it('10. traz a origem da compra: solicitação, obra e centro de custo', () => {
      const documento = buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA);

      expect(documento.traceabilityFields).toEqual([
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

      expect(documento.traceabilityFields.map((campo) => campo.label)).not.toContain('Obra');
    });

    it('as observações vêm da solicitação de origem', () => {
      expect(buildPurchaseOrderDocument(order(), EMPRESA_COMPLETA).notes).toBe(
        'Entregar no portão B, aos cuidados do mestre.',
      );
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

      expect(documento.supplierName).toBe('FORNECEDOR MINIMO LTDA');
      expect(documento.supplierFields).toEqual([
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
      expect(documento.total).toBe(brl('R$ 1.234.560,00'));
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

      expect(documento.total).toBe(brl('R$ 3.290,00'));
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
  const LARGURAS = [200, 45, 35, 70, 75, 75];
  const linha = {
    description: 'Cimento',
    quantity: '1',
    unit: 'SC',
    unitPrice: 'R$ 1,00',
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

    expect(measureRowHeight(medir, origemLonga, LARGURAS)).toBeGreaterThan(
      measureRowHeight(medir, linha, LARGURAS),
    );
  });

  it('descrição longa também aumenta a linha', () => {
    const descricaoLonga = {
      ...linha,
      description: 'Cimento Portland composto CP-II-E-32 ensacado 50kg, entrega paletizada',
    };

    expect(measureRowHeight(medir, descricaoLonga, LARGURAS)).toBeGreaterThan(
      measureRowHeight(medir, linha, LARGURAS),
    );
  });

  it('nenhuma linha fica abaixo da altura mínima', () => {
    const vazia = { ...linha, description: '', origin: '', unit: '', quantity: '', unitPrice: '', totalPrice: '' };

    expect(measureRowHeight(() => 0, vazia, LARGURAS)).toBeGreaterThanOrEqual(18);
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

    const { buffer, pageCount } = await renderPurchaseOrderPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
  });

  it('2 e 9. OC com múltiplos itens continua em uma página', async () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      item({ description: `Material ${index + 1}` }),
    );
    const documento = buildPurchaseOrderDocument(order({ items }), EMPRESA_COMPLETA);

    const { buffer, pageCount } = await renderPurchaseOrderPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
  });

  it('3 e 10. OC com muitos itens quebra em várias páginas', async () => {
    const items = Array.from({ length: 120 }, (_, index) =>
      item({ description: `Material ${index + 1}` }),
    );
    const documento = buildPurchaseOrderDocument(order({ items }), EMPRESA_COMPLETA);

    const { buffer, pageCount } = await renderPurchaseOrderPdf(documento);

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
      renderPurchaseOrderPdf(buildPurchaseOrderDocument(order({ items: curtos }), EMPRESA_COMPLETA)),
      renderPurchaseOrderPdf(buildPurchaseOrderDocument(order({ items: longos }), EMPRESA_COMPLETA)),
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

    const { buffer } = await renderPurchaseOrderPdf(documento);

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

    const { buffer, pageCount } = await renderPurchaseOrderPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
  });

  it('7. ordem sem itens (as legadas) ainda gera documento', async () => {
    const documento = buildPurchaseOrderDocument(
      { ...order({ items: [] }), totalAmount: decimal('129.15') },
      EMPRESA_VAZIA,
    );

    const { buffer, pageCount } = await renderPurchaseOrderPdf(documento);

    assertPdfValido(buffer);
    expect(pageCount).toBe(1);
    // O valor digitado à mão continua sendo impresso — a ordem antiga não
    // vira um documento de R$ 0,00.
    expect(documento.total).toBe(brl('R$ 129,15'));
  });
});
