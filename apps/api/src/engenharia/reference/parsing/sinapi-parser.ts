import { Prisma } from '../../../../generated/prisma/client';
import {
  competenceFromMonthYear,
  isoDateFromBrazilian,
  normalizeAscii,
} from './locations';
import type {
  ImportIssue,
  ParsedReferenceComposition,
  ParsedReferenceDataset,
  ParsedReferenceItem,
  ReferenceRegimeCode,
} from './reference-types';
import { cellDecimal, cellNumber, cellText, forEachSheet, formulaText, type SheetRow } from './xlsx-rows';

/// PARSER DO SINAPI — pasta "SINAPI_Referência_AAAA_MM.xlsx".
///
/// Formato suportado: o relatório mensal publicado pela CAIXA a partir de 2025
/// no pacote `SINAPI-AAAA-MM-formato-xlsx.zip`, verificado contra o arquivo real
/// de 08/2026. Uma pasta traz as 27 UF e os três regimes:
///
/// | Aba | Conteúdo |
/// | --- | --- |
/// | ISD / ICD / ISE | preço de insumo sem desoneração / com desoneração / sem encargos, uma coluna por UF |
/// | CSD / CCD / CSE | custo de composição nos mesmos três regimes, par (custo, %AS) por UF |
/// | Analítico | estrutura das composições: item, tipo (INSUMO/COMPOSICAO), coeficiente, situação |
///
/// Detalhes do arquivo real que este parser respeita:
///
/// - Cabeçalho de dados na linha 10; mês de referência na linha 3 ("08/2026");
///   data de emissão na linha 4; sigla das UF na linha 4 (insumos, a partir da
///   coluna F) ou 9 (composições, a partir da E, de duas em duas).
/// - O código da composição nas abas de custo é uma fórmula `HYPERLINK(...,
///   104658)` SEM valor calculado gravado. O código sai do último argumento.
/// - Preço em branco numa UF = não houve coleta. Vira preço nulo, nunca zero.
/// - O Analítico não tem preço. A contribuição de cada linha é calculada como a
///   própria planilha da CAIXA calcula na aba "Analítico com Custo":
///   `TRUNC(coeficiente × preço; 2)`, com o preço da UF e do regime escolhidos.
/// - Composição "SEM CUSTO" aparece com custo 0 nas abas de custo; aqui ela fica
///   com custo NULO.
///
/// Um dataset = uma UF + um regime. A pasta é lida uma vez por regime e cada UF
/// é montada dela (`readSinapiWorkbook`).

export const SINAPI_SHEETS: Record<ReferenceRegimeCode, { items: string; compositions: string }> = {
  NAO_DESONERADO: { items: 'ISD', compositions: 'CSD' },
  DESONERADO: { items: 'ICD', compositions: 'CCD' },
  SEM_ENCARGOS: { items: 'ISE', compositions: 'CSE' },
};

const ANALITICO = 'Analítico';
const LINHA_CABECALHO = 10;

const CABECALHO_INSUMOS = ['Classificação', 'Código do Insumo', 'Descrição do Insumo', 'Unidade', 'Origem de Preço'];
const CABECALHO_COMPOSICOES = ['Grupo', 'Código da Composição', 'Descrição', 'Unidade'];
const CABECALHO_ANALITICO = [
  'Grupo',
  'Código da Composição',
  'Tipo Item',
  'Código do Item',
  'Descrição',
  'Unidade',
  'Coeficiente',
  'Situação',
];

const SEM_CUSTO = 'SEM CUSTO';
const MAX_EXEMPLOS = 5;

export interface SinapiParseOptions {
  uf: string;
  regime: ReferenceRegimeCode;
}

/// Uma UF + um regime.
export async function parseSinapiReference(
  buffer: Buffer,
  options: SinapiParseOptions,
): Promise<ParsedReferenceDataset> {
  const pasta = await readSinapiWorkbook(buffer, options.regime);
  return pasta.dataset(options.uf);
}

/// A pasta lida UMA vez para o regime; `dataset(uf)` monta cada UF a partir
/// dela. É o que permite carregar as 27 UFs sem ler o arquivo 27 vezes — a
/// carga das bases (`loader/`) monta uma UF, grava, e passa para a próxima.
export interface SinapiWorkbook {
  regime: ReferenceRegimeCode;
  availableUfs: string[];
  dataset(uf: string): ParsedReferenceDataset;
}

interface InsumoDaPasta {
  code: string;
  description: string;
  unit: string;
  category: string | null;
  priceOrigin: string | null;
}

export async function readSinapiWorkbook(buffer: Buffer, regime: ReferenceRegimeCode): Promise<SinapiWorkbook> {
  const abas = SINAPI_SHEETS[regime];
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const competencias = new Map<string, string>();
  const lidas = new Set<string>();
  let emissao: string | null = null;
  /// UF → coluna, e UF → localidade, na aba de insumos.
  const colunasDeInsumo = new Map<string, number>();
  const localidades = new Map<string, string>();
  /// UF → coluna do custo (o %AS é a seguinte), na aba de composições.
  const colunasDeCusto = new Map<string, number>();
  const insumos = new Map<string, InsumoDaPasta>();
  /// Código do insumo → valores da linha inteira (preço de cada UF sai daqui).
  const linhasDeInsumo = new Map<string, unknown[]>();
  const linhasDeCusto = new Map<string, unknown[]>();
  const composicoes: ParsedReferenceComposition[] = [];
  let duplicadas = 0;

  const conferirCabecalho = (aba: string, linha: SheetRow, esperado: string[]) => {
    const recebido = esperado.map((_, i) => normalizeAscii(cellText(linha.values[i + 1])));
    const ok = esperado.every((rotulo, i) => recebido[i] === normalizeAscii(rotulo));
    if (!ok) {
      errors.push({
        code: 'CABECALHO_INESPERADO',
        message: `O cabeçalho da aba ${aba} (linha ${linha.number}) não é o do SINAPI suportado. Esperado: ${esperado.join(' | ')}.`,
        sheet: aba,
        row: linha.number,
      });
    }
    return ok;
  };

  const siglasDaLinha = (values: unknown[], inicio: number, passo: number) => {
    const achadas = new Map<string, number>();
    for (let coluna = inicio; coluna < values.length; coluna += passo) {
      const sigla = cellText(values[coluna]);
      if (/^[A-Z]{2}$/.test(sigla)) achadas.set(sigla, coluna);
    }
    return achadas;
  };

  const lerInsumos = async (aba: string, linhas: AsyncIterable<SheetRow>) => {
    let cabecalhoOk = false;
    for await (const linha of linhas) {
      const { number, values } = linha;
      if (number === 2) {
        if (!normalizeAscii(cellText(values[1])).includes('relatorio de precos de insumos')) {
          errors.push({ code: 'ABA_INESPERADA', message: `A aba ${aba} não é o relatório de preços de insumos do SINAPI.`, sheet: aba, row: number });
        }
      } else if (number === 3) {
        competencias.set(aba, cellText(values[2]));
      } else if (number === 4) {
        emissao = cellText(values[2]) || emissao;
        for (const [sigla, coluna] of siglasDaLinha(values, 6, 1)) colunasDeInsumo.set(sigla, coluna);
      } else if (number === 5) {
        for (const [sigla, coluna] of colunasDeInsumo) {
          const localidade = cellText(values[coluna]);
          if (localidade) localidades.set(sigla, localidade);
        }
      } else if (number === LINHA_CABECALHO) {
        cabecalhoOk = conferirCabecalho(aba, linha, CABECALHO_INSUMOS);
        // A aba ISE (sem encargos) não tem as linhas 4 e 5 com UF e localidade:
        // as siglas das UFs só aparecem aqui, no cabeçalho das colunas de preço.
        if (colunasDeInsumo.size === 0) {
          for (const [sigla, coluna] of siglasDaLinha(values, 6, 1)) colunasDeInsumo.set(sigla, coluna);
        }
      } else if (number > LINHA_CABECALHO && cabecalhoOk) {
        const codigo = cellNumber(values[2]);
        if (codigo === null) continue;
        const code = String(codigo);
        if (insumos.has(code)) duplicadas++;
        insumos.set(code, {
          code,
          description: cellText(values[3]),
          unit: cellText(values[4]),
          category: cellText(values[1]) || null,
          priceOrigin: cellText(values[5]) || null,
        });
        linhasDeInsumo.set(code, values);
      }
    }
  };

  const lerCustos = async (aba: string, linhas: AsyncIterable<SheetRow>) => {
    let cabecalhoOk = false;
    for await (const linha of linhas) {
      const { number, values } = linha;
      if (number === 2) {
        if (!normalizeAscii(cellText(values[1])).includes('relatorio de custos de composicoes')) {
          errors.push({ code: 'ABA_INESPERADA', message: `A aba ${aba} não é o relatório de custos de composições do SINAPI.`, sheet: aba, row: number });
        }
      } else if (number === 3) {
        competencias.set(aba, cellText(values[2]));
      } else if (number === 9) {
        for (const [sigla, coluna] of siglasDaLinha(values, 5, 2)) colunasDeCusto.set(sigla, coluna);
      } else if (number === LINHA_CABECALHO) {
        cabecalhoOk = conferirCabecalho(aba, linha, CABECALHO_COMPOSICOES);
      } else if (number > LINHA_CABECALHO && cabecalhoOk) {
        const code = codigoDaComposicao(values[2]);
        if (!code) continue;
        linhasDeCusto.set(code, values);
      }
    }
  };

  const lerAnalitico = async (aba: string, linhas: AsyncIterable<SheetRow>) => {
    let atual: ParsedReferenceComposition | null = null;
    let cabecalhoOk = false;
    for await (const linha of linhas) {
      const { number, values } = linha;
      if (number === 3) {
        competencias.set(aba, cellText(values[2]));
      } else if (number === LINHA_CABECALHO) {
        cabecalhoOk = conferirCabecalho(aba, linha, CABECALHO_ANALITICO);
      } else if (number > LINHA_CABECALHO && cabecalhoOk) {
        const codigoComposicao = cellNumber(values[2]);
        if (codigoComposicao === null) continue;
        const tipo = normalizeAscii(cellText(values[3]));

        if (!tipo) {
          atual = {
            code: String(codigoComposicao),
            description: cellText(values[5]),
            unit: cellText(values[6]),
            group: cellText(values[1]) || null,
            unitCost: null,
            situation: cellText(values[8]) || null,
            metadata: {},
            components: [],
          };
          composicoes.push(atual);
          continue;
        }

        if (!atual || atual.code !== String(codigoComposicao)) {
          errors.push({ code: 'ITEM_FORA_DE_COMPOSICAO', message: `Linha analítica da composição ${codigoComposicao} fora do bloco dela.`, sheet: aba, row: number });
          continue;
        }
        if (tipo !== 'insumo' && tipo !== 'composicao') {
          errors.push({ code: 'TIPO_DE_ITEM', message: `Tipo de item "${cellText(values[3])}" desconhecido.`, sheet: aba, row: number });
          continue;
        }

        atual.components.push({
          position: atual.components.length,
          section: null,
          kind: tipo === 'insumo' ? 'INPUT' : 'COMPOSITION',
          code: cellText(values[4]),
          description: cellText(values[5]),
          unit: cellText(values[6]) || null,
          coefficient: cellDecimal(values[7]),
          unitPrice: null,
          totalCost: null,
          situation: cellText(values[8]) || null,
          metadata: {},
        });
      }
    }
  };

  await forEachSheet(buffer, async (nome, linhas) => {
    if (nome === abas.items) {
      lidas.add(nome);
      await lerInsumos(nome, linhas);
    } else if (nome === abas.compositions) {
      lidas.add(nome);
      await lerCustos(nome, linhas);
    } else if (nome === ANALITICO) {
      lidas.add(nome);
      await lerAnalitico(nome, linhas);
    }
  });

  for (const aba of [abas.items, abas.compositions, ANALITICO]) {
    if (!lidas.has(aba)) {
      errors.push({ code: 'ABA_AUSENTE', message: `A aba "${aba}" não está no arquivo. Envie a pasta "SINAPI_Referência_AAAA_MM.xlsx" do pacote mensal da CAIXA.`, sheet: aba });
    }
  }

  const valoresDeCompetencia = [...new Set(competencias.values())];
  if (valoresDeCompetencia.length > 1) {
    errors.push({ code: 'COMPETENCIA_DIVERGENTE', message: `As abas trazem meses de referência diferentes: ${valoresDeCompetencia.join(', ')}.` });
  }
  const competence = valoresDeCompetencia.length === 1 ? competenceFromMonthYear(valoresDeCompetencia[0]!) : null;
  if (lidas.size > 0 && !competence && valoresDeCompetencia.length <= 1) {
    errors.push({ code: 'COMPETENCIA_INVALIDA', message: 'Não foi possível ler o mês de referência (linha 3).' });
  }
  if (duplicadas > 0) {
    warnings.push({ code: 'INSUMO_DUPLICADO', message: `${duplicadas} código(s) de insumo aparecem mais de uma vez; vale a última linha.` });
  }

  const situacaoPorCodigo = new Map(composicoes.map((c) => [c.code, c.situation]));
  const exemplos = (codigos: string[]) => [...new Set(codigos)].slice(0, MAX_EXEMPLOS).join(', ');

  const dataset = (ufPedida: string): ParsedReferenceDataset => {
    const uf = ufPedida.trim().toUpperCase();
    const errosDaUf = [...errors];
    const avisosDaUf = [...warnings];
    const colunaInsumo = colunasDeInsumo.get(uf);
    const colunaCusto = colunasDeCusto.get(uf);
    if (lidas.has(abas.items) && colunaInsumo === undefined) {
      errosDaUf.push({ code: 'UF_AUSENTE', message: `A UF ${uf} não aparece no relatório ${abas.items}.`, sheet: abas.items });
    }
    if (lidas.has(abas.compositions) && colunaCusto === undefined) {
      errosDaUf.push({ code: 'UF_AUSENTE', message: `A UF ${uf} não aparece no relatório ${abas.compositions}.`, sheet: abas.compositions });
    }

    const precos = new Map<string, string | null>();
    const items: ParsedReferenceItem[] = [];
    if (colunaInsumo !== undefined) {
      for (const insumo of insumos.values()) {
        const unitPrice = cellDecimal(linhasDeInsumo.get(insumo.code)![colunaInsumo]);
        precos.set(insumo.code, unitPrice);
        items.push({
          code: insumo.code,
          description: insumo.description,
          unit: insumo.unit,
          category: insumo.category,
          unitPrice,
          metadata: { priceOrigin: insumo.priceOrigin },
        });
      }
    }
    const custoDe = (codigo: string) => {
      const valores = colunaCusto === undefined ? undefined : linhasDeCusto.get(codigo);
      return valores ? { custo: cellDecimal(valores[colunaCusto!]), percentualAS: cellDecimal(valores[colunaCusto! + 1]) } : undefined;
    };

    const semRelatorio: string[] = [];
    const referenciasAusentes: string[] = [];
    const divergentes: string[] = [];
    const compositions: ParsedReferenceComposition[] = composicoes.map((modelo) => {
      const custo = custoDe(modelo.code);
      if (!custo) semRelatorio.push(modelo.code);
      let soma = new Prisma.Decimal(0);
      let somaCompleta = true;
      const components = modelo.components.map((componente) => {
        let preco: string | null;
        if (componente.kind === 'INPUT') {
          if (!insumos.has(componente.code)) referenciasAusentes.push(componente.code);
          preco = precos.get(componente.code) ?? null;
        } else {
          if (!situacaoPorCodigo.has(componente.code)) referenciasAusentes.push(componente.code);
          preco = situacaoPorCodigo.get(componente.code) === SEM_CUSTO ? null : (custoDe(componente.code)?.custo ?? null);
        }
        const totalCost =
          preco !== null && componente.coefficient !== null
            ? new Prisma.Decimal(componente.coefficient).times(preco).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN).toString()
            : null;
        if (totalCost === null) somaCompleta = false;
        else soma = soma.plus(totalCost);
        return { ...componente, unitPrice: preco, totalCost };
      });
      const unitCost = modelo.situation === SEM_CUSTO ? null : (custo?.custo ?? null);
      if (unitCost !== null && somaCompleta && soma.minus(unitCost).abs().greaterThan('0.05')) divergentes.push(modelo.code);
      return { ...modelo, unitCost, metadata: { percentAS: custo?.percentualAS ?? null }, components };
    });

    if (semRelatorio.length > 0 && colunaCusto !== undefined) {
      avisosDaUf.push({ code: 'COMPOSICAO_SEM_CUSTO_PUBLICADO', message: `${semRelatorio.length} composição(ões) do Analítico não aparecem na aba ${abas.compositions} (ex.: ${exemplos(semRelatorio)}).` });
    }
    if (referenciasAusentes.length > 0) {
      avisosDaUf.push({ code: 'ITEM_SEM_CADASTRO', message: `${new Set(referenciasAusentes).size} código(s) usados no Analítico não têm linha de preço/custo (ex.: ${exemplos(referenciasAusentes)}).` });
    }
    if (divergentes.length > 0) {
      avisosDaUf.push({ code: 'CUSTO_DIVERGE_DO_ANALITICO', message: `${divergentes.length} composição(ões) têm custo oficial diferente da soma analítica em mais de R$ 0,05 (ex.: ${exemplos(divergentes)}). Vale o custo oficial.` });
    }
    const semPreco = items.filter((insumo) => insumo.unitPrice === null).length;
    if (semPreco > 0) {
      avisosDaUf.push({ code: 'INSUMO_SEM_PRECO_NA_UF', message: `${semPreco} insumo(s) sem preço em ${uf} (não houve coleta).` });
    }
    const semCusto = compositions.filter((c) => c.unitCost === null).length;
    if (semCusto > 0) {
      avisosDaUf.push({ code: 'COMPOSICAO_SEM_CUSTO', message: `${semCusto} composição(ões) sem custo nesta referência — não podem entrar em orçamento.` });
    }
    if (lidas.size === 3 && items.length === 0 && errosDaUf.length === 0) {
      errosDaUf.push({ code: 'SEM_INSUMOS', message: 'Nenhum insumo foi lido.' });
    }
    if (lidas.size === 3 && compositions.length === 0 && errosDaUf.length === 0) {
      errosDaUf.push({ code: 'SEM_COMPOSICOES', message: 'Nenhuma composição foi lida.' });
    }

    return {
      source: 'SINAPI',
      competence,
      uf,
      locality: localidades.get(uf) ?? null,
      regime,
      publishedAt: emissao ? isoDateFromBrazilian(emissao) : null,
      metadata: { availableUfs: [...colunasDeInsumo.keys()], sheets: [abas.items, abas.compositions, ANALITICO] },
      items,
      compositions,
      errors: errosDaUf,
      warnings: avisosDaUf,
    };
  };

  return { regime, availableUfs: [...colunasDeInsumo.keys()], dataset };
}

/// O código da composição nas abas de custo: fórmula `HYPERLINK(..., 104658)`
/// sem valor calculado — o código é o último argumento. Aceita também célula
/// numérica, se a CAIXA voltar a gravar o valor.
export function codigoDaComposicao(celula: unknown): string | null {
  const formula = formulaText(celula);
  if (formula) {
    const achado = formula.match(/,\s*"?(\d+)"?\s*\)\s*$/);
    if (achado) return achado[1]!;
  }
  const numero = cellNumber(celula);
  return numero === null ? null : String(numero);
}
