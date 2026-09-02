import { Prisma } from '../../generated/prisma/client';
import {
  aggregateFulfillment,
  buildItemFulfillment,
  pendingOf,
  statusOf,
  type FulfillmentEntry,
} from './fulfillment';

/// Uma compra que atendeu (parte de) uma linha.
function compra(code: string, loja: string, quantidade: number): FulfillmentEntry {
  return {
    purchaseOrderId: `id-${code}`,
    purchaseOrderCode: code,
    supplierName: loja,
    quantity: new Prisma.Decimal(quantidade),
  };
}

const n = (valor: Prisma.Decimal) => valor.toNumber();

describe('Atendimento da solicitação — a conta', () => {
  describe('1. Solicitação com todos os itens pendentes', () => {
    it('nada comprado é pendente, não parcial', () => {
      const cimento = buildItemFulfillment(100, []);
      const tinta = buildItemFulfillment(10, []);

      expect(cimento.status).toBe('PENDING');
      expect(n(cimento.pendingQuantity)).toBe(100);
      expect(n(cimento.fulfilledQuantity)).toBe(0);

      expect(aggregateFulfillment([cimento, tinta])).toEqual({
        status: 'PENDING',
        totalItems: 2,
        fulfilledItems: 0,
        pendingItems: 2,
      });
    });
  });

  describe('2. Ordem atendendo 100%', () => {
    it('comprar tudo zera o pendente e fecha a linha', () => {
      const item = buildItemFulfillment(100, [compra('OC-0001', 'Loja A', 100)]);

      expect(item.status).toBe('FULFILLED');
      expect(n(item.fulfilledQuantity)).toBe(100);
      expect(n(item.pendingQuantity)).toBe(0);
    });
  });

  describe('3. Ordem atendendo parcialmente', () => {
    it('60 de 100 deixa 40 em aberto', () => {
      const item = buildItemFulfillment(100, [compra('OC-0001', 'Loja A', 60)]);

      expect(item.status).toBe('PARTIAL');
      expect(n(item.fulfilledQuantity)).toBe(60);
      expect(n(item.pendingQuantity)).toBe(40);
    });
  });

  describe('4 e 5. Segunda e terceira ordem para o saldo restante', () => {
    it('40 + 30 + 30 fecham os 100 sem nova solicitação', () => {
      const item = buildItemFulfillment(100, [
        compra('OC-0001', 'Loja A', 40),
        compra('OC-0002', 'Loja B', 30),
        compra('OC-0003', 'Loja C', 30),
      ]);

      expect(item.status).toBe('FULFILLED');
      expect(n(item.pendingQuantity)).toBe(0);
      // As três continuam listadas: é o histórico que responde "quem vendeu o
      // quê", e ele não pode colapsar num total.
      expect(item.entries.map((e) => e.purchaseOrderCode)).toEqual([
        'OC-0001',
        'OC-0002',
        'OC-0003',
      ]);
    });

    it('60 na Loja A e 40 na Loja B somam o pedido inteiro', () => {
      const item = buildItemFulfillment(100, [
        compra('OC-0001', 'Loja A', 60),
        compra('OC-0002', 'Loja B', 40),
      ]);

      expect(item.status).toBe('FULFILLED');
      expect(item.entries.map((e) => e.supplierName)).toEqual(['Loja A', 'Loja B']);
    });
  });

  describe('7 e 8. O estado agregado da solicitação', () => {
    it('tudo atendido conclui a solicitação', () => {
      const resumo = aggregateFulfillment([
        buildItemFulfillment(100, [compra('OC-0001', 'Loja A', 100)]),
        buildItemFulfillment(20, [compra('OC-0001', 'Loja A', 20)]),
      ]);

      expect(resumo).toEqual({
        status: 'FULFILLED',
        totalItems: 2,
        fulfilledItems: 2,
        pendingItems: 0,
      });
    });

    it('uma lata de tinta pendente segura a solicitação inteira', () => {
      // O caso do enunciado: cimento e ferro comprados na Loja A, tinta não.
      const resumo = aggregateFulfillment([
        buildItemFulfillment(100, [compra('OC-0001', 'Loja A', 100)]),
        buildItemFulfillment(20, [compra('OC-0001', 'Loja A', 20)]),
        buildItemFulfillment(10, []),
      ]);

      // NÃO é "concluída": ainda falta comprar, e é isso que o usuário precisa
      // enxergar para gerar a segunda ordem.
      expect(resumo.status).toBe('PARTIAL');
      expect(resumo.fulfilledItems).toBe(2);
      expect(resumo.pendingItems).toBe(1);
    });

    it('um item comprado pela metade já tira a solicitação de pendente', () => {
      const resumo = aggregateFulfillment([
        buildItemFulfillment(100, [compra('OC-0001', 'Loja A', 1)]),
        buildItemFulfillment(10, []),
      ]);

      expect(resumo.status).toBe('PARTIAL');
      // Nenhuma linha FECHADA, mas a solicitação já está em atendimento.
      expect(resumo.fulfilledItems).toBe(0);
    });

    it('solicitação sem itens é pendente, nunca atendida', () => {
      // "Atendida" afirmaria uma compra que nunca houve.
      expect(aggregateFulfillment([]).status).toBe('PENDING');
    });
  });

  describe('quantidade fracionada', () => {
    it('1,5 m³ de 4,5 m³ é parcial, e a conta fecha em decimal', () => {
      const item = buildItemFulfillment('4.5', [
        compra('OC-0001', 'Loja A', 1.5),
        compra('OC-0002', 'Loja B', 1.5),
      ]);

      expect(item.status).toBe('PARTIAL');
      expect(n(item.pendingQuantity)).toBe(1.5);
    });

    it('somar 0,1 três vezes fecha 0,3 — a conta é Decimal, não ponto flutuante', () => {
      // Em `number`, 0.1+0.1+0.1 dá 0.30000000000000004 e a linha jamais
      // fecharia. É o motivo de tudo aqui ser `Prisma.Decimal`.
      const item = buildItemFulfillment('0.3', [
        compra('OC-0001', 'Loja A', 0.1),
        compra('OC-0002', 'Loja A', 0.1),
        compra('OC-0003', 'Loja A', 0.1),
      ]);

      expect(item.status).toBe('FULFILLED');
      expect(n(item.pendingQuantity)).toBe(0);
    });
  });

  describe('ordens anteriores a esta regra', () => {
    it('comprado a mais aparece como atendido, e o pendente nunca fica negativo', () => {
      // Nada impedia isso antes desta etapa. "−20 pendentes" na tela seria
      // pior que o próprio excesso, e um limite negativo no formulário da
      // nova ordem quebraria a validação.
      const item = buildItemFulfillment(100, [compra('OC-0001', 'Loja A', 120)]);

      expect(item.status).toBe('FULFILLED');
      expect(n(item.pendingQuantity)).toBe(0);
      // O excesso não é escondido: o total comprado continua sendo 120.
      expect(n(item.fulfilledQuantity)).toBe(120);
    });

    it('pendingOf tem piso em zero', () => {
      expect(n(pendingOf(100, 120))).toBe(0);
      expect(n(pendingOf(100, 40))).toBe(60);
    });
  });

  describe('statusOf', () => {
    it('zero comprado é PENDING, mesmo com pedido zero', () => {
      expect(statusOf(0, 0)).toBe('PENDING');
      expect(statusOf(100, 0)).toBe('PENDING');
    });

    it('comprado igual ou acima do pedido é FULFILLED', () => {
      expect(statusOf(100, 100)).toBe('FULFILLED');
      expect(statusOf(100, 101)).toBe('FULFILLED');
    });

    it('entre zero e o pedido é PARTIAL', () => {
      expect(statusOf(100, 0.001)).toBe('PARTIAL');
      expect(statusOf(100, 99.999)).toBe('PARTIAL');
    });
  });
});
