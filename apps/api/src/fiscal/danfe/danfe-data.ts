import { XMLParser } from 'fast-xml-parser';

/// Tudo o que o DANFE retrato imprime, tirado do `procNFe` como veio da SEFAZ.
///
/// Separado do `nfe-parser.ts` de propósito: aquele alimenta o banco e guarda
/// só o que a conciliação usa. O DANFE precisa de muito mais (destinatário,
/// transportador, impostos por item) e de tudo COMO TEXTO do documento — nada
/// aqui passa por `Decimal` nem por `Date`, porque o que se imprime é o que a
/// nota diz, não uma reinterpretação dela.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  trimValues: true,
  // Grupos que vêm 1 ou N vezes. Sem isto, a nota de um item só (ou de uma
  // duplicata só) volta como objeto, não lista.
  isArray: (name) => name === 'det' || name === 'dup' || name === 'vol',
});

export class DanfeXmlError extends Error {}

export interface DanfeParty {
  name: string;
  document: string | null;
  ie: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
}

export interface DanfeItem {
  code: string;
  description: string;
  ncm: string;
  cst: string;
  cfop: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  icmsBase: string | null;
  icmsAmount: string | null;
  icmsRate: string | null;
  ipiAmount: string | null;
  ipiRate: string | null;
}

export interface DanfeDuplicate {
  number: string | null;
  dueDate: string | null;
  amount: string | null;
}

export interface DanfeData {
  accessKey: string;
  number: string;
  series: string;
  /// 0 = entrada, 1 = saída — do ponto de vista do EMITENTE.
  operationType: string;
  operationNature: string;
  issueDate: string | null;
  exitDate: string | null;
  exitTime: string | null;
  protocol: string | null;
  /// "Emitida em ambiente de homologação" quando `tpAmb` = 2.
  isHomologation: boolean;

  issuer: DanfeParty & { tradeName: string | null; ieSt: string | null; im: string | null };
  recipient: DanfeParty;

  duplicates: DanfeDuplicate[];

  totals: {
    icmsBase: string | null;
    icmsAmount: string | null;
    icmsStBase: string | null;
    icmsStAmount: string | null;
    productsAmount: string | null;
    freightAmount: string | null;
    insuranceAmount: string | null;
    discountAmount: string | null;
    otherAmount: string | null;
    ipiAmount: string | null;
    importTaxAmount: string | null;
    approximateTaxes: string | null;
    invoiceAmount: string | null;
  };

  carrier: {
    freightMode: string | null;
    name: string | null;
    document: string | null;
    ie: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    plate: string | null;
    plateState: string | null;
    rntc: string | null;
  };
  volumes: {
    quantity: string | null;
    species: string | null;
    brand: string | null;
    numbering: string | null;
    grossWeight: string | null;
    netWeight: string | null;
  };

  /// Só existe quando a nota tem serviço tributado pelo município.
  issqn: {
    servicesAmount: string | null;
    base: string | null;
    amount: string | null;
  } | null;

  items: DanfeItem[];

  complementaryInfo: string | null;
  fiscoInfo: string | null;
}

export function parseDanfeXml(xml: string): DanfeData {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new DanfeXmlError(
      `XML malformado: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const infNFe = find(root, 'infNFe');
  if (!infNFe) throw new DanfeXmlError('O documento não é uma NF-e completa (sem <infNFe>).');

  const accessKey = String(infNFe['@Id'] ?? '').replace(/\D/g, '');
  if (accessKey.length !== 44) throw new DanfeXmlError('Chave de acesso ausente ou inválida.');

  const ide = obj(infNFe.ide);
  const emit = obj(infNFe.emit);
  const enderEmit = obj(emit.enderEmit);
  const dest = obj(infNFe.dest);
  const enderDest = obj(dest.enderDest);
  const total = obj(infNFe.total);
  const icmsTot = obj(total.ICMSTot);
  const issqnTot = total.ISSQNtot ? obj(total.ISSQNtot) : null;
  const transp = obj(infNFe.transp);
  const transporta = obj(transp.transporta);
  const veic = obj(transp.veicTransp);
  const vol = obj(list(transp.vol)[0]);
  const infAdic = obj(infNFe.infAdic);
  const infProt = obj(find(root, 'infProt'));

  // Emissão e saída guardadas como vieram (com fuso), sem virar `Date`: o
  // DANFE imprime o horário do emitente, e converter para o fuso do servidor
  // poderia trocar o dia de uma nota emitida perto da meia-noite.
  const dhEmi = str(ide.dhEmi) ?? str(ide.dEmi);
  const dhSaiEnt = str(ide.dhSaiEnt) ?? str(ide.dSaiEnt);
  const nProt = str(infProt.nProt);
  const dhRecbto = str(infProt.dhRecbto);

  return {
    accessKey,
    number: str(ide.nNF) ?? String(Number(accessKey.slice(25, 34))),
    series: str(ide.serie) ?? String(Number(accessKey.slice(22, 25))),
    operationType: str(ide.tpNF) ?? '1',
    operationNature: str(ide.natOp) ?? '',
    issueDate: formatDate(dhEmi),
    exitDate: formatDate(dhSaiEnt),
    exitTime: str(ide.hSaiEnt) ?? formatTime(dhSaiEnt),
    protocol: nProt ? [nProt, formatDateTime(dhRecbto)].filter(Boolean).join(' - ') : null,
    isHomologation: str(ide.tpAmb) === '2',

    issuer: {
      name: str(emit.xNome) ?? '',
      tradeName: str(emit.xFant),
      document: str(emit.CNPJ) ?? str(emit.CPF),
      ie: str(emit.IE),
      ieSt: str(emit.IEST),
      im: str(emit.IM),
      street: joinAddress([str(enderEmit.xLgr), str(enderEmit.nro), str(enderEmit.xCpl)]),
      neighborhood: str(enderEmit.xBairro),
      city: str(enderEmit.xMun),
      state: str(enderEmit.UF),
      zipCode: str(enderEmit.CEP),
      phone: str(enderEmit.fone),
    },
    recipient: {
      name: str(dest.xNome) ?? '',
      document: str(dest.CNPJ) ?? str(dest.CPF) ?? str(dest.idEstrangeiro),
      ie: str(dest.IE),
      street: joinAddress([str(enderDest.xLgr), str(enderDest.nro), str(enderDest.xCpl)]),
      neighborhood: str(enderDest.xBairro),
      city: str(enderDest.xMun),
      state: str(enderDest.UF),
      zipCode: str(enderDest.CEP),
      phone: str(enderDest.fone),
    },

    duplicates: list(obj(infNFe.cobr).dup).map((entry) => {
      const dup = obj(entry);
      return { number: str(dup.nDup), dueDate: formatDate(str(dup.dVenc)), amount: str(dup.vDup) };
    }),

    totals: {
      icmsBase: str(icmsTot.vBC),
      icmsAmount: str(icmsTot.vICMS),
      icmsStBase: str(icmsTot.vBCST),
      icmsStAmount: str(icmsTot.vST),
      productsAmount: str(icmsTot.vProd),
      freightAmount: str(icmsTot.vFrete),
      insuranceAmount: str(icmsTot.vSeg),
      discountAmount: str(icmsTot.vDesc),
      otherAmount: str(icmsTot.vOutro),
      ipiAmount: str(icmsTot.vIPI),
      importTaxAmount: str(icmsTot.vII),
      approximateTaxes: str(icmsTot.vTotTrib),
      invoiceAmount: str(icmsTot.vNF),
    },

    carrier: {
      freightMode: str(transp.modFrete),
      name: str(transporta.xNome),
      document: str(transporta.CNPJ) ?? str(transporta.CPF),
      ie: str(transporta.IE),
      address: str(transporta.xEnder),
      city: str(transporta.xMun),
      state: str(transporta.UF),
      plate: str(veic.placa),
      plateState: str(veic.UF),
      rntc: str(veic.RNTC),
    },
    volumes: {
      quantity: str(vol.qVol),
      species: str(vol.esp),
      brand: str(vol.marca),
      numbering: str(vol.nVol),
      grossWeight: str(vol.pesoB),
      netWeight: str(vol.pesoL),
    },

    issqn: issqnTot
      ? { servicesAmount: str(issqnTot.vServ), base: str(issqnTot.vBC), amount: str(issqnTot.vISS) }
      : null,

    items: list(infNFe.det).map((entry) => parseItem(obj(entry))),

    complementaryInfo: str(infAdic.infCpl),
    fiscoInfo: str(infAdic.infAdFisco),
  };
}

function parseItem(det: Record<string, unknown>): DanfeItem {
  const prod = obj(det.prod);
  const imposto = obj(det.imposto);
  // O grupo de ICMS tem um nome por situação tributária (ICMS00, ICMS20,
  // ICMSSN102…) e só um deles vem preenchido.
  const icms = firstChild(imposto.ICMS);
  const ipiTrib = obj(obj(imposto.IPI).IPITrib);

  const origem = str(icms.orig) ?? '';
  const situacao = str(icms.CST) ?? str(icms.CSOSN) ?? '';

  // `infAdProd` é informação do item que o emitente quis impressa — o DANFE
  // a mostra logo abaixo da descrição.
  const extra = str(det.infAdProd);
  const description = [str(prod.xProd) ?? '', extra].filter(Boolean).join('\n');

  return {
    code: str(prod.cProd) ?? '',
    description,
    ncm: str(prod.NCM) ?? '',
    cst: situacao ? `${origem}${situacao}` : '',
    cfop: str(prod.CFOP) ?? '',
    unit: str(prod.uCom) ?? '',
    quantity: str(prod.qCom) ?? '0',
    unitPrice: str(prod.vUnCom) ?? '0',
    totalPrice: str(prod.vProd) ?? '0',
    icmsBase: str(icms.vBC),
    icmsAmount: str(icms.vICMS),
    icmsRate: str(icms.pICMS),
    ipiAmount: str(ipiTrib.vIPI),
    ipiRate: str(ipiTrib.pIPI),
  };
}

/// `2026-08-04T18:18:12-03:00` → `04/08/2026`. Lê a data do próprio texto,
/// sem conversão de fuso (ver comentário em `parseDanfeXml`).
function formatDate(value: string | null): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function formatTime(value: string | null): string | null {
  return value?.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] ?? null;
}

function formatDateTime(value: string | null): string | null {
  const date = formatDate(value);
  const time = formatTime(value);
  return date ? [date, time].filter(Boolean).join(' ') : null;
}

function joinAddress(parts: (string | null)[]): string | null {
  const filled = parts.filter(Boolean);
  return filled.length > 0 ? filled.join(', ') : null;
}

function firstChild(value: unknown): Record<string, unknown> {
  const children = Object.values(obj(value));
  return obj(children[0]);
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).trim();
  return text === '' ? null : text;
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
