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
/// Um dataset = uma UF + um regime. Importar as 27 UF × 3 regimes de uma vez
/// seriam ~5,8 milhões de linhas que ninguém pediu.

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

export async function parseSinapiReference(
  buffer: Buffer,
  options: SinapiParseOptions,
): Promise<ParsedReferenceDataset> {
  const uf = options.uf.trim().toUpperCase();
  const abas = SINAPI_SHEETS[options.regime];
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  const competencias = new Map<string, string>();
  const lidas = new Set<string>();
  let emissao: string | null = null;
  let localidade: string | null = null;
  let ufsDisponiveis: string[] = [];
  const insumos = new Map<string, ParsedReferenceItem>();
  const custos = new Map<string, { custo: string | null; percentualAS: string | null }>();
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

  const lerInsumos = async (aba: string, linhas: AsyncIterable<SheetRow>) => {
    let colunaUf = -1;
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
        ufsDisponiveis = [];
        for (let coluna = 6; coluna < values.length; coluna++) {
          const sigla = cellText(values[coluna]);
          if (/^[A-Z]{2}$/.test(sigla)) {
            ufsDisponiveis.push(sigla);
            if (sigla === uf) colunaUf = coluna;
          }
        }
      } else if (number === 5 && colunaUf > 0) {
        localidade = cellText(values[colunaUf]) || null;
      } else if (number === LINHA_CABECALHO) {
        cabecalhoOk = conferirCabecalho(aba, linha, CABECALHO_INSUMOS);
      } else if (number > LINHA_CABECALHO && cabecalhoOk && colunaUf > 0) {
        const codigo = cellNumber(values[2]);
        if (codigo === null) continue;
        const code = String(codigo);
        if (insumos.has(code)) duplicadas++;
        insumos.set(code, {
          code,
          description: cellText(values[3]),
          unit: cellText(values[4]),
          category: cellText(values[1]) || null,
          unitPrice: cellDecimal(values[colunaUf]),
          metadata: { priceOrigin: cellText(values[5]) || null },
        });
      }
    }
    if (colunaUf < 0) {
      errors.push({ code: 'UF_AUSENTE', message: `A UF ${uf} não aparece no relatório ${aba}.`, sheet: aba });
    }
  };

  const lerCustos = async (aba: string, linhas: AsyncIterable<SheetRow>) => {
    let colunaUf = -1;
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
        for (let coluna = 5; coluna < values.length; coluna += 2) {
          if (cellText(values[coluna]) === uf) colunaUf = coluna;
        }
      } else if (number === LINHA_CABECALHO) {
        cabecalhoOk = conferirCabecalho(aba, linha, CABECALHO_COMPOSICOES);
      } else if (number > LINHA_CABECALHO && cabecalhoOk && colunaUf > 0) {
        const code = codigoDaComposicao(values[2]);
        if (!code) continue;
        custos.set(code, { custo: cellDecimal(values[colunaUf]), percentualAS: cellDecimal(values[colunaUf + 1]) });
      }
    }
    if (colunaUf < 0) {
      errors.push({ code: 'UF_AUSENTE', message: `A UF ${uf} não aparece no relatório ${aba}.`, sheet: aba });
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

  // Custos e contribuições, já com a UF e o regime escolhidos.
  const situacaoPorCodigo = new Map(composicoes.map((c) => [c.code, c.situation]));
  const semRelatorio: string[] = [];
  const referenciasAusentes: string[] = [];
  const divergentes: string[] = [];

  for (const composicao of composicoes) {
    const custo = custos.get(composicao.code);
    if (!custo) semRelatorio.push(composicao.code);
    composicao.unitCost = composicao.situation === SEM_CUSTO ? null : (custo?.custo ?? null);
    composicao.metadata = { percentAS: custo?.percentualAS ?? null };

    let soma = new Prisma.Decimal(0);
    let somaCompleta = true;
    for (const componente of composicao.components) {
      let preco: string | null;
      if (componente.kind === 'INPUT') {
        const insumo = insumos.get(componente.code);
        if (!insumo) referenciasAusentes.push(componente.code);
        preco = insumo?.unitPrice ?? null;
      } else {
        if (!situacaoPorCodigo.has(componente.code)) referenciasAusentes.push(componente.code);
        preco = situacaoPorCodigo.get(componente.code) === SEM_CUSTO ? null : (custos.get(componente.code)?.custo ?? null);
      }
      componente.unitPrice = preco;
      componente.totalCost =
        preco !== null && componente.coefficient !== null
          ? new Prisma.Decimal(componente.coefficient)
              .times(preco)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
              .toString()
          : null;
      if (componente.totalCost === null) somaCompleta = false;
      else soma = soma.plus(componente.totalCost);
    }

    if (composicao.unitCost !== null && somaCompleta && soma.minus(composicao.unitCost).abs().greaterThan('0.05')) {
      divergentes.push(composicao.code);
    }
  }

  const exemplos = (codigos: string[]) => [...new Set(codigos)].slice(0, MAX_EXEMPLOS).join(', ');
  if (semRelatorio.length > 0) {
    warnings.push({ code: 'COMPOSICAO_SEM_CUSTO_PUBLICADO', message: `${semRelatorio.length} composição(ões) do Analítico não aparecem na aba ${abas.compositions} (ex.: ${exemplos(semRelatorio)}).` });
  }
  if (referenciasAusentes.length > 0) {
    warnings.push({ code: 'ITEM_SEM_CADASTRO', message: `${new Set(referenciasAusentes).size} código(s) usados no Analítico não têm linha de preço/custo (ex.: ${exemplos(referenciasAusentes)}).` });
  }
  if (divergentes.length > 0) {
    warnings.push({ code: 'CUSTO_DIVERGE_DO_ANALITICO', message: `${divergentes.length} composição(ões) têm custo oficial diferente da soma analítica em mais de R$ 0,05 (ex.: ${exemplos(divergentes)}). Vale o custo oficial.` });
  }
  const semPreco = [...insumos.values()].filter((insumo) => insumo.unitPrice === null).length;
  if (semPreco > 0) {
    warnings.push({ code: 'INSUMO_SEM_PRECO_NA_UF', message: `${semPreco} insumo(s) sem preço em ${uf} (não houve coleta).` });
  }
  const semCusto = composicoes.filter((c) => c.unitCost === null).length;
  if (semCusto > 0) {
    warnings.push({ code: 'COMPOSICAO_SEM_CUSTO', message: `${semCusto} composição(ões) sem custo nesta referência — não podem entrar em orçamento.` });
  }
  if (lidas.size === 3 && insumos.size === 0 && errors.length === 0) {
    errors.push({ code: 'SEM_INSUMOS', message: 'Nenhum insumo foi lido.' });
  }
  if (lidas.size === 3 && composicoes.length === 0 && errors.length === 0) {
    errors.push({ code: 'SEM_COMPOSICOES', message: 'Nenhuma composição foi lida.' });
  }

  return {
    source: 'SINAPI',
    competence,
    uf,
    locality: localidade,
    regime: options.regime,
    publishedAt: emissao ? isoDateFromBrazilian(emissao) : null,
    metadata: { availableUfs: ufsDisponiveis, sheets: [abas.items, abas.compositions, ANALITICO] },
    items: [...insumos.values()],
    compositions: composicoes,
    errors,
    warnings,
  };
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
