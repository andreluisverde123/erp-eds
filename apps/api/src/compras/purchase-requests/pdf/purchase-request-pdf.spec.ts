import { Prisma } from '../../../../generated/prisma/client';
import { measureRowHeight, renderDocumentPdf } from '../../../common/pdf/pdf-renderer';
import type { CompanySource, PrintableDocument } from '../../../common/pdf/printable-document';
import { PurchaseRequestsController } from '../purchase-requests.controller';
import { PERMISSIONS_KEY } from '../../../auth/decorators/permissions.decorator';
import {
  buildPurchaseRequestDocument,
  formatStatus,
  PURCHASE_REQUEST_COLUMNS,
  type PurchaseRequestSource,
} from './purchase-request-document';

const decimal = (value: string) => new Prisma.Decimal(value);

/// `Intl` separa "R$" do número com ESPAÇO NÃO-QUEBRÁVEL (U+00A0), não com
/// espaço comum. Escrever o caractere invisível direto nos testes deixaria a
/// comparação impossível de conferir a olho; este helper torna a intenção
/// visível. Mesmo helper do spec do PDF da ordem.
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

function item(overrides: Partial<PurchaseRequestSource['items'][number]> = {}) {
  return {
    description: 'Cimento CP-II 50kg',
    unit: 'SC',
    quantity: decimal('20'),
    estimatedUnitPrice: decimal('35.00'),
    notes: null,
    unavailable: false,
    unavailabilityNote: null,
    discountType: 'AMOUNT' as const,
    discountValue: decimal('0'),
    ...overrides,
  };
}

function request(overrides: Partial<PurchaseRequestSource> = {}): PurchaseRequestSource {
  return {
    code: 'SOL-0001',
    status: 'QUOTING',
    createdAt: new Date('2026-08-23T12:00:00Z'),
    neededBy: null,
    notes: null,
    discountType: 'AMOUNT' as const,
    discountValue: decimal('0'),
    requestedBy: { name: 'Marina Alves' },
    constructionSite: { code: 'OB-001', name: 'Residencial Aurora' },
    costCenter: { code: 'CC-201', name: 'Estrutura' },
    items: [item()],
    ...overrides,
  };
}

const bloco = (documento: PrintableDocument, titulo: string) =>
  documento.blocks.find((item) => item.title === titulo)?.fields ?? [];

const camposDaSolicitacao = (documento: PrintableDocument) => bloco(documento, 'SOLICITAÇÃO');
const camposDoDestino = (documento: PrintableDocument) => bloco(documento, 'DESTINO');

describe('buildPurchaseRequestDocument', () => {
  describe('8. PDF com dados corretos', () => {
    it('identifica a solicitação com o código que o sistema já usa', () => {
      const documento = buildPurchaseRequestDocument(request(), EMPRESA_COMPLETA);

      expect(documento.title).toBe('SOLICITAÇÃO DE COMPRA');
      expect(documento.code).toBe('SOL-0001');
      expect(camposDaSolicitacao(documento)).toContainEqual({
        label: 'Número',
        value: 'SOL-0001',
      });
    });

    it('data de abertura em dia civil, sem escorregar de fuso', () => {
      // Meia-noite UTC vira o dia anterior em GMT-3 se a formatação não fixar
      // o fuso. A solicitação foi aberta num DIA, não num instante.
      const documento = buildPurchaseRequestDocument(
        request({ createdAt: new Date('2026-08-01T00:00:00Z') }),
        EMPRESA_COMPLETA,
      );

      expect(camposDaSolicitacao(documento)).toContainEqual({
        label: 'Abertura',
        value: '01/08/2026',
      });
    });

    it('traz o solicitante, a obra e o centro de custo', () => {
      const documento = buildPurchaseRequestDocument(request(), EMPRESA_COMPLETA);

      expect(camposDoDestino(documento)).toEqual([
        { label: 'Solicitante', value: 'Marina Alves' },
        { label: 'Obra', value: 'OB-001 — Residencial Aurora' },
        { label: 'Centro de custo', value: 'CC-201 — Estrutura' },
      ]);
    });

    it('imprime "necessário até" quando a solicitação tem prazo', () => {
      const documento = buildPurchaseRequestDocument(
        request({ neededBy: new Date('2026-09-15T00:00:00Z') }),
        EMPRESA_COMPLETA,
      );

      expect(camposDaSolicitacao(documento)).toContainEqual({
        label: 'Necessário até',
        value: '15/09/2026',
      });
    });
  });

  describe('1. Solicitação com vários itens', () => {
    it('numera as linhas na ordem em que aparecem', () => {
      const documento = buildPurchaseRequestDocument(
        request({
          items: [
            item({ description: 'Cimento CP-II', quantity: decimal('20') }),
            item({ description: 'Tubo PVC 100mm', quantity: decimal('10'), unit: 'UN' }),
            item({ description: 'Torneira de jardim', quantity: decimal('5'), unit: 'UN' }),
          ],
        }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows.map((linha) => linha.index)).toEqual(['1', '2', '3']);
      expect(documento.rows.map((linha) => linha.description)).toEqual([
        'Cimento CP-II',
        'Tubo PVC 100mm',
        'Torneira de jardim',
      ]);
    });

    it('quantidade e unidade saem como na solicitação', () => {
      const documento = buildPurchaseRequestDocument(
        request({ items: [item({ quantity: decimal('1.500'), unit: 'M3' })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]).toMatchObject({ quantity: '1,5', unit: 'M3' });
    });
  });

  describe('2. Solicitação com um item', () => {
    it('gera o documento normalmente, com o total do único item', () => {
      const documento = buildPurchaseRequestDocument(
        request({ items: [item({ quantity: decimal('20'), estimatedUnitPrice: decimal('35') })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows).toHaveLength(1);
      expect(documento.total?.value).toBe(brl('R$ 700,00'));
      expect(documento.total?.caption).toBe(
        '1 de 1 item cotado. Total calculado a partir dos itens cotados.',
      );
    });
  });

  describe('3 e 4. Observação da solicitação', () => {
    it('sem observação, o bloco não existe — em vez de sair vazio', () => {
      const documento = buildPurchaseRequestDocument(request({ notes: null }), EMPRESA_COMPLETA);

      expect(documento.notes).toBeNull();
    });

    it('observação só de espaços também não vira bloco', () => {
      const documento = buildPurchaseRequestDocument(request({ notes: '   ' }), EMPRESA_COMPLETA);

      expect(documento.notes).toBeNull();
    });

    it('com observação, ela sai sob o título de sempre', () => {
      const documento = buildPurchaseRequestDocument(
        request({ notes: 'Entregar no portão B, aos cuidados do mestre.' }),
        EMPRESA_COMPLETA,
      );

      expect(documento.notes).toEqual({
        title: 'OBSERVAÇÕES',
        text: 'Entregar no portão B, aos cuidados do mestre.',
      });
    });

    it('a observação do ITEM entra na descrição, junto da linha dele', () => {
      const documento = buildPurchaseRequestDocument(
        request({ items: [item({ description: 'Cimento', notes: 'Marca indiferente' })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]!.description).toBe('Cimento\nMarca indiferente');
    });
  });

  describe('5 e 6. Obra e centro de custo', () => {
    it('vinculada à obra, imprime código e nome', () => {
      const documento = buildPurchaseRequestDocument(request(), EMPRESA_COMPLETA);

      expect(camposDoDestino(documento)).toContainEqual({
        label: 'Obra',
        value: 'OB-001 — Residencial Aurora',
      });
    });

    it('sem centro de custo, a linha some — não vira "—"', () => {
      // O centro de custo é opcional na solicitação: quem pede pode não saber
      // em qual conta o material entra, e Compras define na emissão da ordem.
      const documento = buildPurchaseRequestDocument(
        request({ costCenter: null }),
        EMPRESA_COMPLETA,
      );

      expect(camposDoDestino(documento).map((campo) => campo.label)).toEqual([
        'Solicitante',
        'Obra',
      ]);
    });

    it('sem obra, o documento continua sendo gerado', () => {
      // Não acontece em solicitação nova (a obra é obrigatória desde a
      // inversão do formulário), mas o histórico pode ter linhas sem ela — e
      // o PDF não pode quebrar por causa disso.
      const documento = buildPurchaseRequestDocument(
        request({ constructionSite: null, costCenter: null }),
        EMPRESA_COMPLETA,
      );

      expect(camposDoDestino(documento)).toEqual([{ label: 'Solicitante', value: 'Marina Alves' }]);
    });
  });

  describe('7. Status traduzido', () => {
    it.each([
      ['DRAFT', 'Rascunho'],
      ['PENDING', 'Pendente'],
      ['QUOTING', 'Em Cotação'],
      ['APPROVED', 'Aprovada'],
      ['CANCELLED', 'Cancelada'],
    ])('%s aparece como "%s", igual à tela', (status, rotulo) => {
      const documento = buildPurchaseRequestDocument(request({ status }), EMPRESA_COMPLETA);

      expect(camposDaSolicitacao(documento)).toContainEqual({ label: 'Status', value: rotulo });
    });

    it('status desconhecido sai como veio, em vez de sumir do documento', () => {
      expect(formatStatus('ALGO_NOVO')).toBe('ALGO_NOVO');
    });
  });

  describe('9. PDF sem dados opcionais', () => {
    it('empresa só com nome não ganha CNPJ, endereço nem contato inventados', () => {
      const documento = buildPurchaseRequestDocument(request(), EMPRESA_VAZIA);

      expect(documento.companyName).toBe('EDS Construtora');
      expect(documento.companyFields).toEqual([]);
    });

    it('empresa completa imprime o que está cadastrado, já formatado', () => {
      const documento = buildPurchaseRequestDocument(request(), EMPRESA_COMPLETA);

      expect(documento.companyFields).toEqual([
        { label: 'Nome fantasia', value: 'EDS' },
        { label: 'CNPJ', value: '12.345.678/0001-90' },
        { label: 'Inscrição estadual', value: '0771234567' },
        {
          label: 'Endereço',
          value: 'AVENIDA CENTRAL, 1000, SALA 5, GOIÂNIA, GO, 74000-000',
        },
        { label: 'Telefone', value: '(62) 3200-1000' },
        { label: 'E-mail', value: 'contato@eds.com.br' },
      ]);
    });

    it('solicitação sem prazo não imprime "necessário até"', () => {
      const documento = buildPurchaseRequestDocument(request({ neededBy: null }), EMPRESA_COMPLETA);

      expect(camposDaSolicitacao(documento).map((campo) => campo.label)).not.toContain(
        'Necessário até',
      );
    });

    it('solicitação sem itens não quebra — diz que não tem', () => {
      const documento = buildPurchaseRequestDocument(request({ items: [] }), EMPRESA_COMPLETA);

      expect(documento.rows).toEqual([]);
      expect(documento.emptyRowsMessage).toBe('Esta solicitação não tem itens.');
      expect(documento.total?.caption).toBe('Solicitação sem itens.');
    });
  });

  describe('cotação — o que o papel mostra antes e depois dela', () => {
    it('sem cotação, valores em "—" e total explícito, não R$ 0,00', () => {
      // Zerado significa "ainda não cotado", não "de graça": imprimir
      // R$ 0,00 aqui leria como erro de cálculo.
      const documento = buildPurchaseRequestDocument(
        request({ items: [item({ estimatedUnitPrice: null })] }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]).toMatchObject({ unitPrice: '—', totalPrice: '—' });
      expect(documento.total?.value).toBe('Aguardando cotação');
    });

    it('cotada, imprime valor unitário e subtotal por linha', () => {
      const documento = buildPurchaseRequestDocument(
        request({
          items: [
            item({ quantity: decimal('20'), estimatedUnitPrice: decimal('35') }),
            item({ quantity: decimal('10'), estimatedUnitPrice: decimal('22') }),
          ],
        }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[0]).toMatchObject({
        unitPrice: brl('R$ 35,00'),
        totalPrice: brl('R$ 700,00'),
      });
      // 20×35 + 10×22
      expect(documento.total?.value).toBe(brl('R$ 920,00'));
    });

    it('item não disponível sai marcado, sem preço e FORA do total', () => {
      const documento = buildPurchaseRequestDocument(
        request({
          items: [
            item({
              description: 'Cimento',
              quantity: decimal('10'),
              estimatedUnitPrice: decimal('50'),
            }),
            item({
              description: 'Torneira',
              quantity: decimal('5'),
              estimatedUnitPrice: null,
              unavailable: true,
              unavailabilityNote: 'Produto sem estoque.',
            }),
          ],
        }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[1]!.description).toBe(
        'Torneira\nNão disponível — Produto sem estoque.',
      );
      expect(documento.rows[1]).toMatchObject({ unitPrice: '—', totalPrice: '—' });
      expect(documento.total?.value).toBe(brl('R$ 500,00'));
      expect(documento.total?.caption).toContain('1 item não disponível');
    });

    it('não disponível sem motivo sai só com a marca', () => {
      const documento = buildPurchaseRequestDocument(
        request({
          items: [
            item({ estimatedUnitPrice: decimal('50') }),
            item({ description: 'Torneira', estimatedUnitPrice: null, unavailable: true }),
          ],
        }),
        EMPRESA_COMPLETA,
      );

      expect(documento.rows[1]!.description).toBe('Torneira\nNão disponível');
    });
  });
});

describe('desconto no documento impresso', () => {
  it('sem desconto, a coluna fica em "—" e a conta não é aberta em etapas', () => {
    const documento = buildPurchaseRequestDocument(request(), EMPRESA_COMPLETA);

    expect(documento.rows[0]!.discount).toBe('—');
    // Sem desconto, "subtotal" e "total" seriam o mesmo número duas vezes.
    expect(documento.total?.lines).toBeUndefined();
  });

  it('desconto de item sai com sinal e abate o total da linha', () => {
    const documento = buildPurchaseRequestDocument(
      request({
        items: [
          item({
            quantity: decimal('10'),
            estimatedUnitPrice: decimal('100'),
            discountValue: decimal('100'),
          }),
        ],
      }),
      EMPRESA_COMPLETA,
    );

    expect(documento.rows[0]!.discount).toBe(`- ${brl('R$ 100,00')}`);
    expect(documento.rows[0]!.totalPrice).toBe(brl('R$ 900,00'));
  });

  it('desconto percentual imprime a porcentagem ao lado do valor', () => {
    // O papel precisa dizer o que foi COMBINADO, não só quanto deu.
    const documento = buildPurchaseRequestDocument(
      request({
        items: [
          item({
            quantity: decimal('10'),
            estimatedUnitPrice: decimal('100'),
            discountType: 'PERCENT',
            discountValue: decimal('10'),
          }),
        ],
      }),
      EMPRESA_COMPLETA,
    );

    expect(documento.rows[0]!.discount).toBe(`- ${brl('R$ 100,00')} (10%)`);
  });

  it('a conta aparece em etapas quando há desconto', () => {
    const documento = buildPurchaseRequestDocument(
      request({
        discountValue: decimal('100'),
        items: [
          item({
            quantity: decimal('10'),
            estimatedUnitPrice: decimal('100'),
            discountValue: decimal('100'),
          }),
          item({ quantity: decimal('20'), estimatedUnitPrice: decimal('100') }),
        ],
      }),
      EMPRESA_COMPLETA,
    );

    expect(documento.total?.lines).toEqual([
      { label: 'Subtotal dos itens', value: brl('R$ 3.000,00') },
      { label: 'Descontos nos itens', value: `- ${brl('R$ 100,00')}` },
      { label: 'Subtotal após descontos', value: brl('R$ 2.900,00') },
      { label: 'Desconto geral', value: `- ${brl('R$ 100,00')}` },
    ]);
    expect(documento.total?.value).toBe(brl('R$ 2.800,00'));
  });

  it('desconto geral percentual identifica a porcentagem na etapa', () => {
    const documento = buildPurchaseRequestDocument(
      request({
        discountType: 'PERCENT',
        discountValue: decimal('10'),
        items: [item({ quantity: decimal('10'), estimatedUnitPrice: decimal('100') })],
      }),
      EMPRESA_COMPLETA,
    );

    expect(documento.total?.lines).toContainEqual({
      label: 'Desconto geral (10%)',
      value: `- ${brl('R$ 100,00')}`,
    });
    expect(documento.total?.value).toBe(brl('R$ 900,00'));
  });

  it('item indisponível não recebe desconto nem entra na conta impressa', () => {
    const documento = buildPurchaseRequestDocument(
      request({
        items: [
          item({ quantity: decimal('10'), estimatedUnitPrice: decimal('100') }),
          item({ estimatedUnitPrice: null, unavailable: true, discountValue: decimal('50') }),
        ],
      }),
      EMPRESA_COMPLETA,
    );

    expect(documento.rows[1]!.discount).toBe('—');
    expect(documento.total?.value).toBe(brl('R$ 1.000,00'));
  });
});

describe('measureRowHeight com as colunas da solicitação', () => {
  const LARGURAS = [26, 180, 46, 36, 72, 72, 82];
  const linha = {
    index: '1',
    description: 'Cimento',
    quantity: '20',
    unit: 'SC',
    unitPrice: 'R$ 35,00',
    discount: '—',
    totalPrice: 'R$ 700,00',
  };

  /// Dublê de medição: 12pt por linha, quebrando a cada ~7 caracteres de
  /// largura. Fiel no que importa — texto maior que a coluna ocupa mais linhas.
  const medir = (texto: string, largura: number) =>
    Math.ceil(texto.length / Math.max(1, largura / 7)) * 12;

  it('a marca de indisponibilidade aumenta a altura da linha', () => {
    // Mesma classe de defeito que já mordeu o PDF da ordem: texto extra numa
    // célula sem aumentar a altura da linha é desenhado por cima da de baixo.
    const comMarca = {
      ...linha,
      description: 'Torneira\nNão disponível — Produto sem estoque no fornecedor consultado.',
    };

    expect(measureRowHeight(medir, comMarca, PURCHASE_REQUEST_COLUMNS, LARGURAS)).toBeGreaterThan(
      measureRowHeight(medir, linha, PURCHASE_REQUEST_COLUMNS, LARGURAS),
    );
  });

  it('nenhuma linha fica abaixo da altura mínima', () => {
    expect(
      measureRowHeight(() => 0, linha, PURCHASE_REQUEST_COLUMNS, LARGURAS),
    ).toBeGreaterThanOrEqual(18);
  });
});

describe('renderDocumentPdf — solicitação', () => {
  /// O PDF é binário; o que dá para afirmar aqui sem um parser é o que
  /// importa operacionalmente: que gerou, que é um PDF, e que paginou.
  const ehPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-';

  it('gera um PDF de uma página para uma solicitação curta', async () => {
    const documento = buildPurchaseRequestDocument(request(), EMPRESA_COMPLETA);

    const { buffer, pageCount } = await renderDocumentPdf(documento);

    expect(ehPdf(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(pageCount).toBe(1);
  });

  it('pagina quando a solicitação tem itens demais para uma folha', async () => {
    const muitos = Array.from({ length: 80 }, (_, indice) =>
      item({ description: `Material ${indice + 1}` }),
    );

    const { buffer, pageCount } = await renderDocumentPdf(
      buildPurchaseRequestDocument(request({ items: muitos }), EMPRESA_COMPLETA),
    );

    expect(ehPdf(buffer)).toBe(true);
    expect(pageCount).toBeGreaterThan(1);
  });

  it('gera mesmo sem itens e sem dados opcionais nenhum', async () => {
    const { buffer, pageCount } = await renderDocumentPdf(
      buildPurchaseRequestDocument(
        request({
          items: [],
          notes: null,
          neededBy: null,
          constructionSite: null,
          costCenter: null,
        }),
        EMPRESA_VAZIA,
      ),
    );

    expect(ehPdf(buffer)).toBe(true);
    expect(pageCount).toBe(1);
  });

  it('a soma das colunas fecha em 1 — largura de coluna errada corta texto', () => {
    const soma = PURCHASE_REQUEST_COLUMNS.reduce((total, coluna) => total + coluna.width, 0);

    expect(soma).toBeCloseTo(1, 5);
  });
});

describe('12. Permissões e 11. isolamento multi-tenant', () => {
  it('imprimir exige só `compras.view` — quem vê a solicitação pode imprimi-la', () => {
    // O controller inteiro é `compras.view`; a rota do PDF não acrescenta
    // permissão nenhuma, igual ao PDF da ordem de compra.
    const doControlador = Reflect.getMetadata(
      PERMISSIONS_KEY,
      PurchaseRequestsController,
    ) as string[];
    const daRota = Reflect.getMetadata(
      PERMISSIONS_KEY,
      PurchaseRequestsController.prototype.pdf,
    ) as string[] | undefined;

    expect(doControlador).toEqual(['compras.view']);
    expect(daRota).toBeUndefined();
  });

  it('imprimir NÃO exige permissão de escrita — Engenharia imprime o que abriu', () => {
    const daRota = Reflect.getMetadata(
      PERMISSIONS_KEY,
      PurchaseRequestsController.prototype.pdf,
    ) as string[] | undefined;

    expect(daRota ?? []).not.toContain('compras.manage');
  });
});
