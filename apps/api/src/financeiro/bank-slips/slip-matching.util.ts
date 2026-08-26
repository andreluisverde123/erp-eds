/// Quanto um boleto combina com uma conta a pagar.
///
/// Camada PURA e DETERMINÍSTICA — sem IA, como o prompt exige e como a
/// conciliação de NF-e já faz. O vocabulário é o mesmo de
/// `conciliacao/compatibility.util.ts` de propósito: quem já entendeu a
/// conferência da nota não precisa aprender outro no boleto.

/// `UNKNOWN` não é falha: é ausência de informação. Boleto sem vencimento e
/// conta sem número de documento são casos legítimos, e tratá-los como
/// divergência acusaria o que não se sabe.
export type CheckResult = 'MATCH' | 'DIVERGENT' | 'UNKNOWN';

export type MatchLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SlipMatchChecks {
  supplier: CheckResult;
  amount: CheckResult;
  dueDate: CheckResult;
  documentNumber: CheckResult;
}

export interface SlipMatchInput {
  supplierId: string | null;
  amount: number | null;
  dueDate: Date | null;
  documentNumber: string | null;
}

export interface PayableMatchInput extends SlipMatchInput {
  id: string;
  /// Número da nota fiscal, quando a conta veio de uma. Entra na comparação de
  /// documento porque é comum o boleto trazer o número da NF no campo
  /// "número do documento" — é o mesmo papel, emitido junto.
  invoiceNumber: string | null;
}

export interface SlipMatch {
  accountPayableId: string;
  level: MatchLevel;
  checks: SlipMatchChecks;
}

/// Um centavo. Mesma tolerância da conferência de nota fiscal.
const AMOUNT_TOLERANCE = 0.005;

export function compareSlipToPayable(slip: SlipMatchInput, payable: PayableMatchInput): SlipMatch {
  const checks: SlipMatchChecks = {
    supplier: compareIds(slip.supplierId, payable.supplierId),
    amount: compareAmounts(slip.amount, payable.amount),
    dueDate: compareDates(slip.dueDate, payable.dueDate),
    documentNumber: compareDocuments(slip.documentNumber, payable),
  };

  return { accountPayableId: payable.id, level: levelFor(checks), checks };
}

/// O fornecedor é o eixo: sem ele nada passa de BAIXA.
///
/// Não é rigor decorativo. Valor e vencimento iguais entre fornecedores
/// diferentes é coincidência comum numa construtora — várias compras de
/// R$ 3.500 vencendo no dia 30. Deixar isso subir para ALTA convidaria a
/// vincular o boleto de um fornecedor à conta de outro.
///
///  - ALTA:  fornecedor ✓ e valor ✓ e (vencimento ✓ ou documento ✓)
///  - MÉDIA: fornecedor ✓ e (valor ✓ ou vencimento ✓)
///  - BAIXA: o resto
///
/// Nenhum grau BLOQUEIA o vínculo: quem tem permissão analisa e decide. O grau
/// ordena a lista e escolhe o destaque da tela.
function levelFor(checks: SlipMatchChecks): MatchLevel {
  const { supplier, amount, dueDate, documentNumber } = checks;

  if (supplier !== 'MATCH') return 'LOW';
  if (amount === 'MATCH' && (dueDate === 'MATCH' || documentNumber === 'MATCH')) return 'HIGH';
  if (amount === 'MATCH' || dueDate === 'MATCH') return 'MEDIUM';
  return 'LOW';
}

function compareIds(a: string | null, b: string | null): CheckResult {
  if (!a || !b) return 'UNKNOWN';
  return a === b ? 'MATCH' : 'DIVERGENT';
}

function compareAmounts(a: number | null, b: number | null): CheckResult {
  if (a === null || b === null) return 'UNKNOWN';
  return Math.abs(a - b) < AMOUNT_TOLERANCE ? 'MATCH' : 'DIVERGENT';
}

/// Compara o DIA, não o instante. A conta a pagar guarda a data com hora zero
/// e o boleto vem de um fator de vencimento — comparar timestamps faria duas
/// datas iguais parecerem diferentes por causa de fuso.
function compareDates(a: Date | null, b: Date | null): CheckResult {
  if (!a || !b) return 'UNKNOWN';
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10) ? 'MATCH' : 'DIVERGENT';
}

/// O documento do boleto pode casar com o número do documento da conta OU com
/// o número da nota fiscal que a originou — os dois são o mesmo papel.
function compareDocuments(slipDocument: string | null, payable: PayableMatchInput): CheckResult {
  const slipKey = normalizeDocument(slipDocument);
  if (!slipKey) return 'UNKNOWN';

  const candidates = [payable.documentNumber, payable.invoiceNumber]
    .map(normalizeDocument)
    .filter((value): value is string => value !== null);

  if (candidates.length === 0) return 'UNKNOWN';
  return candidates.includes(slipKey) ? 'MATCH' : 'DIVERGENT';
}

/// Zeros à esquerda e pontuação são formatação: a nota "000456" e a "456" são
/// o mesmo documento, e é assim que os sistemas de banco as escrevem.
function normalizeDocument(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase()
    .replace(/^0+/, '');
  return cleaned === '' ? null : cleaned;
}

/// Ordena candidatas: melhor grau primeiro e, dentro do mesmo grau, a que tem
/// mais verificações confirmadas. Estável — duas candidatas equivalentes
/// mantêm a ordem em que o banco as devolveu (vencimento mais próximo).
export function rankMatches(matches: SlipMatch[]): SlipMatch[] {
  const levelWeight: Record<MatchLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const confirmed = (match: SlipMatch) =>
    Object.values(match.checks).filter((check) => check === 'MATCH').length;

  return [...matches].sort(
    (a, b) => levelWeight[b.level] - levelWeight[a.level] || confirmed(b) - confirmed(a),
  );
}
