/// Onde as bases oficiais GRATUITAS são publicadas, e como os endereços são
/// montados.
///
/// Não há API: são pacotes em páginas públicas, com endereço previsível. Mês
/// não publicado responde 404 (DNIT) ou redireciona para a página inicial
/// (CAIXA) — é assim que o carregador sabe que ele não existe, sem depender de
/// ler o HTML das páginas de listagem.
///
/// - SINAPI (CAIXA): mensal, um zip nacional com as 27 UFs e os 3 regimes.
///   Publicado por volta do dia 10 do mês seguinte.
/// - SICRO (DNIT): um pacote .7z por UF, em geral trimestral (jan, abr, jul,
///   out), e nem toda UF sai no mesmo trimestre.

export const SINAPI_REGIMES = ['NAO_DESONERADO', 'DESONERADO', 'SEM_ENCARGOS'] as const;

/// O parser do SICRO lê só os relatórios sem desoneração.
export const SICRO_REGIME = 'NAO_DESONERADO' as const;

const SINAPI_BASE = 'https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais';

const SICRO_BASE =
  'https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-referenciais/sistemas-de-custos/sicro/relatorios/relatorios-sicro';

/// Região e nome da UF como aparecem no caminho das páginas do DNIT.
export const SICRO_UF_PATHS: Record<string, string> = {
  AC: 'norte/acre',
  AL: 'nordeste/alagoas',
  AM: 'norte/amazonas',
  AP: 'norte/amapa',
  BA: 'nordeste/bahia',
  CE: 'nordeste/ceara',
  DF: 'centro-oeste/distrito-federal',
  ES: 'sudeste/espirito-santo',
  GO: 'centro-oeste/goias',
  MA: 'nordeste/maranhao',
  MG: 'sudeste/minas-gerais',
  MS: 'centro-oeste/mato-grosso-do-sul',
  MT: 'centro-oeste/mato-grosso',
  PA: 'norte/para',
  PB: 'nordeste/paraiba',
  PE: 'nordeste/pernambuco',
  PI: 'nordeste/piaui',
  PR: 'sul/parana',
  RJ: 'sudeste/rio-de-janeiro',
  RN: 'nordeste/rio-grande-do-norte',
  RO: 'norte/rondonia',
  RR: 'norte/roraima',
  RS: 'sul/rio-grande-do-sul',
  SC: 'sul/santa-catarina',
  SE: 'nordeste/sergipe',
  SP: 'sudeste/sao-paulo',
  TO: 'norte/tocantins',
};

const MESES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function sinapiPackageUrl(competence: string): string {
  return `${SINAPI_BASE}/SINAPI-${competence}-formato-xlsx.zip`;
}

export function sicroPackageUrl(uf: string, competence: string): string {
  const caminho = SICRO_UF_PATHS[uf];
  if (!caminho) throw new Error(`UF sem página no SICRO: ${uf}`);
  const [ano, mes] = competence.split('-') as [string, string];
  return `${SICRO_BASE}/${caminho}/${ano}/${MESES[Number(mes) - 1]}/${uf.toLowerCase()}-${mes}-${ano}.7z`;
}

/// As `quantidade` competências anteriores ao mês corrente (horário de
/// Brasília), da mais nova para a mais antiga. O mês corrente fica de fora:
/// nenhuma das duas fontes publica o mês antes de ele terminar.
export function previousCompetences(quantidade: number, hoje = new Date()): string[] {
  const brasilia = new Date(hoje.getTime() - 3 * 60 * 60 * 1000);
  let ano = brasilia.getUTCFullYear();
  let mes = brasilia.getUTCMonth() + 1;
  const lista: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    lista.push(`${ano}-${String(mes).padStart(2, '0')}`);
  }
  return lista;
}
