/// Leitura da linha digitável e do código de barras de um boleto.
///
/// Camada PURA — sem Prisma, sem I/O, sem dependência externa. É o núcleo do
/// módulo, e é ela que torna a etapa possível sem IA: **a linha digitável é
/// autossuficiente**. Os 47 dígitos já carregam banco, valor e vencimento, e
/// os dígitos verificadores permitem RECUSAR uma leitura errada em vez de
/// aceitá-la calada.
///
/// Isso importa mais do que parece: extrair texto de PDF pode truncar ou
/// embaralhar caracteres. Sem os DVs, um dígito perdido viraria um valor
/// errado gravado como se fosse o do documento. Com eles, o erro é detectado e
/// o fluxo cai na digitação manual — que existe justamente para isso.

/// Layout do CÓDIGO DE BARRAS (44 dígitos), FEBRABAN:
///
/// ```
///  1-3   banco
///  4     moeda (9 = real)
///  5     DV geral (módulo 11)
///  6-9   fator de vencimento
/// 10-19  valor (10 dígitos, 2 decimais)
/// 20-44  campo livre (25, definido por cada banco)
/// ```
///
/// A LINHA DIGITÁVEL (47 dígitos) é o mesmo conteúdo reagrupado em cinco
/// campos, com um DV módulo 10 por campo — os três primeiros são pedaços do
/// campo livre, e o vencimento e o valor migram para o fim.
export const BARCODE_LENGTH = 44;
export const DIGITABLE_LINE_LENGTH = 47;

/// Boleto de arrecadação (concessionária, tributo, FGTS) — 48 dígitos, começa
/// com 8. Layout DIFERENTE: não tem fator de vencimento, o valor fica em outra
/// posição e o DV pode ser módulo 10 ou 11 conforme o terceiro dígito.
/// Reconhecido para poder ser RECUSADO com uma mensagem que explica o que é,
/// em vez de falhar como "linha inválida".
const COLLECTION_SLIP_LENGTH = 48;

/// Fator de vencimento: 1000 = 03/07/2000, +1 por dia.
///
/// A data-base é 03/07/2000 — é ela que faz o fator 9999 cair em 21/02/2025,
/// a virada que a FEBRABAN documentou. (07/10/1997 é uma data que circula
/// bastante em texto sobre boleto e NÃO é esta: com ela o 9999 cairia em
/// 2022, e todo vencimento sairia quase três anos errado.)
///
/// O contador estourou em 21/02/2025 e REINICIOU em 1000 no dia seguinte. Um
/// mesmo fator passa a ter duas datas possíveis, uma em cada ciclo — a
/// desambiguação está em `dueDateFromFactor`.
const CYCLE_STARTS = [Date.UTC(2000, 6, 3), Date.UTC(2025, 1, 22)];
const FIRST_FACTOR = 1000;
const MS_PER_DAY = 86_400_000;

export interface ParsedBoleto {
  /// Sempre 47 dígitos, sem máscara.
  digitableLine: string;
  /// Sempre 44 dígitos, derivado da linha (nunca informado por fora).
  barcode: string;
  bankCode: string;
  /// `null` quando o fator é 0000 — boleto emitido sem vencimento (aceito
  /// pela FEBRABAN; quem recebe define a data).
  dueDate: Date | null;
  /// `null` quando o valor é zero — boleto "sem valor", em que a quantia é
  /// preenchida no pagamento. NÃO é o mesmo que valor não identificado.
  amount: number | null;
}

export type BoletoParseError =
  'EMPTY' | 'COLLECTION_SLIP' | 'WRONG_LENGTH' | 'CHECK_DIGIT' | 'UNKNOWN_CURRENCY';

export type BoletoParseResult =
  { ok: true; boleto: ParsedBoleto } | { ok: false; error: BoletoParseError; message: string };

/// Tira máscara, espaço e pontuação. Não altera o valor da informação — só
/// remove a formatação com que o dado é escrito.
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/// Ponto de entrada: aceita linha digitável (47) ou código de barras (44), com
/// ou sem máscara, e devolve sempre a mesma estrutura.
export function parseBoleto(input: string): BoletoParseResult {
  const digits = onlyDigits(input ?? '');

  if (digits.length === 0) {
    return fail('EMPTY', 'Informe a linha digitável do boleto.');
  }

  if (digits.length === COLLECTION_SLIP_LENGTH || digits.startsWith('8')) {
    return fail(
      'COLLECTION_SLIP',
      'Isto é um boleto de arrecadação (concessionária, tributo ou FGTS). ' +
        'Esta versão lê apenas boleto bancário de cobrança.',
    );
  }

  if (digits.length === BARCODE_LENGTH) {
    return fromBarcode(digits);
  }

  if (digits.length === DIGITABLE_LINE_LENGTH) {
    return fromDigitableLine(digits);
  }

  return fail(
    'WRONG_LENGTH',
    `A linha digitável tem 47 dígitos e o código de barras 44 — recebi ${digits.length}.`,
  );
}

function fromDigitableLine(line: string): BoletoParseResult {
  // Os três primeiros campos têm DV módulo 10 próprio. Conferi-los antes de
  // qualquer outra coisa é o que pega o dígito trocado na digitação.
  const fields: [string, string][] = [
    [line.slice(0, 9), line[9]!],
    [line.slice(10, 20), line[20]!],
    [line.slice(21, 31), line[31]!],
  ];

  for (const [index, [block, checkDigit]] of fields.entries()) {
    if (mod10(block) !== Number(checkDigit)) {
      return fail(
        'CHECK_DIGIT',
        `A linha digitável não confere no ${index + 1}º campo. Confira os dígitos.`,
      );
    }
  }

  return fromBarcode(barcodeFromDigitableLine(line));
}

/// Reagrupa a linha digitável no código de barras. Nenhum dígito é inventado
/// ou descartado: os 44 saem inteiros dos 47, só que em outra ordem.
export function barcodeFromDigitableLine(line: string): string {
  const freeField = line.slice(4, 9) + line.slice(10, 20) + line.slice(21, 31);

  return (
    line.slice(0, 4) + // banco + moeda
    line[32] + // DV geral
    line.slice(33, 47) + // fator de vencimento + valor
    freeField
  );
}

function fromBarcode(barcode: string): BoletoParseResult {
  const currency = barcode[3]!;
  if (currency !== '9') {
    return fail('UNKNOWN_CURRENCY', 'Boleto em moeda não reconhecida (o código de moeda não é 9).');
  }

  // DV geral, módulo 11 sobre os 43 dígitos restantes. É a conferência do
  // documento INTEIRO — os DVs de campo só cobrem um pedaço cada.
  const withoutCheckDigit = barcode.slice(0, 4) + barcode.slice(5);
  if (mod11(withoutCheckDigit) !== Number(barcode[4])) {
    return fail(
      'CHECK_DIGIT',
      'O dígito verificador geral do boleto não confere. O documento pode ter sido lido errado.',
    );
  }

  const factor = Number(barcode.slice(5, 9));
  const rawAmount = Number(barcode.slice(9, 19));

  return {
    ok: true,
    boleto: {
      digitableLine: digitableLineFromBarcode(barcode),
      barcode,
      bankCode: barcode.slice(0, 3),
      dueDate: dueDateFromFactor(factor),
      // Boleto "sem valor" (zerado) é diferente de valor não identificado: o
      // documento diz explicitamente que a quantia é definida no pagamento.
      amount: rawAmount === 0 ? null : rawAmount / 100,
    },
  };
}

/// Caminho inverso, usado quando a leitura veio do código de barras: a tela
/// mostra a linha digitável, que é o que uma pessoa reconhece e confere.
export function digitableLineFromBarcode(barcode: string): string {
  const freeField = barcode.slice(19);

  const field1 = barcode.slice(0, 4) + freeField.slice(0, 5);
  const field2 = freeField.slice(5, 15);
  const field3 = freeField.slice(15, 25);

  return (
    field1 +
    mod10(field1) +
    field2 +
    mod10(field2) +
    field3 +
    mod10(field3) +
    barcode[4] +
    barcode.slice(5, 19)
  );
}

/// Fator de vencimento -> data.
///
/// O fator 0000 significa "sem vencimento" e devolve `null` — não é erro.
///
/// Para os demais há DUAS datas possíveis, uma por ciclo (ver `CYCLE_STARTS`).
/// A desambiguação é pela proximidade da data de referência: um boleto existe
/// para ser pago perto de hoje, então a candidata a décadas de distância nunca
/// é a certa. `reference` é parâmetro para o teste não depender do relógio.
export function dueDateFromFactor(factor: number, reference: Date = new Date()): Date | null {
  if (factor === 0) return null;

  const candidates = CYCLE_STARTS.map(
    (start) => new Date(start + (factor - FIRST_FACTOR) * MS_PER_DAY),
  );

  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate.getTime() - reference.getTime()) <
    Math.abs(closest.getTime() - reference.getTime())
      ? candidate
      : closest,
  );
}

/// Módulo 10: pesos 2 e 1 alternados da direita para a esquerda, somando os
/// DÍGITOS do produto (12 soma 1+2, não 12).
export function mod10(block: string): number {
  let sum = 0;
  let weight = 2;

  for (let i = block.length - 1; i >= 0; i -= 1) {
    const product = Number(block[i]) * weight;
    sum += product > 9 ? product - 9 : product;
    weight = weight === 2 ? 1 : 2;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/// Módulo 11 do DV geral: pesos de 2 a 9 ciclando da direita para a esquerda.
/// Resultado 0, 10 ou 11 vira 1, por definição da FEBRABAN.
export function mod11(block: string): number {
  let sum = 0;
  let weight = 2;

  for (let i = block.length - 1; i >= 0; i -= 1) {
    sum += Number(block[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const checkDigit = 11 - (sum % 11);
  return checkDigit === 0 || checkDigit > 9 ? 1 : checkDigit;
}

function fail(error: BoletoParseError, message: string): BoletoParseResult {
  return { ok: false, error, message };
}
