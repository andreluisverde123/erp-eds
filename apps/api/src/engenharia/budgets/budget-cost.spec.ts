import { Prisma } from '../../../generated/prisma/client';
import {
  lineTotalExact,
  moneyPair,
  quantityProblem,
  roundMoney,
  sumExact,
  unitCostProblem,
} from './budget-cost';

const D = (valor: string) => new Prisma.Decimal(valor);

describe('Total da linha', () => {
  it('é quantidade × custo unitário, sem arredondar', () => {
    expect(lineTotalExact('100', '45').toString()).toBe('4500');
    expect(lineTotalExact('12.5', '75.0000').toString()).toBe('937.5');
    expect(lineTotalExact('1.2345', '0.3333').toString()).toBe('0.41145885');
  });

  it('não sofre erro de ponto flutuante', () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(lineTotalExact(0.1, 3).toString()).toBe('0.3');
  });
});

describe('Arredondamento para centavos', () => {
  it('é HALF_UP', () => {
    expect(roundMoney(D('0.005')).toFixed(2)).toBe('0.01');
    expect(roundMoney(D('0.004999')).toFixed(2)).toBe('0.00');
    expect(roundMoney(D('10.125')).toFixed(2)).toBe('10.13');
  });

  it('o total soma os EXATOS e arredonda uma vez — não soma linhas arredondadas', () => {
    // Três linhas de 1 × R$ 0,3333. Arredondadas, cada uma mostra R$ 0,33 e a
    // soma delas daria R$ 0,99. A soma exata é 0,9999, que arredonda para
    // R$ 1,00 — e esse é o total.
    const linhas = [lineTotalExact(1, '0.3333'), lineTotalExact(1, '0.3333'), lineTotalExact(1, '0.3333')];

    const somaDasArredondadas = sumExact(linhas.map(roundMoney));
    const total = roundMoney(sumExact(linhas));

    expect(somaDasArredondadas.toFixed(2)).toBe('0.99');
    expect(total.toFixed(2)).toBe('1.00');
  });

  it('o total não depende de como o mesmo serviço foi dividido em linhas', () => {
    const numaLinha = roundMoney(lineTotalExact(100, '0.1234'));
    const emCem = roundMoney(sumExact(Array.from({ length: 100 }, () => lineTotalExact(1, '0.1234'))));

    expect(numaLinha.toFixed(2)).toBe(emCem.toFixed(2));
  });

  it('a API recebe o valor em centavos e o exato', () => {
    expect(moneyPair(D('0.9999'))).toEqual({ amount: '1.00', exact: '0.99990000' });
  });
});

describe('Validação de quantidade e custo', () => {
  it('quantidade maior que zero, até 4 casas', () => {
    expect(quantityProblem('123.4567')).toBeNull();
    expect(quantityProblem(0)).toMatch(/maior que zero/);
    expect(quantityProblem(-1)).toMatch(/maior que zero/);
    expect(quantityProblem('1.23456')).toMatch(/4 casas/);
    expect(quantityProblem('abc')).toBe('Quantidade inválida.');
  });

  it('custo unitário zero ou positivo, até 4 casas', () => {
    expect(unitCostProblem(0)).toBeNull();
    expect(unitCostProblem('45.1234')).toBeNull();
    expect(unitCostProblem(-0.01)).toMatch(/negativo/);
    expect(unitCostProblem('1.23456')).toMatch(/4 casas/);
  });
});
