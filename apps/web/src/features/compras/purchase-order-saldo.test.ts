import { describe, expect, it } from 'vitest';

import {
  itemsFromPurchaseRequest,
  purchaseOrderFormSchema,
  PURCHASE_ORDER_FORM_DEFAULTS,
} from './purchase-order-form-schema';

/// Uma linha da solicitação como o detalhe a devolve, com o atendimento junto.
function linha(overrides: {
  id?: string;
  description?: string;
  quantity?: string;
  fulfilled?: string;
  pending?: string;
  unavailable?: boolean;
}) {
  return {
    id: overrides.id ?? 'item-cimento',
    description: overrides.description ?? 'Cimento CP-II',
    unit: 'SC',
    quantity: overrides.quantity ?? '100',
    estimatedUnitPrice: '32.90',
    unavailable: overrides.unavailable ?? false,
    discountType: 'AMOUNT' as const,
    discountValue: '0',
    fulfillment: {
      fulfilledQuantity: overrides.fulfilled ?? '0',
      pendingQuantity: overrides.pending ?? overrides.quantity ?? '100',
    },
  };
}

function validar(items: ReturnType<typeof itemsFromPurchaseRequest>) {
  return purchaseOrderFormSchema.safeParse({
    ...PURCHASE_ORDER_FORM_DEFAULTS,
    supplierId: 'fornecedor-1',
    items,
  });
}

describe('19 e 20. O formulário da nova ordem parte do saldo pendente', () => {
  it('na PRIMEIRA ordem nada muda: todas as linhas, com a quantidade cheia', () => {
    const items = itemsFromPurchaseRequest([
      linha({ id: 'cimento', quantity: '100' }),
      linha({ id: 'tinta', description: 'Tinta acrílica', quantity: '10' }),
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]!.quantity).toBe('100');
    expect(items[1]!.quantity).toBe('10');
  });

  it('a linha já atendida SOME da lista', () => {
    // Oferecê-la convidaria a comprar de novo o que já foi comprado — e o
    // servidor recusaria, depois de a pessoa ter preenchido tudo.
    const items = itemsFromPurchaseRequest([
      linha({ id: 'cimento', quantity: '100', fulfilled: '100', pending: '0' }),
      linha({ id: 'tinta', description: 'Tinta acrílica', quantity: '10', pending: '10' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.description).toBe('Tinta acrílica');
  });

  it('21. a quantidade nasce com o SALDO, não com o solicitado', () => {
    const items = itemsFromPurchaseRequest([
      linha({ quantity: '100', fulfilled: '60', pending: '40' }),
    ]);

    // Na segunda ordem, o que se compra é o que falta.
    expect(items[0]!.quantity).toBe('40');
    expect(items[0]!.pendingQuantity).toBe('40');
    expect(items[0]!.fulfilledQuantity).toBe('60');
  });

  it('24. solicitação inteiramente atendida não oferece linha nenhuma', () => {
    const items = itemsFromPurchaseRequest([
      linha({ id: 'cimento', quantity: '100', fulfilled: '100', pending: '0' }),
      linha({ id: 'ferro', quantity: '20', fulfilled: '20', pending: '0' }),
    ]);

    expect(items).toEqual([]);
  });

  it('25. parcialmente atendida oferece só o que falta', () => {
    const items = itemsFromPurchaseRequest([
      linha({ id: 'cimento', quantity: '100', fulfilled: '100', pending: '0' }),
      linha({ id: 'ferro', quantity: '20', fulfilled: '20', pending: '0' }),
      linha({ id: 'tinta', description: 'Tinta', quantity: '10', pending: '10' }),
    ]);

    // O caso do enunciado: cimento e ferro na Loja A, tinta pendente.
    expect(items.map((item) => item.description)).toEqual(['Tinta']);
  });

  it('item indisponível na cotação continua na lista, apenas desmarcado', () => {
    // É a tinta que a Loja A não tinha: ela precisa aparecer para poder ser
    // comprada da Loja B.
    const items = itemsFromPurchaseRequest([
      linha({ quantity: '10', pending: '10', unavailable: true }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.selected).toBe(false);
  });
});

describe('22. Bloqueio de quantidade acima do pendente', () => {
  it('recusa comprar mais do que resta', () => {
    const items = itemsFromPurchaseRequest([
      linha({ quantity: '100', fulfilled: '60', pending: '40' }),
    ]);
    items[0]!.quantity = '41';

    const resultado = validar(items);

    expect(resultado.success).toBe(false);
    expect(resultado.error!.issues[0]!.message).toContain('Restam apenas 40');
    // Aponta a LINHA, para o erro aparecer na célula certa e não no rodapé.
    expect(resultado.error!.issues[0]!.path).toEqual(['items', 0, 'quantity']);
  });

  it('aceita comprar exatamente o pendente', () => {
    const items = itemsFromPurchaseRequest([
      linha({ quantity: '100', fulfilled: '60', pending: '40' }),
    ]);
    items[0]!.quantity = '40';

    expect(validar(items).success).toBe(true);
  });

  it('aceita comprar menos que o pendente — é a compra parcial', () => {
    const items = itemsFromPurchaseRequest([
      linha({ quantity: '100', fulfilled: '60', pending: '40' }),
    ]);
    items[0]!.quantity = '10';

    expect(validar(items).success).toBe(true);
  });

  it('a linha DESMARCADA não é conferida contra saldo nenhum', () => {
    const items = itemsFromPurchaseRequest([
      linha({ id: 'cimento', quantity: '100', pending: '100' }),
      linha({ id: 'tinta', description: 'Tinta', quantity: '10', pending: '10' }),
    ]);
    items[1]!.selected = false;
    items[1]!.quantity = '999';

    // Reclamar de uma linha que não vai ser comprada travaria a compra parcial.
    expect(validar(items).success).toBe(true);
  });

  it('quantidade zero continua sendo recusada, e com a mensagem de sempre', () => {
    const items = itemsFromPurchaseRequest([linha({ quantity: '100', pending: '100' })]);
    items[0]!.quantity = '0';

    const resultado = validar(items);

    expect(resultado.success).toBe(false);
    expect(resultado.error!.issues[0]!.message).toContain('maior que zero');
  });
});
