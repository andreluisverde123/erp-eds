import { XMLParser } from 'fast-xml-parser';

/// Parser dos documentos da Distribuição DF-e.
///
/// Trabalha com TRÊS formatos que chegam pelo mesmo canal e carregam
/// informações diferentes:
///
///  - `procNFe`  — a nota inteira: emitente completo, itens, impostos.
///  - `resNFe`   — resumo: chave, emitente básico, valor e a SITUAÇÃO
///                 (`cSitNFe`), que o procNFe não tem.
///  - evento     — cancelamento, ciência, carta de correção.
///
/// Nenhum deles sozinho basta: o resumo diz se a nota foi cancelada, e só a
/// completa tem os itens. Ver `FiscalImportService`.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  trimValues: true,
  // `det` (itens) e os eventos podem vir 1 ou N vezes; sem isto o parser
  // devolve objeto no caso de um item só e o consumidor quebra na nota de
  // uma linha — que é o caso mais comum em compra de obra.
  isArray: (name) => name === 'det',
});

export interface ParsedItem {
  itemNumber: number | null;
  code: string | null;
  description: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  ncm: string | null;
  cfop: string | null;
  cst: string | null;
}

export interface ParsedInvoice {
  accessKey: string;
  number: string;
  series: string | null;
  issueDate: Date;
  supplierDocument: string;
  supplierName: string;
  supplierTradeName: string | null;
  supplierIe: string | null;
  /// Endereço em UMA linha (logradouro, número, complemento, bairro) —
  /// é o formato que `InboundInvoice.supplierAddress` guarda e que a tela de
  /// conciliação exibe. Mantido junto dos campos separados abaixo, não no
  /// lugar deles: são consumidores diferentes.
  supplierAddress: string | null;
  /// Os mesmos dados de endereço SEPARADOS, como vêm em `enderEmit`. É o que
  /// o cadastro de fornecedor recebe — remontar a linha e depois fatiá-la de
  /// volta perderia o que o XML já entrega dividido.
  supplierStreet: string | null;
  supplierNumber: string | null;
  supplierComplement: string | null;
  supplierNeighborhood: string | null;
  supplierCity: string | null;
  supplierState: string | null;
  supplierZipCode: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  totalAmount: string;
  productsAmount: string | null;
  freightAmount: string | null;
  discountAmount: string | null;
  icmsAmount: string | null;
  ipiAmount: string | null;
  pisAmount: string | null;
  cofinsAmount: string | null;
  additionalInfo: string | null;
  protocolNumber: string | null;
  /// `true` só para `procNFe`. O resumo preenche o cabeçalho e deixa itens e
  /// impostos vazios.
  isComplete: boolean;
  /// Do resumo: 1 autorizada, 2 denegada, 3 cancelada. `null` no procNFe, que
  /// não carrega situação.
  cancelled: boolean;
  items: ParsedItem[];
}

export interface ParsedEvent {
  accessKey: string | null;
  /// 110111 = cancelamento. Os demais (ciência, confirmação, carta de
  /// correção) não alteram a nota nesta etapa.
  eventType: string | null;
  isCancellation: boolean;
}

export class NfeParseError extends Error {}

/// A chave de acesso carrega série e número, que o `resNFe` NÃO traz como
/// campo próprio. Sem esta extração, uma nota que chegou só como resumo
/// ficaria sem número — que é justamente por onde o financeiro a procura.
///
/// Layout (44 dígitos): cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9)
/// tpEmis(1) cNF(8) cDV(1).
export function parseAccessKey(accessKey: string) {
  if (!/^\d{44}$/.test(accessKey)) {
    throw new NfeParseError(`Chave de acesso inválida: esperava 44 dígitos.`);
  }
  return {
    uf: accessKey.slice(0, 2),
    issuerDocument: accessKey.slice(6, 20),
    // Zeros à esquerda removidos: a série "001" é exibida como "1" no DANFE.
    series: String(Number(accessKey.slice(22, 25))),
    number: String(Number(accessKey.slice(25, 34))),
  };
}

export function parseFiscalDocument(
  xml: string,
  schema: string,
): { kind: 'invoice'; data: ParsedInvoice } | { kind: 'event'; data: ParsedEvent } {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new NfeParseError(
      `XML malformado: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (schema.startsWith('procNFe')) return { kind: 'invoice', data: parseProcNFe(root) };
  if (schema.startsWith('resNFe')) return { kind: 'invoice', data: parseResNFe(root) };
  if (schema.startsWith('procEventoNFe') || schema.startsWith('resEvento')) {
    return { kind: 'event', data: parseEvent(root) };
  }

  throw new NfeParseError(`Schema não reconhecido: ${schema}`);
}

function parseProcNFe(root: Record<string, unknown>): ParsedInvoice {
  const infNFe = find(root, 'infNFe');
  if (!infNFe) throw new NfeParseError('procNFe sem <infNFe>.');

  const accessKey = String(infNFe['@Id'] ?? '').replace(/\D/g, '');
  const key = parseAccessKey(accessKey);

  const ide = obj(infNFe.ide);
  const emit = obj(infNFe.emit);
  const enderEmit = obj(emit.enderEmit);
  const total = obj(obj(infNFe.total).ICMSTot);
  const infAdic = obj(infNFe.infAdic);

  return {
    accessKey,
    // Preferimos o campo explícito e caímos na chave quando ele falta: os dois
    // sempre coincidem, mas o documento manda.
    number: str(ide.nNF) ?? key.number,
    series: str(ide.serie) ?? key.series,
    issueDate: parseDate(str(ide.dhEmi) ?? str(ide.dEmi)),
    supplierDocument: digits(str(emit.CNPJ) ?? str(emit.CPF)) ?? key.issuerDocument,
    supplierName: str(emit.xNome) ?? 'Emitente não identificado',
    supplierTradeName: str(emit.xFant),
    supplierIe: str(emit.IE),
    supplierAddress: montarEndereco(enderEmit),
    supplierStreet: str(enderEmit.xLgr),
    supplierNumber: str(enderEmit.nro),
    supplierComplement: str(enderEmit.xCpl),
    supplierNeighborhood: str(enderEmit.xBairro),
    supplierCity: str(enderEmit.xMun),
    supplierState: str(enderEmit.UF),
    supplierZipCode: digits(str(enderEmit.CEP)),
    supplierPhone: digits(str(enderEmit.fone)),
    // `email` é opcional no layout da NF-e e mora em `emit`, não em
    // `enderEmit` — a maioria das notas simplesmente não o traz.
    supplierEmail: str(emit.email),
    totalAmount: str(total.vNF) ?? '0',
    productsAmount: str(total.vProd),
    freightAmount: str(total.vFrete),
    discountAmount: str(total.vDesc),
    icmsAmount: str(total.vICMS),
    ipiAmount: str(total.vIPI),
    pisAmount: str(total.vPIS),
    cofinsAmount: str(total.vCOFINS),
    additionalInfo: str(infAdic.infCpl),
    protocolNumber: str(obj(find(root, 'infProt')).nProt),
    isComplete: true,
    cancelled: false,
    items: parseItems(infNFe.det),
  };
}

function parseResNFe(root: Record<string, unknown>): ParsedInvoice {
  const res = find(root, 'resNFe');
  if (!res) throw new NfeParseError('resNFe sem raiz reconhecível.');

  const accessKey = digits(str(res.chNFe)) ?? '';
  const key = parseAccessKey(accessKey);

  return {
    accessKey,
    // O resumo NÃO tem nNF nem serie — vêm da chave.
    number: key.number,
    series: key.series,
    issueDate: parseDate(str(res.dhEmi)),
    supplierDocument: digits(str(res.CNPJ) ?? str(res.CPF)) ?? key.issuerDocument,
    supplierName: str(res.xNome) ?? 'Emitente não identificado',
    supplierTradeName: null,
    supplierIe: str(res.IE),
    // O resumo traz APENAS razão social e IE do emitente. Endereço, telefone
    // e e-mail só existem no procNFe.
    supplierAddress: null,
    supplierStreet: null,
    supplierNumber: null,
    supplierComplement: null,
    supplierNeighborhood: null,
    supplierCity: null,
    supplierState: null,
    supplierZipCode: null,
    supplierPhone: null,
    supplierEmail: null,
    totalAmount: str(res.vNF) ?? '0',
    productsAmount: null,
    freightAmount: null,
    discountAmount: null,
    icmsAmount: null,
    ipiAmount: null,
    pisAmount: null,
    cofinsAmount: null,
    additionalInfo: null,
    protocolNumber: str(res.nProt),
    isComplete: false,
    // 1 autorizada · 2 denegada · 3 cancelada. Só o resumo carrega isto.
    cancelled: str(res.cSitNFe) === '3',
    items: [],
  };
}

function parseEvent(root: Record<string, unknown>): ParsedEvent {
  const infEvento = find(root, 'infEvento');
  const eventType = str(obj(infEvento).tpEvento);

  return {
    accessKey: digits(str(obj(infEvento).chNFe)),
    eventType,
    isCancellation: eventType === '110111',
  };
}

function parseItems(det: unknown): ParsedItem[] {
  if (!Array.isArray(det)) return [];

  return det.map((entry) => {
    const item = obj(entry);
    const prod = obj(item.prod);
    // O CST muda de lugar conforme o regime tributário: `CST` no regime
    // normal, `CSOB`/`CSOSN` no Simples Nacional. Varremos o grupo ICMS
    // inteiro em vez de assumir um caminho fixo.
    const cst = findFirstOf(item.imposto, ['CST', 'CSOSN']);

    return {
      itemNumber: item['@nItem'] ? Number(item['@nItem']) : null,
      code: str(prod.cProd),
      description: str(prod.xProd) ?? 'Item sem descrição',
      unit: str(prod.uCom),
      quantity: str(prod.qCom) ?? '0',
      unitPrice: str(prod.vUnCom) ?? '0',
      totalPrice: str(prod.vProd) ?? '0',
      ncm: str(prod.NCM),
      cfop: str(prod.CFOP),
      cst,
    };
  });
}

function montarEndereco(ender: Record<string, unknown>): string | null {
  const partes = [str(ender.xLgr), str(ender.nro), str(ender.xCpl), str(ender.xBairro)].filter(
    Boolean,
  );
  return partes.length > 0 ? partes.join(', ') : null;
}

/// `dhEmi` vem com fuso (`2026-08-04T18:18:12-03:00`); `dEmi`, do layout
/// antigo, vem só com a data.
function parseDate(value: string | null): Date {
  if (!value) throw new NfeParseError('Documento sem data de emissão.');
  const date = new Date(value.length === 10 ? `${value}T00:00:00-03:00` : value);
  if (Number.isNaN(date.getTime())) {
    throw new NfeParseError(`Data de emissão inválida: ${value}`);
  }
  return date;
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function digits(value: string | null): string | null {
  const only = value?.replace(/\D/g, '');
  return only ? only : null;
}

/// Busca em qualquer profundidade, ignorando prefixo de namespace.
function find(node: unknown, target: string): Record<string, unknown> | null {
  if (node === null || typeof node !== 'object') return null;
  for (const [key, value] of Object.entries(node)) {
    if (key === target || key.endsWith(`:${target}`)) return obj(value);
    const found = find(value, target);
    if (found) return found;
  }
  return null;
}

function findFirstOf(node: unknown, targets: string[]): string | null {
  for (const target of targets) {
    const found = find(node, target);
    // `find` devolve o nó; quando a tag é folha, o valor está no próprio nó.
    if (found !== null) {
      const direct = str(found['#text']);
      if (direct) return direct;
    }
  }
  // Folhas simples não viram objeto — varremos o texto cru como reserva.
  for (const target of targets) {
    const raw = findLeaf(node, target);
    if (raw) return raw;
  }
  return null;
}

function findLeaf(node: unknown, target: string): string | null {
  if (node === null || typeof node !== 'object') return null;
  for (const [key, value] of Object.entries(node)) {
    if ((key === target || key.endsWith(`:${target}`)) && typeof value !== 'object') {
      return str(value);
    }
    const found = findLeaf(value, target);
    if (found) return found;
  }
  return null;
}
