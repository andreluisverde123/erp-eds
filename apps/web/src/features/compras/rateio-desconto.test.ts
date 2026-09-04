import { describe, expect, it } from 'vitest';

import { itemsFromPurchaseRequest, rateioDoDescontoGeral } from './purchase-order-form-schema';

/// Uma linha da cotação. `pending` diverge de `quantity` quando parte já foi
/// comprada em outra ordem.
function linha(overrides: {
  id: string;
  quantity: string;
  preco?: string | null;
  pending?: string;
  unavailable?: boolean;
  desconto?: { tipo: 'AMOUNT' | 'PERCENT'; valor: string };
}) {
  return {
    id: overrides.id,
    description: overrides.id,
    unit: 'UN',
    quantity: overrides.quantity,
    estimatedUnitPrice: overrides.preco === undefined ? '100' : overrides.preco,
    unavailable: overrides.unavailable ?? false,
    discountType: overrides.desconto?.tipo ?? ('AMOUNT' as const),
    discountValue: overrides.desconto?.valor ?? '0',
    fulfillment: {
      fulfilledQuantity: String(
        Number(overrides.quantity) - Number(overrides.pending ?? overrides.quantity),
      ),
      pendingQuantity: overrides.pending ?? overrides.quantity,
    },
  };
}

/// O DESCONTO GERAL RATEADO entre as ordens de uma mesma solicitação.
///
/// O defeito que isto corrige: o desconto era copiado INTEIRO para cada ordem.
/// Uma solicitação de R$ 10.000 com R$ 500 de desconto, comprada em duas
/// ordens, descontava R$ 1.000 — o dobro do negociado.
describe('Rateio do desconto geral', () => {
  const COTACAO = { discountType: 'AMOUNT' as const, discountValue: '500' };

  /// Três itens de R$ 100, quantidades 60 / 30 / 10 → subtotal 10.000.
  const CINCO_MIL_MAIS_CINCO = [
    linha({ id: 'a', quantity: '60' }),
    linha({ id: 'b', quantity: '30' }),
    linha({ id: 'c', quantity: '10' }),
  ];

  it('ordem que leva a solicitação INTEIRA recebe o desconto inteiro', () => {
    // O caso comum. Se este mudasse, o rateio teria quebrado o fluxo normal
    // para consertar o excepcional.
    const itens = itemsFromPurchaseRequest(CINCO_MIL_MAIS_CINCO);

    expect(rateioDoDescontoGeral(COTACAO, CINCO_MIL_MAIS_CINCO, itens)).toBe('500');
  });

  it('as partes de duas ordens somam exatamente o desconto negociado', () => {
    const itens = itemsFromPurchaseRequest(CINCO_MIL_MAIS_CINCO);

    // OC #1 leva 'a' (6.000 de 10.000).
    const primeira = itens.map((i) => ({ ...i, selected: i.purchaseRequestItemId === 'a' }));
    // OC #2 leva o resto (4.000 de 10.000).
    const segunda = itens.map((i) => ({ ...i, selected: i.purchaseRequestItemId !== 'a' }));

    expect(rateioDoDescontoGeral(COTACAO, CINCO_MIL_MAIS_CINCO, primeira)).toBe('300');
    expect(rateioDoDescontoGeral(COTACAO, CINCO_MIL_MAIS_CINCO, segunda)).toBe('200');
    // 300 + 200 = 500. Antes eram 500 + 500.
  });

  it('rateia por QUANTIDADE, não só por item selecionado', () => {
    // Comprar metade de um item é meia fatia do desconto daquele item.
    const itens = itemsFromPurchaseRequest([linha({ id: 'a', quantity: '100' })]).map((i) => ({
      ...i,
      quantity: '40',
    }));

    expect(rateioDoDescontoGeral(COTACAO, [linha({ id: 'a', quantity: '100' })], itens)).toBe('200');
  });

  it('PERCENTUAL não é rateado — ele já é proporcional', () => {
    // 10% incidem sobre o subtotal da própria ordem. Ratear reduziria duas
    // vezes, e a ordem sairia com 6% do que foi negociado.
    const percentual = { discountType: 'PERCENT' as const, discountValue: '10' };
    const itens = itemsFromPurchaseRequest(CINCO_MIL_MAIS_CINCO).map((i) => ({
      ...i,
      selected: i.purchaseRequestItemId === 'a',
    }));

    expect(rateioDoDescontoGeral(percentual, CINCO_MIL_MAIS_CINCO, itens)).toBe('10');
  });

  it('item NÃO DISPONÍVEL não entra na proporção', () => {
    // Regra C-8: item que o fornecedor não tem fica fora da conta inteira.
    const cotacao = [
      linha({ id: 'a', quantity: '60' }),
      linha({ id: 'b', quantity: '40', unavailable: true }),
    ];
    const itens = itemsFromPurchaseRequest(cotacao);

    // Só 'a' vale (6.000 de 6.000) — o desconto inteiro cabe a ele.
    expect(rateioDoDescontoGeral(COTACAO, cotacao, itens)).toBe('500');
  });

  it('desconto de LINHA entra na base da proporção', () => {
    const cotacao = [
      linha({ id: 'a', quantity: '60', desconto: { tipo: 'AMOUNT', valor: '1000' } }),
      linha({ id: 'b', quantity: '40' }),
    ];
    const itens = itemsFromPurchaseRequest(cotacao).map((i) => ({
      ...i,
      selected: i.purchaseRequestItemId === 'a',
    }));

    // 'a' líquido = 6.000 − 1.000 = 5.000; 'b' = 4.000; total 9.000.
    // 500 × 5.000/9.000 = 277,78
    expect(rateioDoDescontoGeral(COTACAO, cotacao, itens)).toBe('277.78');
  });

  it('cotação sem desconto não sugere nada', () => {
    const semDesconto = { discountType: 'AMOUNT' as const, discountValue: '0' };
    const itens = itemsFromPurchaseRequest(CINCO_MIL_MAIS_CINCO);

    expect(rateioDoDescontoGeral(semDesconto, CINCO_MIL_MAIS_CINCO, itens)).toBe('');
  });

  it('cotação sem preço nenhum devolve o desconto sem ratear', () => {
    // Não há proporção a calcular, e distribuir por linhas que valem zero
    // produziria zero — apagando um desconto que foi negociado.
    const semPreco = [linha({ id: 'a', quantity: '10', preco: null })];
    const itens = itemsFromPurchaseRequest(semPreco);

    expect(rateioDoDescontoGeral(COTACAO, semPreco, itens)).toBe('500');
  });

  it('nenhum item selecionado não sugere desconto', () => {
    const itens = itemsFromPurchaseRequest(CINCO_MIL_MAIS_CINCO).map((i) => ({
      ...i,
      selected: false,
    }));

    expect(rateioDoDescontoGeral(COTACAO, CINCO_MIL_MAIS_CINCO, itens)).toBe('');
  });

  it('a SEGUNDA ordem rateia sobre a cotação inteira, não sobre o saldo', () => {
    // 'a' já foi comprado por completo numa ordem anterior; sobra 'b'.
    // A fatia de 'b' é 4.000 de 10.000 — a proporção é da COTAÇÃO, senão a
    // segunda ordem levaria 100% do desconto por ser tudo que restou.
    const cotacao = [
      linha({ id: 'a', quantity: '60', pending: '0' }),
      linha({ id: 'b', quantity: '40', pending: '40' }),
    ];
    const itens = itemsFromPurchaseRequest(cotacao);

    expect(itens).toHaveLength(1);
    expect(rateioDoDescontoGeral(COTACAO, cotacao, itens)).toBe('200');
  });
});
