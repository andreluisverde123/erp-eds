/// O formato COMUM que todo parser de base referencial devolve.
///
/// É a fronteira entre "arquivo oficial" e "domínio": o parser do SINAPI e o do
/// SICRO sabem de abas, colunas e fórmulas; o resto do ERP só conhece isto. O
/// orçamento nunca vê XLSX.
///
/// Valores numéricos trafegam como TEXTO decimal ("302.08", "0.0259413"), do
/// jeito que saíram da planilha, para virarem `Prisma.Decimal` sem passar por
/// arredondamento de ponto flutuante.

export type ReferenceSourceCode = 'SINAPI' | 'SICRO';

/// Regime de encargos sociais da referência.
///
/// - `NAO_DESONERADO` — encargos sem desoneração da folha.
/// - `DESONERADO` — com desoneração.
/// - `SEM_ENCARGOS` — preços sem encargos sociais (o SINAPI publica também).
export type ReferenceRegimeCode = 'NAO_DESONERADO' | 'DESONERADO' | 'SEM_ENCARGOS';

/// O que uma linha analítica de composição é.
///
/// SINAPI: `INPUT` (insumo) ou `COMPOSITION` (composição auxiliar).
/// SICRO: as seções do relatório analítico — `EQUIPMENT` (A), `LABOR` (B),
/// `MATERIAL` (C), `AUXILIARY` (D, atividade auxiliar = composição), `FIXED_TIME`
/// (E) e `TRANSPORT` (F).
export type ReferenceComponentKindCode =
  | 'INPUT'
  | 'COMPOSITION'
  | 'EQUIPMENT'
  | 'LABOR'
  | 'MATERIAL'
  | 'AUXILIARY'
  | 'FIXED_TIME'
  | 'TRANSPORT';

export interface ImportIssue {
  code: string;
  message: string;
  file?: string;
  sheet?: string;
  row?: number;
}

export interface ParsedReferenceItem {
  code: string;
  description: string;
  unit: string;
  category: string | null;
  /// Nulo quando a base não publica preço para a localidade (SINAPI: "preço em
  /// branco significa que não houve coleta").
  unitPrice: string | null;
  metadata: Record<string, unknown>;
}

export interface ParsedReferenceComponent {
  position: number;
  /// Seção do relatório analítico (SICRO: "A".."F"). Nulo no SINAPI.
  section: string | null;
  kind: ReferenceComponentKindCode;
  code: string;
  description: string;
  unit: string | null;
  coefficient: string | null;
  unitPrice: string | null;
  /// Contribuição de custo da linha, como a base a calcula ou publica.
  totalCost: string | null;
  situation: string | null;
  metadata: Record<string, unknown>;
}

export interface ParsedReferenceComposition {
  code: string;
  description: string;
  unit: string;
  group: string | null;
  /// Custo unitário OFICIAL da composição. Nulo quando a base declara a
  /// composição sem custo.
  unitCost: string | null;
  situation: string | null;
  metadata: Record<string, unknown>;
  components: ParsedReferenceComponent[];
}

export interface ParsedReferenceDataset {
  source: ReferenceSourceCode;
  /// "AAAA-MM".
  competence: string | null;
  uf: string | null;
  locality: string | null;
  regime: ReferenceRegimeCode;
  /// "AAAA-MM-DD" — data de emissão publicada, quando existe.
  publishedAt: string | null;
  metadata: Record<string, unknown>;
  items: ParsedReferenceItem[];
  compositions: ParsedReferenceComposition[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}
