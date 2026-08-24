import type { Prisma } from '../../../../generated/prisma/client';

/// Montagem do conteúdo do PDF da Ordem de Compra — SEM pdfkit.
///
/// A separação é deliberada: aqui mora tudo que pode estar errado de um jeito
/// que importa (valor formatado, data, campo ausente virando texto inventado,
/// origem do item) e nada que dependa de desenhar numa página. Isso deixa a
/// parte que precisa de teste minucioso testável sem gerar arquivo nenhum;
/// o renderizador cuida só de onde cada string cai.

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QUANTITY = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/// `timeZone: 'UTC'` porque as datas do sistema são civis (a emissão é um DIA,
/// não um instante). Sem isso, uma ordem emitida em 01/08 aparece como 31/07
/// para quem está em GMT-3 — mesmo tratamento que as telas já dão.
export function formatDate(value: Date): string {
  return value.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function formatCurrency(value: Prisma.Decimal | number | string): string {
  return CURRENCY.format(Number(value));
}

export function formatQuantity(value: Prisma.Decimal | number | string): string {
  return QUANTITY.format(Number(value));
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  ISSUED: 'Emitida',
  RECEIVED: 'Recebida',
  CANCELLED: 'Cancelada',
};

/// Espelha os rótulos da tela (`features/compras/purchase-order-status.ts`).
/// O documento impresso e a tela têm de chamar o mesmo status pelo mesmo nome.
export function formatStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/// Junta as partes de um endereço PULANDO as que não existem.
///
/// É aqui que a regra "não inventar informação" vira código: sem isto o
/// endereço de um fornecedor sem número sairia como "RUA X, , CENTRO" — que
/// não é dado faltando, é dado errado.
export function joinAddress(parts: (string | null | undefined)[]): string | null {
  const presentes = parts.map((parte) => parte?.trim()).filter((parte): parte is string =>
    Boolean(parte),
  );
  return presentes.length > 0 ? presentes.join(', ') : null;
}

/// CEP e telefone saem do banco só com dígitos (ver `document.util.ts`).
/// Formata quando o tamanho bate e devolve como está quando não bate — nunca
/// descarta o dado por não caber na máscara.
export function formatZipCode(value: string | null): string | null {
  if (!value) return null;
  return /^\d{8}$/.test(value) ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
}

export function formatDocument(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{14}$/.test(value)) {
    return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}`;
  }
  if (/^\d{11}$/.test(value)) {
    return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
  }
  return value;
}

export function formatPhone(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{11}$/.test(value)) {
    return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
  }
  if (/^\d{10}$/.test(value)) {
    return `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  }
  return value;
}

/// Um par rótulo/valor do documento. Só entra na lista quando TEM valor —
/// linha com "—" no lugar do CNPJ suja o documento sem informar nada.
export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentRow {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  /// A origem da linha: código da solicitação e, quando a quantidade comprada
  /// difere da pedida, a quantidade original.
  origin: string;
}

export interface PurchaseOrderDocument {
  /// Nome que aparece no topo. Sempre existe (`Company.legalName` é NOT NULL).
  companyName: string;
  companyFields: DocumentField[];
  title: string;
  /// O identificador que o sistema já usa (`PurchaseOrder.code`, ex.: OC-0001).
  code: string;
  orderFields: DocumentField[];
  supplierName: string;
  supplierFields: DocumentField[];
  rows: DocumentRow[];
  total: string;
  /// Observações da solicitação de origem. A ordem de compra NÃO tem campo
  /// próprio de observação no modelo atual — ver o relatório desta etapa.
  notes: string | null;
  traceabilityFields: DocumentField[];
}

function field(label: string, value: string | null | undefined): DocumentField[] {
  return value ? [{ label, value }] : [];
}

/// Formato mínimo que o documento precisa da ordem. Declarado à parte do tipo
/// gerado pelo Prisma para o builder poder ser testado sem montar um payload
/// de banco inteiro.
export interface PurchaseOrderSource {
  code: string;
  status: string;
  issueDate: Date;
  expectedDeliveryDate: Date | null;
  totalAmount: Prisma.Decimal;
  supplier: {
    legalName: string;
    tradeName: string | null;
    document: string;
    stateRegistration: string | null;
    address: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    email: string | null;
  };
  purchaseRequest: { code: string; notes: string | null };
  constructionSite: { code: string; name: string } | null;
  costCenter: { code: string; name: string };
  items: {
    description: string;
    unit: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
    notes: string | null;
    purchaseRequestItem: {
      quantity: Prisma.Decimal;
      unit: string;
      purchaseRequest: { code: string };
    };
  }[];
}

export interface CompanySource {
  legalName: string;
  tradeName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export function buildPurchaseOrderDocument(
  order: PurchaseOrderSource,
  company: CompanySource,
): PurchaseOrderDocument {
  const companyAddress = joinAddress([
    company.addressLine,
    company.addressNumber,
    company.addressComplement,
    joinAddress([company.city, company.state]),
    formatZipCode(company.zipCode),
  ]);

  const supplierAddress = joinAddress([
    order.supplier.address,
    order.supplier.addressNumber,
    order.supplier.addressComplement,
    order.supplier.neighborhood,
    joinAddress([order.supplier.city, order.supplier.state]),
    formatZipCode(order.supplier.zipCode),
  ]);

  return {
    companyName: company.legalName,
    companyFields: [
      // `tradeName` só entra quando diz algo além do que já está no título.
      ...(company.tradeName && company.tradeName !== company.legalName
        ? field('Nome fantasia', company.tradeName)
        : []),
      ...field('CNPJ', formatDocument(company.cnpj)),
      ...field('Inscrição estadual', company.stateRegistration),
      ...field('Endereço', companyAddress),
      ...field('Telefone', formatPhone(company.phone)),
      ...field('E-mail', company.email),
    ],
    title: 'ORDEM DE COMPRA',
    code: order.code,
    orderFields: [
      { label: 'Número', value: order.code },
      { label: 'Emissão', value: formatDate(order.issueDate) },
      { label: 'Status', value: formatStatus(order.status) },
      ...(order.expectedDeliveryDate
        ? field('Previsão de entrega', formatDate(order.expectedDeliveryDate))
        : []),
    ],
    supplierName: order.supplier.legalName,
    supplierFields: [
      ...(order.supplier.tradeName && order.supplier.tradeName !== order.supplier.legalName
        ? field('Nome fantasia', order.supplier.tradeName)
        : []),
      ...field('CNPJ', formatDocument(order.supplier.document)),
      ...field('Inscrição estadual', order.supplier.stateRegistration),
      ...field('Endereço', supplierAddress),
      ...field('Telefone', formatPhone(order.supplier.phone)),
      ...field('E-mail', order.supplier.email),
    ],
    rows: order.items.map((item) => {
      const comprada = Number(item.quantity);
      const solicitada = Number(item.purchaseRequestItem.quantity);
      const origem = item.purchaseRequestItem.purchaseRequest.code;

      return {
        description: item.notes ? `${item.description}\n${item.notes}` : item.description,
        quantity: formatQuantity(item.quantity),
        unit: item.unit,
        unitPrice: formatCurrency(item.unitPrice),
        totalPrice: formatCurrency(item.totalPrice),
        // A divergência entre pedido e comprado é impressa: é a informação
        // que o fornecedor e o almoxarife vão conferir na entrega.
        origin:
          comprada === solicitada
            ? origem
            : `${origem} (solic. ${formatQuantity(item.purchaseRequestItem.quantity)} ${item.purchaseRequestItem.unit})`,
      };
    }),
    total: formatCurrency(order.totalAmount),
    notes: order.purchaseRequest.notes?.trim() || null,
    traceabilityFields: [
      { label: 'Solicitação de origem', value: order.purchaseRequest.code },
      ...field(
        'Obra',
        order.constructionSite ? `${order.constructionSite.code} — ${order.constructionSite.name}` : null,
      ),
      { label: 'Centro de custo', value: `${order.costCenter.code} — ${order.costCenter.name}` },
    ],
  };
}
