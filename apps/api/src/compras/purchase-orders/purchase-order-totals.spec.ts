import { calculateQuoteTotals } from '../purchase-requests/quote-totals';
import { calculateOrderItemTotals, calculateOrderTotals } from './purchase-order-totals';

const item = (quantity: number, unitPrice: number, type: 'AMOUNT' | 'PERCENT' = 'AMOUNT', value = 0) => ({
  quantity,
  unitPrice,
  discountType: type,
  discountValue: value,
});

describe('purchase-order-totals — a conta da ordem', () => {
  it('sem desconto, o líquido é o bruto', () => {
    const { gross, discount, net } = calculateOrderItemTotals(item(60, 3.99));

    expect(gross.toFixed(2)).toBe('239.40');
    expect(discount.toFixed(2)).toBe('0.00');
    expect(net.toFixed(2)).toBe('239.40');
  });

  it('desconto em reais sai do bruto da linha', () => {
    expect(calculateOrderItemTotals(item(10, 25.5, 'AMOUNT', 55)).net.toFixed(2)).toBe('200.00');
  });

  it('desconto percentual incide sobre o bruto da linha', () => {
    expect(calculateOrderItemTotals(item(10, 25.5, 'PERCENT', 10)).net.toFixed(2)).toBe('229.50');
  });

  it('desconto maior que a linha não produz total negativo', () => {
    // Rede de segurança: o service recusa antes, com mensagem. Aqui a garantia
    // é que nenhum dado legado ou corrida entre edições gere valor negativo.
    expect(calculateOrderItemTotals(item(1, 10, 'AMOUNT', 999)).net.toFixed(2)).toBe('0.00');
  });

  it('o desconto geral incide sobre o subtotal JÁ LÍQUIDO, não sobre o bruto', () => {
    // A regra que este módulo existe para não deixar ninguém errar. Sobre o
    // bruto, o abatimento do item seria contado duas vezes.
    const itens = [item(10, 100, 'AMOUNT', 100), item(10, 100)];
    const totais = calculateOrderTotals(itens, { type: 'PERCENT', value: 10 });

    expect(totais.itemsSubtotal.toFixed(2)).toBe('2000.00');
    expect(totais.itemsDiscount.toFixed(2)).toBe('100.00');
    expect(totais.subtotalAfterItemDiscounts.toFixed(2)).toBe('1900.00');
    // 10% de 1900, e não de 2000.
    expect(totais.generalDiscount.toFixed(2)).toBe('190.00');
    expect(totais.total.toFixed(2)).toBe('1710.00');
  });

  it('soma os valores JÁ ARREDONDADOS de cada linha', () => {
    // Somar os produtos brutos e arredondar no fim daria um centavo diferente
    // do que a coluna da tela mostra — e o total impresso tem de ser a soma
    // exata do que está impresso acima dele.
    const itens = [item(3, 0.335), item(3, 0.335)];
    const totais = calculateOrderTotals(itens, { type: 'AMOUNT', value: 0 });

    expect(totais.total.toFixed(2)).toBe('2.02');
  });

  it('reproduz a SOL-0004: bruto 1.658,24 menos 248,24 de desconto geral', () => {
    // O caso real que motivou o recurso: a ordem saía com o bruto, R$ 248,24
    // acima do que foi negociado com o setor.
    const itens = [
      item(60, 3.99), item(10, 25.5), item(20, 5), item(50, 2.99), item(5, 21),
      item(15, 4.99), item(3, 16), item(1, 71.5), item(1, 49.99), item(1, 45),
      item(1, 33), item(1, 157), item(1, 72), item(1, 220), item(1, 38),
    ];

    const totais = calculateOrderTotals(itens, { type: 'AMOUNT', value: 248.24 });

    expect(totais.itemsSubtotal.toFixed(2)).toBe('1658.24');
    expect(totais.total.toFixed(2)).toBe('1410.00');
  });

  it('a ordem fecha no MESMO centavo que a cotação de origem', () => {
    // O motivo de a aritmética morar num módulo só: divergência de centavo
    // entre a cotação e a ordem é o que faz o fornecedor contestar a nota.
    const linhas = [
      { quantity: 7, unitPrice: 12.37, discountType: 'PERCENT' as const, discountValue: 7.5 },
      { quantity: 3, unitPrice: 4.05, discountType: 'AMOUNT' as const, discountValue: 1.11 },
    ];
    const geral = { type: 'PERCENT' as const, value: 3.5 };

    const ordem = calculateOrderTotals(linhas, geral);
    const cotacao = calculateQuoteTotals(
      linhas.map((l) => ({
        quantity: l.quantity,
        estimatedUnitPrice: l.unitPrice,
        unavailable: false,
        discountType: l.discountType,
        discountValue: l.discountValue,
      })),
      geral,
    );

    expect(ordem.total.toFixed(2)).toBe(cotacao.total.toFixed(2));
  });
});
