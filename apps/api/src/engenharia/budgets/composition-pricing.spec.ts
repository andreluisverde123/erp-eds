import { Prisma } from '../../../generated/prisma/client';
import { priceCompositionAt } from './composition-pricing';

const D = (valor: string) => new Prisma.Decimal(valor);

// 25 blocos × preço + 0,8 h de pedreiro × preço.
const linhas = [
  { catalogItemId: 'bloco', unit: 'UN', coefficient: D('25'), unitPrice: D('1.5') },
  { catalogItemId: 'pedreiro', unit: 'H', coefficient: D('0.8'), unitPrice: D('30') },
];

describe('Composição própria precificada na data-base', () => {
  it('HISTORICAL: todas as linhas usam o preço vigente na data-base', () => {
    const vigentes = new Map([
      ['bloco', { id: 'p1', unitPrice: D('2'), unit: 'UN' }],
      ['pedreiro', { id: 'p2', unitPrice: D('35'), unit: 'H' }],
    ]);
    const resultado = priceCompositionAt(linhas, vigentes);
    expect(resultado.pricing).toBe('HISTORICAL');
    // 25 × 2 + 0,8 × 35 = 78
    expect(resultado.unitCost.toFixed(4)).toBe('78.0000');
    expect(resultado.lines.map((l) => [l.priceOrigin, l.referencePriceId])).toEqual([
      ['HISTORICAL', 'p1'],
      ['HISTORICAL', 'p2'],
    ]);
  });

  it('FALLBACK: sem preço até a data-base, usa o preço da própria composição', () => {
    const resultado = priceCompositionAt(linhas, new Map());
    expect(resultado.pricing).toBe('FALLBACK');
    expect(resultado.unitCost.toFixed(4)).toBe('61.5000');
    expect(resultado.lines.every((l) => l.referencePriceId === null)).toBe(true);
  });

  it('MIXED: parte histórica, parte fallback', () => {
    const resultado = priceCompositionAt(linhas, new Map([['bloco', { id: 'p1', unitPrice: D('2'), unit: 'UN' }]]));
    expect(resultado.pricing).toBe('MIXED');
    // 25 × 2 + 0,8 × 30 = 74
    expect(resultado.unitCost.toFixed(4)).toBe('74.0000');
  });

  it('preço em outra unidade não é usado', () => {
    const resultado = priceCompositionAt(linhas, new Map([['bloco', { id: 'p1', unitPrice: D('2000'), unit: 'MI' }]]));
    expect(resultado.lines[0]!.priceOrigin).toBe('FALLBACK');
    expect(resultado.pricing).toBe('FALLBACK');
  });

  it('não altera as linhas da composição', () => {
    priceCompositionAt(linhas, new Map([['bloco', { id: 'p1', unitPrice: D('2'), unit: 'UN' }]]));
    expect(linhas[0]!.unitPrice.toFixed(4)).toBe('1.5000');
  });
});
