import { Prisma } from '../../../generated/prisma/client';
import {
  buildCompatibilityReport,
  compareItems,
  descriptionSimilarity,
  normalizeDescription,
  type ComparableItem,
  type InvoiceSide,
  type OrderSide,
} from './compatibility.util';

const d = (value: string) => new Prisma.Decimal(value);

function item(
  description: string,
  quantity: string,
  unitPrice: string,
  unit: string | null = 'UN',
): ComparableItem {
  return {
    description,
    unit,
    quantity: d(quantity),
    unitPrice: d(unitPrice),
    totalPrice: d(quantity).times(d(unitPrice)).toDecimalPlaces(2),
  };
}

const FORNECEDOR = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRO_FORNECEDOR = 'bbbbbbbb-0000-4000-8000-000000000001';

function nota(overrides: Partial<InvoiceSide> = {}): InvoiceSide {
  return {
    supplierId: FORNECEDOR,
    supplierDocument: '12345678000190',
    totalAmount: d('3500.00'),
    issueDate: new Date('2026-08-20T00:00:00Z'),
    hasFullDocument: true,
    items: [item('Cimento CP-II 50kg', '50', '32.90', 'SC')],
    ...overrides,
  };
}

function ordem(overrides: Partial<OrderSide> = {}): OrderSide {
  return {
    supplierId: FORNECEDOR,
    supplierDocument: '12345678000190',
    openAmount: d('3500.00'),
    issueDate: new Date('2026-08-15T00:00:00Z'),
    constructionSite: { code: 'OBRA-1', name: 'Residencial Paineiras' },
    items: [item('Cimento CP-II 50kg', '50', '32.90', 'SC')],
    ...overrides,
  };
}

const check = (relatorio: ReturnType<typeof buildCompatibilityReport>, key: string) =>
  relatorio.checks.find((c) => c.key === key)!;

describe('normalizeDescription e descriptionSimilarity', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(normalizeDescription('CIMENTO CP-II/32 ÊNFASE')).toBe('cimento cp ii 32 enfase');
  });

  it('descrições idênticas têm semelhança 1', () => {
    expect(descriptionSimilarity('Cimento CP-II 50kg', 'Cimento CP-II 50kg')).toBe(1);
  });

  it('casa a mesma coisa escrita de jeitos diferentes', () => {
    // O emitente escreve do jeito dele; a obra pediu do jeito dela.
    expect(descriptionSimilarity('CIMENTO CP II 50KG', 'Cimento CP-II 50kg')).toBeGreaterThan(0.5);
  });

  it('NÃO casa materiais diferentes', () => {
    expect(descriptionSimilarity('Cimento CP-II 50kg', 'Areia média lavada')).toBeLessThan(0.5);
  });

  it('é simétrica e determinística', () => {
    const a = descriptionSimilarity('Vergalhão CA-50 10mm', 'vergalhao ca 50 10 mm');
    const b = descriptionSimilarity('vergalhao ca 50 10 mm', 'Vergalhão CA-50 10mm');
    expect(a).toBe(b);
    expect(descriptionSimilarity('x y', 'x y')).toBe(descriptionSimilarity('x y', 'x y'));
  });

  it('descrição vazia não casa com nada', () => {
    expect(descriptionSimilarity('', 'Cimento')).toBe(0);
  });
});

describe('compareItems', () => {
  it('4. aponta divergência de quantidade', () => {
    const [comparacao] = compareItems(
      [item('Areia média lavada', '10', '95.00', 'M3')],
      [item('Areia média lavada', '12', '95.00', 'M3')],
    );

    expect(comparacao!.status).toBe('DIVERGENT');
    // Quantidade diferente com o mesmo unitário arrasta o total junto — as
    // duas diferenças são reais e as duas são reportadas.
    expect(comparacao!.differences).toEqual(['quantity', 'totalPrice']);
  });

  it('aponta divergência de unidade', () => {
    const [comparacao] = compareItems(
      [item('Areia média lavada', '10', '95.00', 'TON')],
      [item('Areia média lavada', '10', '95.00', 'M3')],
    );

    expect(comparacao!.differences).toContain('unit');
  });

  it('aponta divergência de valor unitário', () => {
    const [comparacao] = compareItems(
      [item('Cimento CP-II 50kg', '50', '35.00', 'SC')],
      [item('Cimento CP-II 50kg', '50', '32.90', 'SC')],
    );

    expect(comparacao!.differences).toEqual(expect.arrayContaining(['unitPrice', 'totalPrice']));
  });

  it('unidade ausente de um lado NÃO é divergência', () => {
    const [comparacao] = compareItems(
      [item('Cimento CP-II 50kg', '50', '32.90', null)],
      [item('Cimento CP-II 50kg', '50', '32.90', 'SC')],
    );

    // Falta de dado é diferente de dado conflitante.
    expect(comparacao!.differences).not.toContain('unit');
    expect(comparacao!.status).toBe('MATCH');
  });

  it('item só na NOTA é sinalizado — material cobrado sem pedido', () => {
    const comparacoes = compareItems(
      [item('Cimento CP-II 50kg', '50', '32.90'), item('Frete', '1', '200.00')],
      [item('Cimento CP-II 50kg', '50', '32.90')],
    );

    expect(comparacoes).toHaveLength(2);
    expect(comparacoes.find((c) => c.status === 'ONLY_IN_INVOICE')!.invoice!.description).toBe(
      'Frete',
    );
  });

  it('item só na ORDEM é sinalizado — pedido não entregue', () => {
    const comparacoes = compareItems(
      [item('Cimento CP-II 50kg', '50', '32.90')],
      [item('Cimento CP-II 50kg', '50', '32.90'), item('Areia média lavada', '10', '95.00')],
    );

    expect(comparacoes.find((c) => c.status === 'ONLY_IN_ORDER')!.order!.description).toBe(
      'Areia média lavada',
    );
  });

  it('cada linha da nota casa com no máximo UMA da ordem', () => {
    const comparacoes = compareItems(
      [item('Cimento CP-II 50kg', '50', '32.90')],
      [item('Cimento CP-II 50kg', '30', '32.90'), item('Cimento CP-II 50kg', '20', '32.90')],
    );

    const casados = comparacoes.filter((c) => c.invoice !== null);
    expect(casados).toHaveLength(1);
    expect(comparacoes.filter((c) => c.status === 'ONLY_IN_ORDER')).toHaveLength(1);
  });

  it('quantidade fracionária compara sem erro de ponto flutuante', () => {
    const [comparacao] = compareItems(
      [item('Areia média lavada', '12.5', '95.00', 'M3')],
      [item('Areia média lavada', '12.5', '95.00', 'M3')],
    );

    expect(comparacao!.status).toBe('MATCH');
  });

  it('é idempotente: mesma entrada, mesmo resultado', () => {
    const nf = [item('Cimento CP-II 50kg', '50', '32.90'), item('Areia', '10', '95.00')];
    const oc = [item('Cimento CP-II 50kg', '50', '32.90'), item('Areia', '12', '95.00')];

    expect(JSON.stringify(compareItems(nf, oc))).toBe(JSON.stringify(compareItems(nf, oc)));
  });
});

describe('buildCompatibilityReport', () => {
  describe('1. NF + OC perfeitamente compatíveis', () => {
    it('fornecedor, valor e itens conferem', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem());

      expect(check(relatorio, 'supplier').result).toBe('MATCH');
      expect(check(relatorio, 'amount').result).toBe('MATCH');
      expect(check(relatorio, 'items').result).toBe('MATCH');
      expect(relatorio.hasDivergence).toBe(false);
      expect(relatorio.matchedItems).toBe(1);
    });
  });

  describe('2. NF + OC com valor diferente', () => {
    it('marca divergência e diz de quanto', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem({ openAmount: d('3000.00') }));

      expect(check(relatorio, 'amount').result).toBe('DIVERGENT');
      expect(check(relatorio, 'amount').detail).toContain('500.00');
      expect(relatorio.hasDivergence).toBe(true);
    });

    it('um centavo de diferença NÃO é divergência (arredondamento)', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem({ openAmount: d('3499.99') }));

      expect(check(relatorio, 'amount').result).toBe('MATCH');
    });

    it('compara em Decimal, sem erro de ponto flutuante', () => {
      // 0.1 + 0.2 em float dá 0.30000000000000004.
      const relatorio = buildCompatibilityReport(
        nota({ totalAmount: d('0.3') }),
        ordem({ openAmount: d('0.1').plus(d('0.2')) }),
      );

      expect(check(relatorio, 'amount').result).toBe('MATCH');
    });
  });

  describe('3. NF + OC com fornecedor diferente', () => {
    it('marca divergência de fornecedor', () => {
      const relatorio = buildCompatibilityReport(
        nota(),
        ordem({ supplierId: OUTRO_FORNECEDOR, supplierDocument: '99999999000199' }),
      );

      expect(check(relatorio, 'supplier').result).toBe('DIVERGENT');
    });

    it('sem vínculo de cadastro, compara pelo CNPJ do documento', () => {
      const relatorio = buildCompatibilityReport(
        nota({ supplierId: null }),
        ordem({ supplierId: OUTRO_FORNECEDOR }),
      );

      // O CNPJ ainda é o mesmo, então o emitente confere — é o caso da nota
      // cujo emitente ainda não foi ligado ao cadastro.
      expect(check(relatorio, 'supplier').result).toBe('MATCH');
    });
  });

  describe('4. NF + OC com itens divergentes', () => {
    it('conta quantos conferem e quantos divergem', () => {
      const relatorio = buildCompatibilityReport(
        nota({
          items: [item('Cimento CP-II 50kg', '50', '32.90'), item('Areia', '10', '95.00', 'M3')],
        }),
        ordem({
          items: [item('Cimento CP-II 50kg', '50', '32.90'), item('Areia', '12', '95.00', 'M3')],
        }),
      );

      expect(relatorio.matchedItems).toBe(1);
      expect(relatorio.divergentItems).toBe(1);
      expect(check(relatorio, 'items').result).toBe('DIVERGENT');
      expect(check(relatorio, 'items').detail).toContain('1 de 2');
    });
  });

  describe('itens não comparáveis', () => {
    it('nota que só trouxe o resumo: UNKNOWN, não divergência', () => {
      const relatorio = buildCompatibilityReport(
        nota({ hasFullDocument: false, items: [] }),
        ordem(),
      );

      expect(check(relatorio, 'items').result).toBe('UNKNOWN');
      expect(check(relatorio, 'items').detail).toContain('resumo');
      expect(relatorio.hasDivergence).toBe(false);
    });

    it('ordem antiga sem itens: UNKNOWN, não divergência', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem({ items: [] }));

      expect(check(relatorio, 'items').result).toBe('UNKNOWN');
      expect(relatorio.itemsComparable).toBe(false);
      // Uma ordem emitida antes de existirem itens não pode ser rebaixada por
      // isso — é ausência de informação, não discordância.
      expect(relatorio.hasDivergence).toBe(false);
    });
  });

  describe('obra e data', () => {
    it('obra é sempre UNKNOWN — a NF-e não carrega obra', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem());

      // A obra é o que a conciliação DEFINE, não o que ela confere.
      expect(check(relatorio, 'site').result).toBe('UNKNOWN');
      expect(check(relatorio, 'site').detail).toContain('OBRA-1');
    });

    it('informa quando a ordem é de centro administrativo', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem({ constructionSite: null }));

      expect(check(relatorio, 'site').detail).toContain('administrativo');
    });

    it('data NUNCA marca divergência, mesmo muito distante', () => {
      const relatorio = buildCompatibilityReport(
        nota({ issueDate: new Date('2027-08-20T00:00:00Z') }),
        ordem(),
      );

      // Critério auxiliar por decisão de negócio: atraso de entrega não
      // invalida a conciliação.
      expect(check(relatorio, 'date').result).not.toBe('DIVERGENT');
      expect(relatorio.hasDivergence).toBe(false);
    });

    it('conta os dias entre as emissões', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem());
      expect(check(relatorio, 'date').detail).toContain('5 dia');
    });
  });

  describe('14. determinismo', () => {
    it('o mesmo par produz exatamente o mesmo relatório', () => {
      const a = buildCompatibilityReport(nota(), ordem());
      const b = buildCompatibilityReport(nota(), ordem());

      // Nenhuma inferência, nenhum estado, nenhum modelo: a comparação é
      // reprodutível e explicável linha a linha.
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('sempre devolve as cinco verificações, na mesma ordem', () => {
      const relatorio = buildCompatibilityReport(nota(), ordem());

      expect(relatorio.checks.map((c) => c.key)).toEqual([
        'supplier',
        'amount',
        'items',
        'site',
        'date',
      ]);
    });
  });
});
