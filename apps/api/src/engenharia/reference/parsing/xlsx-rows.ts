import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';

/// Leitura de XLSX em STREAMING, linha a linha.
///
/// As planilhas oficiais são grandes (o SINAPI mensal tem 13 MB e 66 mil linhas
/// só no analítico); carregar a pasta inteira em memória com `workbook.xlsx.load`
/// multiplicaria isso várias vezes. O leitor em streaming entrega cada aba em
/// ordem, e cada aba precisa ser consumida inteira antes da próxima.

export interface SheetRow {
  number: number;
  /// Indexado a partir de 1, como a planilha: `values[1]` é a coluna A.
  values: unknown[];
}

export type SheetHandler = (name: string, rows: AsyncIterable<SheetRow>) => Promise<void>;

export async function forEachSheet(buffer: Buffer, handler: SheetHandler): Promise<void> {
  if (!zipEntryNames(buffer)) throw new XlsxInvalidoError('O arquivo não é uma planilha .xlsx válida.');

  let entregouAba = false;
  try {
    await forEachSheetStreaming(buffer, async (nome, linhas) => {
      entregouAba = true;
      await handler(nome, linhas);
    });
  } catch (error) {
    // O leitor em streaming do exceljs depende da ORDEM das entradas do zip:
    // precisa de `workbook.xml` (nomes das abas) antes de entregar a primeira
    // aba. O Excel — e o que a CAIXA e o DNIT publicam — grava numa ordem que
    // funciona; uma planilha regravada por outra ferramenta pode não gravar, e
    // o leitor quebra ANTES de entregar qualquer aba. Só nesse caso a leitura
    // recomeça com a pasta inteira em memória, mais cara, mas indiferente à
    // ordem. Erro depois de alguma aba entregue é erro de verdade.
    if (entregouAba) throw error;
    await forEachSheetInMemory(buffer, handler);
  }
}

async function forEachSheetStreaming(buffer: Buffer, handler: SheetHandler): Promise<void> {
  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
    entries: 'emit',
  });

  for await (const aba of leitor as unknown as AsyncIterable<
    AsyncIterable<{ number: number; values: unknown[] }> & { name: string }
  >) {
    const linhas = (async function* () {
      for await (const linha of aba) yield { number: linha.number, values: linha.values ?? [] };
    })();

    let consumida = false;
    const rastreada = (async function* () {
      for await (const linha of linhas) yield linha;
      consumida = true;
    })();

    await handler(aba.name, rastreada);
    // O leitor exige a aba inteira consumida antes da próxima: quem não quis
    // as linhas não pode travar o arquivo.
    if (!consumida) for await (const _linha of rastreada) void _linha;
  }
}

export class XlsxInvalidoError extends Error {}

/// Nomes das entradas do zip na ordem em que estão gravadas, lidos do diretório
/// central (fim do arquivo) sem descompactar nada. Nulo quando não é zip.
export function zipEntryNames(buffer: Buffer): string[] | null {
  const FIM_DO_DIRETORIO = 0x06054b50;
  const ENTRADA_DO_DIRETORIO = 0x02014b50;
  if (buffer.length < 22) return null;
  const limite = Math.max(0, buffer.length - 22 - 0xffff);
  let fim = -1;
  for (let posicao = buffer.length - 22; posicao >= limite; posicao -= 1) {
    if (buffer.readUInt32LE(posicao) === FIM_DO_DIRETORIO) {
      fim = posicao;
      break;
    }
  }
  if (fim < 0) return null;

  const total = buffer.readUInt16LE(fim + 10);
  let posicao = buffer.readUInt32LE(fim + 16);
  const entradas: { nome: string; offset: number }[] = [];
  for (let indice = 0; indice < total; indice += 1) {
    if (posicao + 46 > buffer.length || buffer.readUInt32LE(posicao) !== ENTRADA_DO_DIRETORIO) return null;
    const tamanhoDoNome = buffer.readUInt16LE(posicao + 28);
    const tamanhoExtra = buffer.readUInt16LE(posicao + 30);
    const tamanhoComentario = buffer.readUInt16LE(posicao + 32);
    entradas.push({
      nome: buffer.toString('utf8', posicao + 46, posicao + 46 + tamanhoDoNome),
      offset: buffer.readUInt32LE(posicao + 42),
    });
    posicao += 46 + tamanhoDoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas.sort((a, b) => a.offset - b.offset).map((entrada) => entrada.nome);
}

async function forEachSheetInMemory(buffer: Buffer, handler: SheetHandler): Promise<void> {
  const pasta = new ExcelJS.Workbook();
  try {
    await pasta.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new XlsxInvalidoError('O arquivo não é uma planilha .xlsx válida.');
  }
  for (const aba of pasta.worksheets) {
    const linhas: SheetRow[] = [];
    aba.eachRow((linha, numero) => {
      linhas.push({ number: numero, values: (linha.values as unknown[]) ?? [] });
    });
    await handler(
      aba.name,
      (async function* () {
        yield* linhas;
      })(),
    );
  }
}

/// Texto de uma célula: string, número, rich text ou resultado de fórmula.
/// Espaços e quebras de linha colapsados.
export function cellText(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.replace(/\s+/g, ' ').trim();
  if (typeof valor === 'number') return numberToDecimalString(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    const celula = valor as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (Array.isArray(celula.richText)) {
      return celula.richText.map((parte) => parte.text).join('').replace(/\s+/g, ' ').trim();
    }
    if (celula.result !== undefined && celula.result !== null) return cellText(celula.result);
    if (typeof celula.text === 'string') return celula.text.trim();
  }
  return '';
}

/// Número de uma célula, ou nulo. Aceita número, texto numérico com ponto e
/// resultado numérico de fórmula.
export function cellNumber(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    return /^-?\d+(\.\d+)?$/.test(texto) ? Number(texto) : null;
  }
  if (valor && typeof valor === 'object' && 'result' in valor) {
    return cellNumber((valor as { result?: unknown }).result);
  }
  return null;
}

/// Decimal como TEXTO, ou nulo quando a célula está vazia ou não é número.
export function cellDecimal(valor: unknown): string | null {
  const numero = cellNumber(valor);
  return numero === null ? null : numberToDecimalString(numero);
}

/// O texto da fórmula, quando a célula é fórmula.
export function formulaText(valor: unknown): string | null {
  if (valor && typeof valor === 'object') {
    const celula = valor as { formula?: unknown; sharedFormula?: unknown };
    if (typeof celula.formula === 'string') return celula.formula;
    if (typeof celula.sharedFormula === 'string') return celula.sharedFormula;
  }
  return null;
}

/// `String(0.0000001)` é "1e-7". Aqui sai "0.0000001".
export function numberToDecimalString(numero: number): string {
  const texto = String(numero);
  if (!/e/i.test(texto)) return texto;
  return numero.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}
