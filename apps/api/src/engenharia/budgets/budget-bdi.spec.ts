import { Prisma } from '../../../generated/prisma/client';
import { bdiProblem, budgetPrice } from './budget-bdi';

const D = (valor: string) => new Prisma.Decimal(valor);

describe('BDI', () => {
  it('zero é válido e não muda o preço', () => {
    expect(bdiProblem(0)).toBeNull();
    expect(budgetPrice(D('1000'), 0)).toEqual({
      directCost: '1000.00',
      directCostExact: '1000.00000000',
      bdiPercent: '0.0000',
      bdiValue: '0.00',
      finalPrice: '1000.00',
    });
  });

  it('percentual sobre o custo direto: 25% de R$ 1.000,00 = R$ 250,00', () => {
    const preco = budgetPrice(D('1000'), '25');
    expect(preco.bdiValue).toBe('250.00');
    expect(preco.finalPrice).toBe('1250.00');
  });

  it('aplica sobre o custo direto JÁ em centavos, e o preço final é a soma das duas linhas exibidas', () => {
    // Exato 100,005 → custo direto 100,01 (HALF_UP). 22,1234% de 100,01 = 22,1256... → 22,13.
    const preco = budgetPrice(D('100.005'), '22.1234');
    expect(preco.directCost).toBe('100.01');
    expect(preco.bdiValue).toBe('22.13');
    expect(preco.finalPrice).toBe('122.14');
    expect(D(preco.directCost).plus(D(preco.bdiValue)).toFixed(2)).toBe(preco.finalPrice);
  });

  it('arredonda o valor do BDI meio-centavo para cima (HALF_UP)', () => {
    // 10% de R$ 0,05 = R$ 0,005 → R$ 0,01.
    expect(budgetPrice(D('0.05'), '10').bdiValue).toBe('0.01');
  });

  it('recusa negativo, casas demais, não número e acima do limite da coluna', () => {
    expect(bdiProblem(-0.01)).toBe('O BDI não pode ser negativo.');
    expect(bdiProblem('25.12345')).toBe('O BDI aceita até 4 casas decimais.');
    expect(bdiProblem('abc')).toBe('BDI inválido.');
    expect(bdiProblem(1000)).toBe('O BDI deve ser menor que 1000%.');
    expect(bdiProblem('999.9999')).toBeNull();
    expect(bdiProblem(1e-4)).toBeNull();
  });
});
