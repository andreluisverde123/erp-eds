import ExcelJS from 'exceljs';

import { isCanonicalUnit, MEASUREMENT_UNITS } from '../../common/units/measurement-units';
import { normalizeAscii } from '../reference/parsing/locations';
import { cellText, numberToDecimalString } from '../reference/parsing/xlsx-rows';
import { quantityProblem, unitCostProblem } from './budget-cost';

/// A planilha de importação de orçamento: o MODELO que o ERP entrega e a
/// leitura dele. Sem Prisma — só estrutura e valores.
///
/// ## O modelo
///
/// Uma aba "Orçamento", cabeçalho na linha 1, uma linha por grupo ou item:
///
/// | Código EAP | Tipo | Código de origem | Descrição | Unidade | Quantidade | Custo unitário |
///
/// - GRUPO: código EAP e descrição. O pai é o código sem o último trecho
///   ("1.2" é filho de "1").
/// - MANUAL: descrição, unidade, quantidade e custo.
/// - INSUMO: código do insumo próprio (MAT-0001), quantidade; custo opcional
///   (vazio = preço de referência vigente na data-base).
/// - COMPOSICAO: código da composição própria (COMP-0001) e quantidade. O
///   custo vem da composição na data-base.
/// - REFERENCIA: código na base escolhida na importação (SINAPI 104658) e
///   quantidade. O custo vem da base.
///
/// O código EAP da planilha só diz a ESTRUTURA. A numeração do orçamento
/// continua sendo a do ERP, pela ordem das linhas.

export const BUDGET_SHEET_NAME = 'Orçamento';
export const BUDGET_SHEET_HEADERS = [
  'Código EAP',
  'Tipo',
  'Código de origem',
  'Descrição',
  'Unidade',
  'Quantidade',
  'Custo unitário',
] as const;

export const BUDGET_SHEET_MAX_ROWS = 5000;

export type BudgetSheetRowType = 'GRUPO' | 'MANUAL' | 'INSUMO' | 'COMPOSICAO' | 'REFERENCIA';
const TIPOS: BudgetSheetRowType[] = ['GRUPO', 'MANUAL', 'INSUMO', 'COMPOSICAO', 'REFERENCIA'];

export interface BudgetSheetRow {
  /// Linha na planilha, como o Excel mostra.
  row: number;
  eapCode: string;
  parentCode: string | null;
  type: BudgetSheetRowType;
  originCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: string | null;
  unitCost: string | null;
}

export interface BudgetSheetIssue {
  row: number | null;
  message: string;
}

export interface ParsedBudgetSheet {
  rows: BudgetSheetRow[];
  errors: BudgetSheetIssue[];
  warnings: BudgetSheetIssue[];
}

/// Lê a planilha enviada. Planilha sem a aba ou fora do modelo vira ERRO, não
/// exceção.
export async function readBudgetSheet(buffer: Buffer): Promise<ParsedBudgetSheet> {
  const pasta = new ExcelJS.Workbook();
  try {
    await pasta.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { rows: [], errors: [{ row: null, message: 'O arquivo não é uma planilha .xlsx válida.' }], warnings: [] };
  }
  const aba = pasta.getWorksheet(BUDGET_SHEET_NAME) ?? pasta.worksheets[0];
  if (!aba) return { rows: [], errors: [{ row: null, message: 'A planilha está vazia.' }], warnings: [] };

  const matriz: unknown[][] = [];
  aba.eachRow({ includeEmpty: true }, (linha, numero) => {
    matriz[numero - 1] = ((linha.values as unknown[]) ?? []).slice(1);
  });
  return parseBudgetSheet(matriz);
}

/// A leitura propriamente dita, sobre uma matriz de células (linha 0 =
/// cabeçalho). Separada para ser testada sem gerar arquivo.
export function parseBudgetSheet(matriz: unknown[][]): ParsedBudgetSheet {
  const errors: BudgetSheetIssue[] = [];
  const warnings: BudgetSheetIssue[] = [];
  const rows: BudgetSheetRow[] = [];

  const cabecalho = (matriz[0] ?? []).map((celula) => normalizeAscii(cellText(celula)));
  const esperado = BUDGET_SHEET_HEADERS.map((titulo) => normalizeAscii(titulo));
  if (esperado.some((titulo, indice) => cabecalho[indice] !== titulo)) {
    errors.push({
      row: 1,
      message: `A planilha não segue o modelo de importação. A linha 1 deve ter as colunas: ${BUDGET_SHEET_HEADERS.join(', ')}. Baixe o modelo no ERP.`,
    });
    return { rows, errors, warnings };
  }

  const tipos = new Map<string, BudgetSheetRowType>();

  for (let indice = 1; indice < matriz.length; indice += 1) {
    const celulas = matriz[indice] ?? [];
    const texto = BUDGET_SHEET_HEADERS.map((_, coluna) => cellText(celulas[coluna]));
    if (texto.every((valor) => valor === '')) continue;

    const row = indice + 1;
    if (rows.length >= BUDGET_SHEET_MAX_ROWS) {
      errors.push({ row, message: `A planilha passa de ${BUDGET_SHEET_MAX_ROWS} linhas. Divida a importação.` });
      break;
    }

    const erro = (message: string) => errors.push({ row, message });
    const [eap, tipoTexto, origem, descricao, unidadeTexto] = texto;

    const eapCode = eap!.replace(/\s+/g, '');
    if (!/^\d+(\.\d+)*$/.test(eapCode) || eapCode.split('.').some((parte) => Number(parte) === 0)) {
      erro(`Código EAP "${eap}" inválido. Use números separados por ponto, a partir de 1 (1, 1.2, 1.2.3).`);
      continue;
    }

    const type = tipoTexto!
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toUpperCase() as BudgetSheetRowType;
    if (!TIPOS.includes(type)) {
      erro(`Tipo "${tipoTexto}" inválido. Use ${TIPOS.join(', ')}.`);
      continue;
    }

    if (tipos.has(eapCode)) {
      erro(`Código EAP ${eapCode} repetido.`);
      continue;
    }

    const partes = eapCode.split('.');
    const parentCode = partes.length > 1 ? partes.slice(0, -1).join('.') : null;
    if (parentCode !== null && tipos.get(parentCode) !== 'GRUPO') {
      erro(
        tipos.has(parentCode)
          ? `${eapCode}: o código ${parentCode} é um item, e item não tem filhos.`
          : `${eapCode}: o grupo ${parentCode} precisa vir numa linha ANTERIOR, com tipo GRUPO.`,
      );
      continue;
    }
    if (type !== 'GRUPO' && parentCode === null) {
      erro(`${eapCode}: item precisa estar dentro de um grupo (ex.: 1.1).`);
      continue;
    }

    const quantidade = decimalDaCelula(celulas[5]);
    const custo = decimalDaCelula(celulas[6]);
    const unidade = unidadeTexto ? unidadeTexto.toUpperCase() : null;

    const problemas: string[] = [];
    if (type === 'GRUPO') {
      if (!descricao) problemas.push('informe o nome do grupo na Descrição');
      if (origem || unidade || texto[5] || texto[6]) {
        problemas.push('grupo só tem Código EAP, Tipo e Descrição — deixe as demais colunas vazias');
      }
    } else {
      if (quantidade === undefined) problemas.push('quantidade inválida');
      else if (quantidade === null) problemas.push('informe a quantidade');
      else {
        const problema = quantityProblem(quantidade);
        if (problema) problemas.push(problema);
      }
      if (custo === undefined) problemas.push('custo unitário inválido');
      else if (custo !== null) {
        const problema = unitCostProblem(custo);
        if (problema) problemas.push(problema);
      }

      if (type === 'MANUAL') {
        if (!descricao) problemas.push('informe a descrição');
        if (!unidade) problemas.push('informe a unidade');
        else if (!isCanonicalUnit(unidade)) {
          problemas.push(`unidade "${unidadeTexto}" não existe; use ${MEASUREMENT_UNITS.map((u) => u.code).join(', ')}`);
        }
        if (custo === null) problemas.push('informe o custo unitário');
        if (origem) problemas.push('item manual não tem código de origem');
      } else {
        if (!origem) problemas.push('informe o código de origem');
        if ((type === 'COMPOSICAO' || type === 'REFERENCIA') && custo !== null && custo !== undefined) {
          problemas.push(
            type === 'COMPOSICAO'
              ? 'o custo de composição vem da composição na data-base; deixe o custo vazio'
              : 'o custo de item de base referencial vem da base; deixe o custo vazio',
          );
        }
        if (descricao || unidade) {
          warnings.push({ row, message: `${eapCode}: descrição e unidade vêm da origem; as da planilha serão ignoradas.` });
        }
      }
    }

    if (problemas.length > 0) {
      erro(`${eapCode}: ${problemas.join('; ')}.`);
      // Mesmo com erro, o código entra no mapa: os filhos de um grupo com erro
      // não viram uma segunda leva de erros enganosos.
      tipos.set(eapCode, type);
      continue;
    }

    tipos.set(eapCode, type);
    rows.push({
      row,
      eapCode,
      parentCode,
      type,
      originCode: type === 'GRUPO' || type === 'MANUAL' ? null : origem!.trim(),
      description: descricao || null,
      unit: type === 'MANUAL' ? unidade : null,
      quantity: type === 'GRUPO' ? null : (quantidade as string),
      unitCost: type === 'GRUPO' ? null : (custo ?? null),
    });
  }

  if (errors.length === 0 && !rows.some((linha) => linha.type !== 'GRUPO')) {
    errors.push({ row: null, message: 'A planilha não tem nenhum item para importar.' });
  }

  return { rows, errors, warnings };
}

/// Número da célula como texto decimal. `null` = vazia; `undefined` = não é
/// número.
///
/// Aceita número do Excel e texto nos dois formatos: "1234.5" e "1.234,5".
export function decimalDaCelula(celula: unknown): string | null | undefined {
  if (celula === null || celula === undefined || celula === '') return null;
  if (typeof celula === 'number') return Number.isFinite(celula) ? numberToDecimalString(celula) : undefined;
  if (typeof celula === 'object' && celula !== null && 'result' in celula) {
    return decimalDaCelula((celula as { result?: unknown }).result);
  }
  const texto = cellText(celula).replace(/\s|R\$/g, '');
  if (texto === '') return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto) || /^-?\d+,\d+$/.test(texto)) {
    return texto.replace(/\./g, '').replace(',', '.');
  }
  if (/^-?\d+(\.\d+)?$/.test(texto)) return texto;
  return undefined;
}

/// O modelo, gerado pelo ERP. Duas abas: a de preencher e as instruções.
export async function buildBudgetTemplate(): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook();
  const aba = pasta.addWorksheet(BUDGET_SHEET_NAME);
  aba.columns = [
    { header: BUDGET_SHEET_HEADERS[0], width: 12 },
    { header: BUDGET_SHEET_HEADERS[1], width: 14 },
    { header: BUDGET_SHEET_HEADERS[2], width: 18 },
    { header: BUDGET_SHEET_HEADERS[3], width: 50 },
    { header: BUDGET_SHEET_HEADERS[4], width: 10 },
    { header: BUDGET_SHEET_HEADERS[5], width: 14 },
    { header: BUDGET_SHEET_HEADERS[6], width: 16 },
  ];
  aba.getRow(1).font = { bold: true };
  aba.views = [{ state: 'frozen', ySplit: 1 }];
  const exemplos: (string | number | null)[][] = [
    ['1', 'GRUPO', null, 'Serviços preliminares', null, null, null],
    ['1.1', 'MANUAL', null, 'Placa de obra', 'M2', 6, 350],
    ['1.2', 'INSUMO', 'MAT-0001', null, null, 120, null],
    ['2', 'GRUPO', null, 'Alvenaria', null, null, null],
    ['2.1', 'COMPOSICAO', 'COMP-0001', null, null, 250.5, null],
    ['2.2', 'REFERENCIA', '104658', null, null, 42, null],
  ];
  exemplos.forEach((linha) => aba.addRow(linha));

  const instrucoes = pasta.addWorksheet('Instruções');
  instrucoes.getColumn(1).width = 110;
  [
    'Como preencher a aba "Orçamento"',
    '',
    'Uma linha por grupo ou item, na ordem em que devem aparecer. Não mude os títulos da linha 1.',
    'Código EAP: 1, 1.1, 1.1.2… O pai é o código sem o último trecho, e precisa ser um GRUPO em linha anterior.',
    'Tipo: GRUPO, MANUAL, INSUMO, COMPOSICAO ou REFERENCIA.',
    'GRUPO: só Código EAP, Tipo e Descrição.',
    'MANUAL: Descrição, Unidade, Quantidade e Custo unitário.',
    'INSUMO: Código de origem = código do insumo (ex.: MAT-0001) e Quantidade. Custo vazio usa o preço de referência vigente na data-base.',
    'COMPOSICAO: Código de origem = código da composição (ex.: COMP-0001) e Quantidade. O custo vem da composição na data-base.',
    'REFERENCIA: Código de origem = código na base SINAPI/SICRO escolhida na importação e Quantidade. O custo vem da base.',
    'Quantidade com até 4 casas, maior que zero. Custo unitário com até 4 casas, zero ou positivo.',
    `Unidades aceitas: ${MEASUREMENT_UNITS.map((u) => `${u.code} (${u.name})`).join(', ')}.`,
    'A importação só acontece se a planilha inteira estiver correta: nada é importado pela metade.',
    'Apague as linhas de exemplo antes de importar.',
  ].forEach((texto, indice) => {
    const linha = instrucoes.addRow([texto]);
    if (indice === 0) linha.font = { bold: true };
  });

  return Buffer.from(await pasta.xlsx.writeBuffer());
}
