import { CODE128_PATTERNS, code128cSymbols, code128cWidths } from './code128';

describe('Code 128C', () => {
  it('tem os 107 padrões da tabela, todos distintos e com a largura certa', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, index) => {
      const soma = pattern
        .split('')
        .map(Number)
        .reduce((a, b) => a + b, 0);
      expect(soma).toBe(index === 106 ? 13 : 11);
    });
  });

  it('calcula o dígito verificador', () => {
    // 105 + 12×1 + 34×2 + 56×3 + 78×4 = 665; 665 mod 103 = 47.
    expect(code128cSymbols('12345678')).toEqual([105, 12, 34, 56, 78, 47, 106]);
  });

  it('codifica a chave de acesso inteira: 22 pares entre início, verificador e parada', () => {
    const chave = '35260812345678000190550010000012341000012345';
    const larguras = code128cWidths(chave);
    const modulos = larguras.reduce((a, b) => a + b, 0);
    expect(modulos).toBe(11 + 22 * 11 + 11 + 13);
    // Começa e termina em barra: número ímpar de elementos.
    expect(larguras.length % 2).toBe(1);
  });

  it('recusa entrada que não é par de dígitos', () => {
    expect(() => code128cSymbols('123')).toThrow();
    expect(() => code128cSymbols('12a4')).toThrow();
  });
});
