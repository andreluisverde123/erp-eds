import { numeroPorExtenso, valorPorExtenso } from './valor-por-extenso';

describe('Números por extenso', () => {
  it.each([
    [0, 'zero'],
    [1, 'um'],
    [15, 'quinze'],
    [21, 'vinte e um'],
    [90, 'noventa'],
    [100, 'cem'],
    [101, 'cento e um'],
    [345, 'trezentos e quarenta e cinco'],
    [1000, 'mil'],
    [1200, 'mil e duzentos'],
    [1234, 'mil duzentos e trinta e quatro'],
    [2005, 'dois mil e cinco'],
    [125430, 'cento e vinte e cinco mil quatrocentos e trinta'],
    [1_000_000, 'um milhão'],
    [1_500_000, 'um milhão e quinhentos mil'],
    [2_000_001, 'dois milhões e um'],
  ])('%d → %s', (numero, texto) => {
    expect(numeroPorExtenso(numero)).toBe(texto);
  });

  it('recusa número negativo ou fracionado', () => {
    expect(() => numeroPorExtenso(-1)).toThrow();
    expect(() => numeroPorExtenso(1.5)).toThrow();
  });
});

describe('Valores em reais por extenso', () => {
  it.each([
    [1, 'um real'],
    [2.5, 'dois reais e cinquenta centavos'],
    [0.01, 'um centavo'],
    [100, 'cem reais'],
    [12500, 'doze mil e quinhentos reais'],
    [125430.75, 'cento e vinte e cinco mil quatrocentos e trinta reais e setenta e cinco centavos'],
    [1_000_000, 'um milhão de reais'],
    [3_000_000.1, 'três milhões de reais e dez centavos'],
    ['45.0000', 'quarenta e cinco reais'],
    [0, 'zero real'],
  ])('%s → %s', (valor, texto) => {
    expect(valorPorExtenso(valor)).toBe(texto);
  });
});
