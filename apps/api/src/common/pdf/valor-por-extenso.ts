import type { Prisma } from '../../../generated/prisma/client';

/// Números e valores POR EXTENSO, como os contratos os escrevem:
/// "R$ 12.500,00 (doze mil e quinhentos reais)".
///
/// O extenso existe no contrato para que o valor não possa ser adulterado no
/// papel — acrescentar um dígito ao número não muda o texto ao lado. Por isso
/// o texto sai do MESMO valor que o número, nunca digitado à parte.

const UNIDADES = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const DEZENAS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];
const ESCALAS: [singular: string, plural: string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
];

function ate999(numero: number): string {
  if (numero === 100) return 'cem';
  const partes: string[] = [];
  const centena = Math.floor(numero / 100);
  const resto = numero % 100;
  if (centena > 0) partes.push(CENTENAS[centena]!);
  if (resto > 0) {
    if (resto < 20) {
      partes.push(UNIDADES[resto]!);
    } else {
      const unidade = resto % 10;
      const dezena = DEZENAS[Math.floor(resto / 10)]!;
      partes.push(unidade > 0 ? `${dezena} e ${UNIDADES[unidade]}` : dezena);
    }
  }
  return partes.join(' e ');
}

/// Inteiro não negativo por extenso ("mil duzentos e cinquenta").
export function numeroPorExtenso(numero: number): string {
  if (!Number.isInteger(numero) || numero < 0)
    throw new Error(`Número inválido para extenso: ${numero}`);
  if (numero === 0) return 'zero';

  const grupos: number[] = [];
  for (let resto = numero; resto > 0; resto = Math.floor(resto / 1000)) grupos.push(resto % 1000);
  if (grupos.length > ESCALAS.length)
    throw new Error(`Número grande demais para extenso: ${numero}`);

  let texto = '';
  for (let indice = grupos.length - 1; indice >= 0; indice -= 1) {
    const grupo = grupos[indice]!;
    if (grupo === 0) continue;
    const [singular, plural] = ESCALAS[indice]!;
    // "mil", e não "um mil".
    const parte =
      indice === 1 && grupo === 1
        ? 'mil'
        : `${ate999(grupo)} ${grupo === 1 ? singular : plural}`.trim();

    if (texto) {
      // "dois mil e cinco", "mil e duzentos", mas "mil duzentos e trinta".
      texto += grupo < 100 || grupo % 100 === 0 ? ' e ' : ' ';
    }
    texto += parte;
  }
  return texto;
}

/// Valor em reais por extenso ("doze mil e quinhentos reais e dez centavos").
export function valorPorExtenso(valor: Prisma.Decimal | number | string): string {
  const centavosTotais = Math.round(Number(valor) * 100);
  if (!Number.isFinite(centavosTotais) || centavosTotais < 0) {
    throw new Error(`Valor inválido para extenso: ${String(valor)}`);
  }
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  // "um milhão DE reais": milhão e bilhão redondos pedem a preposição.
  const redondoEmMilhoes = reais >= 1_000_000 && reais % 1_000_000 === 0;
  const textoReais =
    reais > 0
      ? `${numeroPorExtenso(reais)}${redondoEmMilhoes ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`
      : '';
  const textoCentavos =
    centavos > 0 ? `${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}` : '';

  if (textoReais && textoCentavos) return `${textoReais} e ${textoCentavos}`;
  return textoReais || textoCentavos || 'zero real';
}
