import {
  competenceFromMonthName,
  normalizeAscii,
  UF_BY_STATE_NAME,
} from './locations';
import type {
  ImportIssue,
  ParsedReferenceComponent,
  ParsedReferenceComposition,
  ParsedReferenceDataset,
  ParsedReferenceItem,
} from './reference-types';
import { cellDecimal, cellText, forEachSheet, type SheetRow } from './xlsx-rows';

/// PARSER DO SICRO — relatórios por UF publicados pelo DNIT.
///
/// Formato suportado: o pacote trimestral por UF (`sp-04-2026.7z`), verificado
/// contra o arquivo real de SP 04/2026. O `.7z` não é aberto pelo servidor — isso
/// exigiria dependência nova —; importam-se os XLSX de dentro dele:
///
/// | Arquivo ("SP 04-2026 Relatório …") | Uso |
/// | --- | --- |
/// | Sintético de Composições de Custos | código, descrição, unidade, custo unitário |
/// | Analítico de Composições de Custos | composição analítica em blocos, seções A–F |
/// | Sintético de Materiais | preço de material |
/// | Sintético de Mão de Obra | custo horário/mensal de mão de obra |
/// | Sintético de Equipamentos | custo horário produtivo e improdutivo |
///
/// Os relatórios "com desoneração" existem só para mão de obra e equipamentos.
/// As composições do SICRO são publicadas com custos SEM desoneração — conferido
/// no arquivo real: o pedreiro P9821 custa R$ 32,4459/h no analítico, que é o
/// valor do relatório sem desoneração (com desoneração: R$ 30,5588). Por isso o
/// dataset do SICRO é sempre `NAO_DESONERADO`, e os arquivos com desoneração são
/// ignorados com aviso.
///
/// O bloco analítico real:
///
/// ```
/// SISTEMA DE CUSTOS REFERENCIAIS DE OBRAS - SICRO | … | São Paulo | … | FIC | 0,03143
/// Custo Unitário de Referência | … | Abril/2026 | … | Produção da equipe | 2 | dm³
/// 0307731 | Aparelho de apoio …
/// A - EQUIPAMENTOS   (quantidade, utilização operativa/improdutiva, custo produtivo/improdutivo, custo horário)
/// B - MÃO DE OBRA    (quantidade, unidade, custo horário, custo horário total)
/// C - MATERIAL       (quantidade, unidade, preço unitário, custo unitário)
/// D - ATIVIDADES AUXILIARES (composição, quantidade, unidade, custo unitário)
/// E - TEMPO FIXO     (item, composição de transporte, quantidade, unidade, custo)
/// F - MOMENTO DE TRANSPORTE (item, quantidade, tkm, composições de DMT LN/RP/P, FIT, custo)
/// … Custo unitário direto total | 170,38
/// ```
///
/// O "custo unitário direto total" publicado NÃO inclui o momento de transporte:
/// ele depende da distância média de cada obra, e o DNIT o publica em branco.

export type SicroFileKind = 'ANALYTIC' | 'SYNTHETIC' | 'MATERIALS' | 'LABOR' | 'EQUIPMENT';

export interface SicroInputFile {
  name: string;
  buffer: Buffer;
}

const TITULO_ANALITICO = 'SISTEMA DE CUSTOS REFERENCIAIS DE OBRAS - SICRO';

const OBRIGATORIOS: Record<SicroFileKind, string> = {
  SYNTHETIC: 'Relatório Sintético de Composições de Custos',
  ANALYTIC: 'Relatório Analítico de Composições de Custos',
  MATERIALS: 'Relatório Sintético de Materiais',
  LABOR: 'Relatório Sintético de Mão de Obra',
  EQUIPMENT: 'Relatório Sintético de Equipamentos',
};

const CABECALHOS: Partial<Record<SicroFileKind, [number, string][]>> = {
  SYNTHETIC: [[1, 'Código'], [2, 'Descrição do Serviço'], [3, 'Unidade'], [4, 'Custo Unitário (R$)']],
  MATERIALS: [[1, 'Código'], [2, 'Descrição'], [3, 'Unidade'], [4, 'Preço Unitário (R$)']],
  LABOR: [[1, 'Código'], [2, 'Descrição'], [3, 'Unidade'], [4, 'Custo (R$)']],
  EQUIPMENT: [[1, 'Código'], [2, 'Descrição'], [10, 'Custo Produtivo (R$/h)'], [11, 'Custo Improdutivo (R$/h)']],
};

const SECOES: Record<string, ParsedReferenceComponent['kind']> = {
  A: 'EQUIPMENT',
  B: 'LABOR',
  C: 'MATERIAL',
  D: 'AUXILIARY',
  E: 'FIXED_TIME',
  F: 'TRANSPORT',
};

const TOTAIS: [coluna: number, rotulo: string, chave: string][] = [
  [7, 'Custo horário total de equipamentos', 'equipmentHourlyCost'],
  [3, 'Custo horário total de mão de obra', 'laborHourlyCost'],
  [3, 'Custo horário total de execução', 'executionHourlyCost'],
  [3, 'Custo unitário de execução', 'executionUnitCost'],
  [7, 'Custo do FIC', 'ficCost'],
  [3, 'Custo unitário total de material', 'materialCost'],
  [3, 'Custo total de atividades auxiliares', 'auxiliaryCost'],
  [7, 'Subtotal', 'subtotal'],
  [3, 'Custo unitário total de tempo fixo', 'fixedTimeCost'],
  [3, 'Custo unitário total de transporte', 'transportCost'],
  [5, 'Custo unitário direto total', 'directUnitCost'],
];

/// Classifica o arquivo pelo NOME oficial ("SP 04-2026 Relatório Sintético de
/// Materiais.xlsx"). O conteúdo é conferido depois, pelo cabeçalho.
export function classifySicroFile(nome: string): {
  kind: SicroFileKind | null;
  withDesoneration: boolean;
  uf: string | null;
  competence: string | null;
} {
  const normalizado = normalizeAscii(nome);
  const prefixo = normalizado.match(/^([a-z]{2}) (\d{2})-(\d{4}) /);
  const withDesoneration = normalizado.includes('com desoneracao');
  const kind =
    (Object.entries(OBRIGATORIOS).find(([, rotulo]) => normalizado.includes(normalizeAscii(rotulo)))?.[0] as
      | SicroFileKind
      | undefined) ?? null;

  return {
    kind: normalizado.endsWith('.xlsx') ? kind : null,
    withDesoneration,
    uf: prefixo ? prefixo[1]!.toUpperCase() : null,
    competence: prefixo ? `${prefixo[3]}-${prefixo[2]}` : null,
  };
}

export async function parseSicroReports(arquivos: SicroInputFile[]): Promise<ParsedReferenceDataset> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const escolhidos = new Map<SicroFileKind, SicroInputFile>();
  const prefixos = new Set<string>();

  for (const arquivo of arquivos) {
    const classe = classifySicroFile(arquivo.name);
    if (!classe.kind) {
      warnings.push({ code: 'ARQUIVO_IGNORADO', message: `"${arquivo.name}" não é um dos relatórios usados na importação e foi ignorado.`, file: arquivo.name });
      continue;
    }
    if (classe.withDesoneration) {
      warnings.push({ code: 'ARQUIVO_COM_DESONERACAO_IGNORADO', message: `"${arquivo.name}" é a versão com desoneração. As composições do SICRO são publicadas sem desoneração; o arquivo foi ignorado.`, file: arquivo.name });
      continue;
    }
    if (escolhidos.has(classe.kind)) {
      errors.push({ code: 'ARQUIVO_REPETIDO', message: `Mais de um arquivo de ${OBRIGATORIOS[classe.kind]}.`, file: arquivo.name });
      continue;
    }
    escolhidos.set(classe.kind, arquivo);
    if (classe.uf && classe.competence) prefixos.add(`${classe.uf} ${classe.competence}`);
  }

  for (const [kind, rotulo] of Object.entries(OBRIGATORIOS) as [SicroFileKind, string][]) {
    if (!escolhidos.has(kind)) {
      errors.push({ code: 'ARQUIVO_AUSENTE', message: `Falta o arquivo "${rotulo}" (ex.: "SP 04-2026 ${rotulo}.xlsx").` });
    }
  }
  if (prefixos.size > 1) {
    errors.push({ code: 'ARQUIVOS_DE_REFERENCIAS_DIFERENTES', message: `Os arquivos são de UF ou competência diferentes: ${[...prefixos].join(', ')}.` });
  }

  const itens: ParsedReferenceItem[] = [];
  const sinteticas = new Map<string, { description: string; unit: string; unitCost: string | null }>();
  const composicoes: ParsedReferenceComposition[] = [];
  let estado: string | null = null;
  let competenciaAnalitico: string | null = null;

  const lerTabela = async (
    kind: SicroFileKind,
    arquivo: SicroInputFile,
    linha: (values: unknown[], numero: number) => void,
  ) => {
    let cabecalhoOk = false;
    await forEachSheet(arquivo.buffer, async (_nome, linhas) => {
      if (cabecalhoOk) return;
      for await (const { number, values } of linhas) {
        if (number === 1) {
          cabecalhoOk = (CABECALHOS[kind] ?? []).every(
            ([coluna, rotulo]) => normalizeAscii(cellText(values[coluna])) === normalizeAscii(rotulo),
          );
          if (!cabecalhoOk) {
            errors.push({ code: 'CABECALHO_INESPERADO', message: `"${arquivo.name}" não tem o cabeçalho do ${OBRIGATORIOS[kind]} do SICRO.`, file: arquivo.name, row: 1 });
            return;
          }
          continue;
        }
        if (!cellText(values[1])) continue;
        linha(values, number);
      }
    });
  };

  const sintetico = escolhidos.get('SYNTHETIC');
  if (sintetico) {
    await lerTabela('SYNTHETIC', sintetico, (values) => {
      sinteticas.set(cellText(values[1]), {
        description: cellText(values[2]),
        unit: cellText(values[3]),
        unitCost: cellDecimal(values[4]),
      });
    });
  }

  for (const [kind, categoria] of [['MATERIALS', 'MATERIAL'], ['LABOR', 'MÃO DE OBRA']] as const) {
    const arquivo = escolhidos.get(kind);
    if (!arquivo) continue;
    await lerTabela(kind, arquivo, (values) => {
      itens.push({
        code: cellText(values[1]),
        description: cellText(values[2]),
        unit: cellText(values[3]),
        category: categoria,
        unitPrice: cellDecimal(values[4]),
        metadata: {},
      });
    });
  }

  const equipamentos = escolhidos.get('EQUIPMENT');
  if (equipamentos) {
    await lerTabela('EQUIPMENT', equipamentos, (values) => {
      itens.push({
        code: cellText(values[1]),
        description: cellText(values[2]),
        // O relatório de equipamentos não tem coluna de unidade: os custos são
        // por hora (R$/h), produtivo e improdutivo.
        unit: 'h',
        category: 'EQUIPAMENTO',
        unitPrice: cellDecimal(values[10]),
        metadata: {
          acquisitionValue: cellDecimal(values[3]),
          depreciation: cellDecimal(values[4]),
          capitalOpportunity: cellDecimal(values[5]),
          insuranceAndTaxes: cellDecimal(values[6]),
          maintenance: cellDecimal(values[7]),
          operation: cellDecimal(values[8]),
          operatorLabor: cellDecimal(values[9]),
          productiveHourlyCost: cellDecimal(values[10]),
          unproductiveHourlyCost: cellDecimal(values[11]),
        },
      });
    });
  }

  // O relatório oficial de equipamentos repete algumas linhas idênticas (SP
  // 04/2026: 15 códigos, como A9335). Repetição idêntica fica uma vez, com
  // aviso; o mesmo código com dados diferentes é erro — não há como saber qual
  // vale.
  const porCodigo = new Map<string, ParsedReferenceItem>();
  const repetidos = new Set<string>();
  for (const item of itens) {
    const anterior = porCodigo.get(item.code);
    if (!anterior) {
      porCodigo.set(item.code, item);
    } else if (JSON.stringify(anterior) === JSON.stringify(item)) {
      repetidos.add(item.code);
    } else {
      errors.push({
        code: 'CODIGO_DUPLICADO',
        message: `O insumo ${item.code} aparece mais de uma vez com dados diferentes ("${anterior.description}" / "${item.description}").`,
      });
    }
  }
  if (repetidos.size > 0) {
    warnings.push({
      code: 'ITEM_REPETIDO_NO_RELATORIO',
      message: `${repetidos.size} insumo(s) aparecem repetidos, com dados idênticos, nos relatórios; cada um entra uma vez (ex.: ${[...repetidos].slice(0, 5).join(', ')}).`,
    });
  }
  itens.splice(0, itens.length, ...porCodigo.values());

  const analitico = escolhidos.get('ANALYTIC');
  if (analitico) {
    let atual: ParsedReferenceComposition | null = null;
    let secao: string | null = null;
    let esperandoCodigo = false;
    let formatoOk = false;

    const fechar = (numero: number) => {
      if (atual && atual.unitCost === null) {
        errors.push({ code: 'BLOCO_INCOMPLETO', message: `A composição ${atual.code} termina sem "Custo unitário direto total".`, file: analitico.name, row: numero });
      }
    };

    await forEachSheet(analitico.buffer, async (_nome, linhas) => {
      for await (const linha of linhas) {
        processar(linha);
      }
    });

    function processar({ number, values }: SheetRow) {
      const c1 = cellText(values[1]);

      if (c1 === TITULO_ANALITICO) {
        formatoOk = true;
        fechar(number);
        estado = cellText(values[4]) || estado;
        atual = {
          code: '',
          description: '',
          unit: '',
          group: null,
          unitCost: null,
          situation: null,
          metadata: { fic: cellDecimal(values[8]) },
          components: [],
        };
        composicoes.push(atual);
        secao = null;
        return;
      }
      if (!formatoOk) {
        if (number === 1) {
          errors.push({ code: 'CABECALHO_INESPERADO', message: `"${analitico!.name}" não é o relatório analítico de composições do SICRO.`, file: analitico!.name, row: 1 });
        }
        return;
      }
      const bloco = atual as ParsedReferenceComposition | null;
      if (!bloco) return;

      if (c1 === 'Custo Unitário de Referência') {
        competenciaAnalitico = cellText(values[4]) || competenciaAnalitico;
        bloco.metadata.teamProduction = cellDecimal(values[8]);
        bloco.metadata.productionUnit = cellText(values[9]) || null;
        esperandoCodigo = true;
        return;
      }
      if (esperandoCodigo) {
        bloco.code = c1;
        bloco.description = cellText(values[2]);
        esperandoCodigo = false;
        return;
      }

      const cabecalhoDeSecao = c1.match(/^([A-F]) - /);
      if (cabecalhoDeSecao) {
        secao = cabecalhoDeSecao[1]!;
        return;
      }

      for (const [coluna, rotulo, chave] of TOTAIS) {
        if (cellText(values[coluna]) === rotulo) {
          const valor = cellDecimal(values[9]);
          bloco.metadata[chave] = valor;
          if (chave === 'directUnitCost') {
            bloco.unitCost = valor;
            secao = null;
          }
          return;
        }
      }

      if (c1 === 'Obs.') {
        const texto = [2, 3, 4, 5].map((i) => cellText(values[i])).filter(Boolean).join(' ');
        if (texto) bloco.metadata.notes = texto;
        return;
      }

      if (!secao || !c1) return;
      const kind = SECOES[secao]!;
      const base = { position: bloco.components.length, section: secao, kind, code: c1, description: cellText(values[2]), situation: null };

      if (secao === 'A') {
        bloco.components.push({
          ...base,
          unit: 'h',
          coefficient: cellDecimal(values[3]),
          unitPrice: cellDecimal(values[6]),
          totalCost: cellDecimal(values[9]),
          metadata: { operativeUse: cellDecimal(values[4]), unproductiveUse: cellDecimal(values[5]), productiveHourlyCost: cellDecimal(values[6]), unproductiveHourlyCost: cellDecimal(values[7]) },
        });
      } else if (secao === 'B' || secao === 'C' || secao === 'D') {
        bloco.components.push({
          ...base,
          unit: cellText(values[4]) || null,
          coefficient: cellDecimal(values[3]),
          unitPrice: cellDecimal(values[6]),
          totalCost: cellDecimal(values[9]),
          metadata: {},
        });
      } else if (secao === 'E') {
        bloco.components.push({
          ...base,
          unit: cellText(values[5]) || null,
          coefficient: cellDecimal(values[4]),
          unitPrice: cellDecimal(values[7]),
          totalCost: cellDecimal(values[9]),
          metadata: { transportComposition: cellText(values[3]) || null },
        });
      } else if (secao === 'F') {
        bloco.components.push({
          ...base,
          unit: cellText(values[4]) || null,
          coefficient: cellDecimal(values[3]),
          unitPrice: null,
          totalCost: cellDecimal(values[9]),
          metadata: {
            dmtCompositions: { LN: cellText(values[5]) || null, RP: cellText(values[6]) || null, P: cellText(values[7]) || null },
            fit: cellDecimal(values[8]),
          },
        });
      }
    }

    fechar(Number.MAX_SAFE_INTEGER);
    if (!formatoOk && !errors.some((e) => e.file === analitico.name)) {
      errors.push({ code: 'CABECALHO_INESPERADO', message: `"${analitico.name}" não é o relatório analítico de composições do SICRO.`, file: analitico.name });
    }
  }

  // Sintético × analítico: descrição/unidade vêm do sintético; o custo é o do
  // analítico, conferido contra o sintético.
  const semSintetico: string[] = [];
  const divergentes: string[] = [];
  for (const composicao of composicoes) {
    const linha = sinteticas.get(composicao.code);
    if (!linha) {
      semSintetico.push(composicao.code);
      composicao.unit = String(composicao.metadata.productionUnit ?? '');
      continue;
    }
    composicao.description = linha.description || composicao.description;
    composicao.unit = linha.unit;
    if (linha.unitCost !== null && composicao.unitCost !== null && Math.abs(Number(linha.unitCost) - Number(composicao.unitCost)) > 0.01) {
      divergentes.push(composicao.code);
    }
  }
  const analiticos = new Set(composicoes.map((c) => c.code));
  const soSintetico = [...sinteticas.keys()].filter((codigo) => !analiticos.has(codigo));

  const exemplos = (codigos: string[]) => codigos.slice(0, 5).join(', ');
  if (semSintetico.length) warnings.push({ code: 'COMPOSICAO_SO_NO_ANALITICO', message: `${semSintetico.length} composição(ões) só no analítico (ex.: ${exemplos(semSintetico)}).` });
  if (soSintetico.length) warnings.push({ code: 'COMPOSICAO_SO_NO_SINTETICO', message: `${soSintetico.length} composição(ões) só no sintético, sem analítico; não foram importadas (ex.: ${exemplos(soSintetico)}).` });
  if (divergentes.length) warnings.push({ code: 'CUSTO_SINTETICO_DIVERGENTE', message: `${divergentes.length} composição(ões) com custo diferente entre sintético e analítico (ex.: ${exemplos(divergentes)}). Vale o analítico.` });

  const uf = estado ? (UF_BY_STATE_NAME[normalizeAscii(estado)] ?? null) : null;
  const competence = competenciaAnalitico ? competenceFromMonthName(competenciaAnalitico) : null;
  if (analitico && !uf) errors.push({ code: 'UF_INVALIDA', message: `Não foi possível identificar a UF "${estado ?? ''}" no analítico.` });
  if (analitico && !competence) errors.push({ code: 'COMPETENCIA_INVALIDA', message: `Não foi possível ler a competência "${competenciaAnalitico ?? ''}" no analítico.` });
  const prefixo = [...prefixos][0];
  if (uf && competence && prefixo && prefixo !== `${uf} ${competence}`) {
    errors.push({ code: 'NOME_DIVERGE_DO_CONTEUDO', message: `Os nomes dos arquivos dizem ${prefixo}, mas o analítico é de ${uf} ${competence}.` });
  }

  return {
    source: 'SICRO',
    competence,
    uf,
    locality: estado,
    regime: 'NAO_DESONERADO',
    publishedAt: null,
    metadata: {
      files: [...escolhidos.values()].map((arquivo) => arquivo.name),
      transportNotIncluded: true,
    },
    items: itens,
    compositions: composicoes,
    errors,
    warnings,
  };
}
