/// UF, nome de estado e mês por extenso, como aparecem nos relatórios oficiais.

export const UF_BY_STATE_NAME: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

export const BRAZILIAN_UFS = Object.values(UF_BY_STATE_NAME).sort();

export const MONTH_BY_NAME: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

/// Minúsculas, sem acento, espaços colapsados — para COMPARAR rótulos de
/// cabeçalho e nomes de arquivo, nunca para gravar.
export function normalizeAscii(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/// "08/2026" → "2026-08". Nulo se não for mês/ano válido.
export function competenceFromMonthYear(texto: string): string | null {
  const achado = texto.trim().match(/^(\d{2})\/(\d{4})$/);
  if (!achado) return null;
  const mes = Number(achado[1]);
  return mes >= 1 && mes <= 12 ? `${achado[2]}-${achado[1]}` : null;
}

/// "Abril/2026" → "2026-04".
export function competenceFromMonthName(texto: string): string | null {
  const achado = normalizeAscii(texto).match(/^([a-z]+)\s*\/\s*(\d{4})$/);
  if (!achado) return null;
  const mes = MONTH_BY_NAME[achado[1]!];
  return mes ? `${achado[2]}-${mes}` : null;
}

/// "11/09/2026" → "2026-09-11".
export function isoDateFromBrazilian(texto: string): string | null {
  const achado = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return achado ? `${achado[3]}-${achado[2]}-${achado[1]}` : null;
}

/// Primeiro dia da competência: "2026-08" → "2026-08-01".
export function competenceStartDate(competence: string): string {
  return `${competence}-01`;
}
