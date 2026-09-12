/// UNIDADES DE MEDIDA CANÔNICAS — a lista que a API valida.
///
/// ## Por que a lista está aqui, e não num pacote compartilhado
///
/// A auditoria de orçamento encontrou três representações de unidade
/// (`MEASUREMENT_UNITS` no front, o enum `MaterialUnit` do Diário, e `String`
/// livre em cinco campos de documento) e a pergunta natural foi mover a lista
/// para `@repo/types`, que a API já declara como dependência.
///
/// **Não dá.** `@repo/types` aponta para `.ts` cru (`main: ./src/index.ts`) e
/// faz `export * from './company'` sem extensão; o `moduleResolution` da API é
/// `node16`, que exige extensão explícita. Um `import` de lá quebra o
/// `nest build` — verificado. Consertar isso mexe num pacote compartilhado e
/// no build do web, que é refatoração fora do escopo do ORC-01.
///
/// A saída é a mesma que o ERP já usa para a normalização de busca, que existe
/// em três implementações (TypeScript de gravação, de consulta e SQL de
/// migration): **duas cópias e um teste que falha se elas divergirem.**
/// `measurement-units.spec.ts` lê o arquivo do front e compara código a
/// código.
///
/// ## O que esta lista NÃO faz
///
/// Não migra `PurchaseRequestItem.unit`, `PurchaseOrderItem.unit`,
/// `ProductionEntry.unit`, `InboundInvoiceItem.unit` nem
/// `ContractorContract.unitLabel`. Aqueles campos são `String` livre com
/// histórico gravado, e normalizá-los em massa reinterpretaria documento
/// emitido. A canonicidade vale para o CATÁLOGO, que nasce agora e pode exigir
/// um valor válido desde o primeiro registro — mesmo argumento que o schema já
/// registra para o enum `MaterialUnit` do Diário.

export interface MeasurementUnit {
  /// O que vai para o banco. Sempre em caixa alta, sem acento.
  code: string;
  name: string;
}

export const MEASUREMENT_UNITS: MeasurementUnit[] = [
  { code: 'UN', name: 'Unidade' },
  { code: 'PC', name: 'Peça' },
  { code: 'CX', name: 'Caixa' },
  { code: 'PCT', name: 'Pacote' },
  { code: 'SC', name: 'Saco' },
  { code: 'MI', name: 'Milheiro' },
  { code: 'BR', name: 'Barra' },
  { code: 'RL', name: 'Rolo' },
  { code: 'CJ', name: 'Conjunto' },
  { code: 'PAR', name: 'Par' },
  { code: 'M', name: 'Metro linear' },
  { code: 'M2', name: 'Metro quadrado' },
  { code: 'M3', name: 'Metro cúbico' },
  { code: 'KG', name: 'Quilograma' },
  { code: 'TON', name: 'Tonelada' },
  { code: 'L', name: 'Litro' },
  { code: 'GL', name: 'Galão' },
  { code: 'H', name: 'Hora' },
  { code: 'DIA', name: 'Diária' },
  { code: 'MES', name: 'Mês' },
  { code: 'VB', name: 'Verba' },
];

const CODIGOS = new Set(MEASUREMENT_UNITS.map((unidade) => unidade.code));

export const MEASUREMENT_UNIT_CODES: string[] = MEASUREMENT_UNITS.map((u) => u.code);

/// A unidade informada existe no catálogo canônico?
///
/// Comparação EXATA, sem normalizar caixa nem acento de propósito. "m²", "M²"
/// e "m2" não são apelidos de `M2` que valha a pena aceitar: aceitá-los faria
/// o banco guardar a variante digitada, e aí `M2` e `m2` voltariam a ser duas
/// unidades diferentes — que é exatamente o defeito que esta lista existe para
/// impedir. Quem digita escolhe de uma lista; quem chama a API manda o código.
export function isCanonicalUnit(unit: string): boolean {
  return CODIGOS.has(unit);
}
