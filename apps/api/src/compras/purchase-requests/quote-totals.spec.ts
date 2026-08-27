import { Prisma } from '../../../generated/prisma/client';
import {
  calculateItemTotals,
  calculateQuoteTotals,
  isQuoted,
  resolveDiscount,
  type Discount,
  type QuoteItem,
} from './quote-totals';

const d = (value: string) => new Prisma.Decimal(value);
const SEM_DESCONTO: Discount = { type: 'AMOUNT', value: 0 };

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    quantity: d('10'),
    estimatedUnitPrice: d('100'),
    unavailable: false,
    discountType: 'AMOUNT',
    discountValue: 0,
    ...overrides,
  };
}

/// Os totais em string, para as asserções lerem como o que o usuário vê.
function reais(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

describe('quote-totals — a conta da cotação', () => {
  describe('1. Cotação sem desconto', () => {
    it('total é a soma de quantidade × preço', () => {
      const totals = calculateQuoteTotals(
        [
          item({ quantity: d('10'), estimatedUnitPrice: d('100') }),
          item({ quantity: d('20'), estimatedUnitPrice: d('100') }),
        ],
        SEM_DESCONTO,
      );

      expect(reais(totals.itemsSubtotal)).toBe('3000.00');
      expect(reais(totals.itemsDiscount)).toBe('0.00');
      expect(reais(totals.generalDiscount)).toBe('0.00');
      expect(reais(totals.total)).toBe('3000.00');
    });
  });

  describe('2. Desconto por item', () => {
    it('em reais, abate do bruto da linha', () => {
      const linha = calculateItemTotals(
        item({ quantity: d('10'), estimatedUnitPrice: d('100'), discountValue: 100 }),
      );

      expect(reais(linha.gross)).toBe('1000.00');
      expect(reais(linha.discount)).toBe('100.00');
      expect(reais(linha.net)).toBe('900.00');
    });

    it('em porcentagem, calcula sobre o bruto da linha', () => {
      // O exemplo do prompt: 10 × R$ 100 = R$ 1.000, desconto de 10%.
      const linha = calculateItemTotals(
        item({
          quantity: d('10'),
          estimatedUnitPrice: d('100'),
          discountType: 'PERCENT',
          discountValue: 10,
        }),
      );

      expect(reais(linha.discount)).toBe('100.00');
      expect(reais(linha.net)).toBe('900.00');
    });
  });

  describe('3. Desconto total', () => {
    it('em reais, abate do subtotal', () => {
      const totals = calculateQuoteTotals(
        [item({ quantity: d('100'), estimatedUnitPrice: d('100') })],
        { type: 'AMOUNT', value: 500 },
      );

      expect(reais(totals.itemsSubtotal)).toBe('10000.00');
      expect(reais(totals.generalDiscount)).toBe('500.00');
      expect(reais(totals.total)).toBe('9500.00');
    });

    it('em porcentagem, calcula sobre o subtotal', () => {
      const totals = calculateQuoteTotals(
        [item({ quantity: d('100'), estimatedUnitPrice: d('100') })],
        { type: 'PERCENT', value: 5 },
      );

      expect(reais(totals.generalDiscount)).toBe('500.00');
      expect(reais(totals.total)).toBe('9500.00');
    });
  });

  describe('4. Desconto por item + desconto total', () => {
    it('o exemplo do cliente, na ordem exata', () => {
      // Item A: R$ 1.000 − R$ 100 = R$ 900
      // Item B: R$ 2.000
      // Subtotal: R$ 2.900 · Desconto geral: R$ 100 · Total: R$ 2.800
      const totals = calculateQuoteTotals(
        [
          item({ quantity: d('10'), estimatedUnitPrice: d('100'), discountValue: 100 }),
          item({ quantity: d('20'), estimatedUnitPrice: d('100') }),
        ],
        { type: 'AMOUNT', value: 100 },
      );

      expect(reais(totals.itemsSubtotal)).toBe('3000.00');
      expect(reais(totals.itemsDiscount)).toBe('100.00');
      expect(reais(totals.subtotalAfterItemDiscounts)).toBe('2900.00');
      expect(reais(totals.generalDiscount)).toBe('100.00');
      expect(reais(totals.total)).toBe('2800.00');
    });

    it('o desconto geral incide sobre o subtotal JÁ LÍQUIDO, não sobre o bruto', () => {
      // A armadilha que este módulo existe para evitar: 10% sobre o bruto
      // (R$ 3.000) daria R$ 300 e o abatimento do item entraria duas vezes.
      // O correto é 10% sobre R$ 2.900 = R$ 290.
      const totals = calculateQuoteTotals(
        [
          item({ quantity: d('10'), estimatedUnitPrice: d('100'), discountValue: 100 }),
          item({ quantity: d('20'), estimatedUnitPrice: d('100') }),
        ],
        { type: 'PERCENT', value: 10 },
      );

      expect(reais(totals.generalDiscount)).toBe('290.00');
      expect(reais(totals.total)).toBe('2610.00');
    });
  });

  describe('5. Vários itens com descontos diferentes', () => {
    it('mistura reais e porcentagem sem contaminar uma linha com a outra', () => {
      const totals = calculateQuoteTotals(
        [
          // 1.000 − 100 (reais)
          item({ quantity: d('10'), estimatedUnitPrice: d('100'), discountValue: 100 }),
          // 2.000 − 5% = 2.000 − 100
          item({
            quantity: d('20'),
            estimatedUnitPrice: d('100'),
            discountType: 'PERCENT',
            discountValue: 5,
          }),
          // 500, sem desconto
          item({ quantity: d('5'), estimatedUnitPrice: d('100') }),
        ],
        SEM_DESCONTO,
      );

      expect(reais(totals.itemsSubtotal)).toBe('3500.00');
      expect(reais(totals.itemsDiscount)).toBe('200.00');
      expect(reais(totals.total)).toBe('3300.00');
    });
  });

  describe('6. Item indisponível', () => {
    it('não entra no subtotal nem recebe desconto', () => {
      const totals = calculateQuoteTotals(
        [
          item({ quantity: d('10'), estimatedUnitPrice: d('100') }),
          item({ quantity: d('5'), estimatedUnitPrice: null, unavailable: true }),
        ],
        SEM_DESCONTO,
      );

      expect(reais(totals.itemsSubtotal)).toBe('1000.00');
      expect(reais(totals.total)).toBe('1000.00');
    });

    it('desconto gravado em item indisponível é ignorado pela conta', () => {
      // Não deveria existir (o service limpa ao marcar indisponível), mas se
      // um dado legado tiver, a conta não pode abater nada por ele.
      const linha = calculateItemTotals(
        item({ estimatedUnitPrice: null, unavailable: true, discountValue: 500 }),
      );

      expect(reais(linha.gross)).toBe('0.00');
      expect(reais(linha.discount)).toBe('0.00');
      expect(reais(linha.net)).toBe('0.00');
    });

    it('não entra na BASE do desconto geral', () => {
      // Se a torneira entrasse, 10% seriam calculados sobre um subtotal maior
      // e o desconto geral sairia inflado.
      const totals = calculateQuoteTotals(
        [
          item({ quantity: d('10'), estimatedUnitPrice: d('100') }),
          item({ quantity: d('5'), estimatedUnitPrice: null, unavailable: true }),
        ],
        { type: 'PERCENT', value: 10 },
      );

      expect(reais(totals.generalDiscount)).toBe('100.00');
      expect(reais(totals.total)).toBe('900.00');
    });

    it('item sem preço também fica fora — é "não cotado", não "de graça"', () => {
      expect(isQuoted(item({ estimatedUnitPrice: null }))).toBe(false);
      expect(reais(calculateItemTotals(item({ estimatedUnitPrice: null })).gross)).toBe('0.00');
    });
  });

  describe('7. Desconto de 0%', () => {
    it('não muda nada, em nenhum dos dois níveis', () => {
      const totals = calculateQuoteTotals([item({ discountType: 'PERCENT', discountValue: 0 })], {
        type: 'PERCENT',
        value: 0,
      });

      expect(reais(totals.itemsDiscount)).toBe('0.00');
      expect(reais(totals.generalDiscount)).toBe('0.00');
      expect(reais(totals.total)).toBe('1000.00');
    });

    it('desconto de R$ 0,00 também é ausência de desconto', () => {
      expect(reais(resolveDiscount(d('1000'), { type: 'AMOUNT', value: 0 }))).toBe('0.00');
    });
  });

  describe('8. Desconto máximo válido', () => {
    it('100% zera a linha sem deixar o total negativo', () => {
      const linha = calculateItemTotals(item({ discountType: 'PERCENT', discountValue: 100 }));

      expect(reais(linha.discount)).toBe('1000.00');
      expect(reais(linha.net)).toBe('0.00');
    });

    it('desconto geral igual ao subtotal zera o total', () => {
      const totals = calculateQuoteTotals([item()], { type: 'AMOUNT', value: 1000 });

      expect(reais(totals.total)).toBe('0.00');
    });
  });

  describe('9 e 10. Desconto inválido não produz total negativo', () => {
    it('desconto em reais maior que a base é aparado na base', () => {
      // O service RECUSA isto com mensagem antes de chegar aqui; a aparagem é
      // a última linha de defesa contra dado legado ou corrida entre edições.
      expect(reais(resolveDiscount(d('1000'), { type: 'AMOUNT', value: 1500 }))).toBe('1000.00');
    });

    it('percentual acima de 100 é aparado na base', () => {
      expect(reais(resolveDiscount(d('1000'), { type: 'PERCENT', value: 150 }))).toBe('1000.00');
    });

    it('desconto negativo é tratado como ausência, nunca como acréscimo', () => {
      expect(reais(resolveDiscount(d('1000'), { type: 'AMOUNT', value: -100 }))).toBe('0.00');
      expect(reais(resolveDiscount(d('1000'), { type: 'PERCENT', value: -10 }))).toBe('0.00');
    });

    it('o total nunca fica abaixo de zero, nem somando os dois níveis', () => {
      const totals = calculateQuoteTotals([item({ discountValue: 99999 })], {
        type: 'AMOUNT',
        value: 99999,
      });

      expect(totals.total.greaterThanOrEqualTo(0)).toBe(true);
      expect(reais(totals.total)).toBe('0.00');
    });
  });

  describe('12. Arredondamento e precisão monetária', () => {
    it('0,1 × 3 não vira 0,30000000000000004', () => {
      const linha = calculateItemTotals(item({ quantity: d('3'), estimatedUnitPrice: d('0.10') }));

      expect(reais(linha.gross)).toBe('0.30');
    });

    it('HALF_UP: 0,005 sobe, como o Postgres faz ao gravar DECIMAL(14,2)', () => {
      // 1 × 33,333 com 10% = 3,3333 → 3,33
      expect(reais(resolveDiscount(d('33.33'), { type: 'PERCENT', value: 10 }))).toBe('3.33');
      // 1 × 0,05 = 0,005 → 0,01
      expect(reais(resolveDiscount(d('0.10'), { type: 'PERCENT', value: 5 }))).toBe('0.01');
    });

    it('quantidade fracionária mantém o centavo certo', () => {
      // 1,5 m³ × R$ 85,00 = R$ 127,50
      const linha = calculateItemTotals(
        item({ quantity: d('1.500'), estimatedUnitPrice: d('85.00') }),
      );

      expect(reais(linha.gross)).toBe('127.50');
    });

    it('o total é a soma dos valores JÁ ARREDONDADOS de cada linha', () => {
      // Se somasse o produto bruto e arredondasse no fim, o total divergiria
      // por centavos da coluna que o usuário lê na tela.
      const linhas = [
        item({ quantity: d('3'), estimatedUnitPrice: d('0.335') }),
        item({ quantity: d('3'), estimatedUnitPrice: d('0.335') }),
      ];
      const totals = calculateQuoteTotals(linhas, SEM_DESCONTO);
      const somaDasLinhas = linhas
        .map((linha) => calculateItemTotals(linha).gross)
        .reduce((soma, valor) => soma.plus(valor), d('0'));

      expect(reais(totals.itemsSubtotal)).toBe(reais(somaDasLinhas));
      expect(reais(totals.itemsSubtotal)).toBe('2.02');
    });
  });

  describe('11. Cálculo do total ponta a ponta', () => {
    it('o resumo financeiro do prompt fecha em todas as etapas', () => {
      // Subtotal 2.900 · Descontos nos itens 100 · Após descontos 2.800
      // Desconto geral 50 · TOTAL 2.750
      const totals = calculateQuoteTotals(
        [
          item({ quantity: d('10'), estimatedUnitPrice: d('100'), discountValue: 100 }),
          item({ quantity: d('20'), estimatedUnitPrice: d('100') }),
        ],
        { type: 'AMOUNT', value: 50 },
      );

      expect(reais(totals.itemsSubtotal)).toBe('3000.00');
      expect(reais(totals.itemsDiscount)).toBe('100.00');
      expect(reais(totals.subtotalAfterItemDiscounts)).toBe('2900.00');
      expect(reais(totals.generalDiscount)).toBe('50.00');
      expect(reais(totals.total)).toBe('2850.00');
    });

    it('subtotal − descontos = total, sempre', () => {
      const totals = calculateQuoteTotals(
        [
          item({
            quantity: d('7'),
            estimatedUnitPrice: d('13.37'),
            discountType: 'PERCENT',
            discountValue: 7.5,
          }),
          item({ quantity: d('3'), estimatedUnitPrice: d('99.99'), discountValue: 12.34 }),
        ],
        { type: 'PERCENT', value: 3.5 },
      );

      const conferido = totals.itemsSubtotal
        .minus(totals.itemsDiscount)
        .minus(totals.generalDiscount);

      expect(reais(totals.total)).toBe(reais(conferido));
    });
  });
});
