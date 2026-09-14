import { evaluatePurchaseLine, practicedUnitPrice, type PurchaseLine } from './purchase-price';

const HOJE = '2026-09-14';

/// 100 SC de cimento a R$ 40,00, sem desconto, numa ordem recebida.
function linha(extra: Partial<PurchaseLine> = {}, ordem: Partial<PurchaseLine['purchaseOrder']> = {}): PurchaseLine {
  return {
    quantity: '100',
    totalPrice: '4000.00',
    unit: 'SC',
    ...extra,
    purchaseOrder: {
      status: 'RECEIVED',
      issueDate: new Date('2026-09-10T00:00:00.000Z'),
      totalAmount: '4000.00',
      items: [{ totalPrice: '4000.00' }],
      ...ordem,
    },
  };
}

describe('Preço praticado na compra', () => {
  it('sem desconto, é o total da linha dividido pela quantidade', () => {
    expect(practicedUnitPrice(linha())!.toFixed(4)).toBe('40.0000');
  });

  it('o desconto DA LINHA já está no total da linha', () => {
    // 100 × 40,00 − 10% = 3.600,00.
    const comDesconto = linha(
      { totalPrice: '3600.00' },
      { totalAmount: '3600.00', items: [{ totalPrice: '3600.00' }] },
    );

    expect(practicedUnitPrice(comDesconto)!.toFixed(4)).toBe('36.0000');
  });

  it('o desconto GERAL é rateado entre as linhas pelo valor de cada uma', () => {
    // Cimento 4.000 + areia 1.000 = 5.000; desconto geral de 500 (10%).
    // Cimento fica com 3.600 → R$ 36,00 o saco; não com os 500 inteiros.
    const cimento = linha({}, {
      totalAmount: '4500.00',
      items: [{ totalPrice: '4000.00' }, { totalPrice: '1000.00' }],
    });

    expect(practicedUnitPrice(cimento)!.toFixed(4)).toBe('36.0000');
  });

  it('arredonda para quatro casas, HALF_UP', () => {
    // 100,00 ÷ 3 = 33,3333…
    const tres = linha(
      { quantity: '3', totalPrice: '100.00' },
      { totalAmount: '100.00', items: [{ totalPrice: '100.00' }] },
    );

    expect(practicedUnitPrice(tres)!.toFixed(4)).toBe('33.3333');
  });

  it('quantidade zero não tem preço', () => {
    expect(practicedUnitPrice(linha({ quantity: '0' }))).toBeNull();
  });

  it('total da ordem MAIOR que a soma das linhas não é rateado', () => {
    // Ordem legada, anterior aos itens: o total não diz respeito às linhas.
    expect(practicedUnitPrice(linha({}, { totalAmount: '9000.00' }))).toBeNull();
  });

  it('ordem com linhas zeradas tem preço zero, sem divisão por zero', () => {
    const brinde = linha(
      { totalPrice: '0' },
      { totalAmount: '0', items: [{ totalPrice: '0' }] },
    );

    expect(practicedUnitPrice(brinde)!.toString()).toBe('0');
  });
});

describe('Quando a compra pode virar referência', () => {
  it('ordem recebida, mesma unidade, totais coerentes: pode', () => {
    expect(evaluatePurchaseLine(linha(), 'SC', HOJE)).toMatchObject({
      block: null,
      referenceDate: '2026-09-10',
    });
  });

  it('a data de referência é a de EMISSÃO da ordem', () => {
    const avaliacao = evaluatePurchaseLine(
      linha({}, { issueDate: new Date('2026-08-03T00:00:00.000Z') }),
      'SC',
      HOJE,
    );

    expect(avaliacao.referenceDate).toBe('2026-08-03');
  });

  it.each(['OPEN', 'ISSUED', 'CANCELLED'])('ordem %s não pode: a compra ainda pode mudar ou não aconteceu', (status) => {
    expect(evaluatePurchaseLine(linha({}, { status }), 'SC', HOJE).block).toBe(
      'ORDER_NOT_RECEIVED',
    );
  });

  it('unidade diferente da do insumo não pode — o ERP não converte', () => {
    expect(evaluatePurchaseLine(linha({ unit: 'KG' }), 'SC', HOJE).block).toBe('UNIT_MISMATCH');
    // Nem variação de grafia: a comparação é exata.
    expect(evaluatePurchaseLine(linha({ unit: 'sc' }), 'SC', HOJE).block).toBe('UNIT_MISMATCH');
  });

  it('totais incoerentes não podem', () => {
    expect(evaluatePurchaseLine(linha({}, { totalAmount: '9000.00' }), 'SC', HOJE).block).toBe(
      'INCONSISTENT_TOTALS',
    );
  });

  it('emissão futura não pode', () => {
    const futura = linha({}, { issueDate: new Date('2026-09-20T00:00:00.000Z') });

    expect(evaluatePurchaseLine(futura, 'SC', HOJE).block).toBe('FUTURE_DATE');
  });
});
