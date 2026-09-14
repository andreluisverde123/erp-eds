import { Prisma } from '../../../generated/prisma/client';
import {
  coefficientProblem,
  itemCost,
  toDecimal,
  unitCost,
  unitPriceProblem,
} from './composition-cost';

/// O exemplo do enunciado: 1 m² de alvenaria de vedação.
const ALVENARIA = [
  { insumo: 'Bloco cerâmico', coefficient: 25, unitPrice: 1.5, esperado: '37.5000' },
  { insumo: 'Pedreiro', coefficient: 0.8, unitPrice: 30, esperado: '24.0000' },
  { insumo: 'Servente', coefficient: 0.6, unitPrice: 20, esperado: '12.0000' },
  { insumo: 'Betoneira', coefficient: 0.1, unitPrice: 15, esperado: '1.5000' },
];

describe('Custo do item', () => {
  it('é coeficiente × preço unitário', () => {
    for (const linha of ALVENARIA) {
      expect(itemCost(linha.coefficient, linha.unitPrice).toFixed(4)).toBe(linha.esperado);
    }
  });

  it('não sofre erro de ponto flutuante', () => {
    // A razão de tudo estar em Decimal.
    expect(0.1 * 3).not.toBe(0.3);
    expect(itemCost(0.1, 3).toString()).toBe('0.3');
    expect(itemCost(0.1, 0.2).toString()).toBe('0.02');
  });

  it('coeficiente de seis casas não vira centavo cheio', () => {
    // 0,000123 × 50 = 0,00615. Em duas casas seria 0,01 — 63% a mais.
    expect(itemCost('0.000123', '50').toString()).toBe('0.0062');
  });

  it('arredonda para quatro casas, HALF_UP', () => {
    expect(itemCost('0.00005', '1').toString()).toBe('0.0001');
    expect(itemCost('0.00004', '1').toString()).toBe('0');
  });

  it('aceita o Decimal que vem do banco, com a escala da coluna', () => {
    expect(itemCost(new Prisma.Decimal('0.800000'), new Prisma.Decimal('30.0000')).toFixed(4)).toBe(
      '24.0000',
    );
  });
});

describe('Custo unitário da composição', () => {
  it('é a soma dos itens: 75,00 por M2 no exemplo', () => {
    expect(unitCost(ALVENARIA).toFixed(2)).toBe('75.00');
  });

  it('é a soma EXATA dos custos de item já arredondados', () => {
    // Sem arredondamento, 0,00615 + 0,00615 = 0,0123. A tela mostra 0,0062 em
    // cada linha, e o total precisa ser a soma do que ela mostra: 0,0124.
    const linhas = [
      { coefficient: '0.000123', unitPrice: '50' },
      { coefficient: '0.000123', unitPrice: '50' },
    ];

    const somaDasLinhas = linhas
      .map((linha) => itemCost(linha.coefficient, linha.unitPrice))
      .reduce((total, custo) => total.plus(custo), new Prisma.Decimal(0));

    expect(unitCost(linhas).toString()).toBe('0.0124');
    expect(unitCost(linhas).equals(somaDasLinhas)).toBe(true);
  });

  it('dez linhas de 0,1 × 3 somam 3 exatos', () => {
    const linhas = Array.from({ length: 10 }, () => ({ coefficient: 0.1, unitPrice: 3 }));
    expect(unitCost(linhas).toString()).toBe('3');
  });

  it('sem itens, o custo é zero', () => {
    expect(unitCost([]).toString()).toBe('0');
  });
});

describe('Validação do coeficiente', () => {
  it('aceita coeficiente técnico positivo, até seis casas', () => {
    expect(coefficientProblem(12.5)).toBeNull();
    expect(coefficientProblem('0.000123')).toBeNull();
    expect(coefficientProblem(25)).toBeNull();
  });

  it('zero é recusado', () => {
    // Item que não consome nada só ocupa a linha: remove-se o item.
    expect(coefficientProblem(0)).toMatch(/maior que zero/);
  });

  it('negativo é recusado', () => {
    expect(coefficientProblem(-1)).toMatch(/maior que zero/);
  });

  it('mais de seis casas é recusado, em vez de arredondado em silêncio', () => {
    expect(coefficientProblem('0.0000001')).toMatch(/6 casas/);
  });

  it('acima do que DECIMAL(14,6) guarda é recusado', () => {
    expect(coefficientProblem('100000000')).toMatch(/limite/);
    expect(coefficientProblem('99999999.999999')).toBeNull();
  });

  it('o que não é número é recusado', () => {
    for (const valor of ['abc', '', '   ', NaN, Infinity, null, undefined, {}]) {
      expect(coefficientProblem(valor)).toBe('Coeficiente inválido.');
    }
  });
});

describe('Validação do preço unitário', () => {
  it('zero é aceito', () => {
    // Recurso próprio já pago entra para registrar consumo sem somar custo.
    expect(unitPriceProblem(0)).toBeNull();
  });

  it('negativo é recusado', () => {
    expect(unitPriceProblem(-0.01)).toMatch(/negativo/);
  });

  it('mais de quatro casas é recusado', () => {
    expect(unitPriceProblem('1.23456')).toMatch(/4 casas/);
    expect(unitPriceProblem('1.2345')).toBeNull();
  });

  it('acima do que DECIMAL(14,4) guarda é recusado', () => {
    expect(unitPriceProblem('10000000000')).toMatch(/limite/);
  });

  it('o que não é número é recusado', () => {
    expect(unitPriceProblem('R$ 10')).toBe('Preço unitário inválido.');
  });
});

describe('Conversão da entrada', () => {
  it('string preserva o valor sem passar pelo binário do JavaScript', () => {
    expect(toDecimal('0.000123')!.toString()).toBe('0.000123');
    expect(toDecimal(' 12.5 ')!.toString()).toBe('12.5');
  });
});
