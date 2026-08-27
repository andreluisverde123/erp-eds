import type { Prisma } from '../../../generated/prisma/client';

/// O conteúdo de um documento imprimível — SEM pdfkit.
///
/// A separação é deliberada: aqui mora tudo que pode estar errado de um jeito
/// que importa (valor formatado, data, campo ausente virando texto inventado)
/// e nada que dependa de desenhar numa página. Isso deixa a parte que precisa
/// de teste minucioso testável sem gerar arquivo nenhum; o renderizador
/// (`pdf-renderer.ts`) cuida só de onde cada string cai.
///
/// GENÉRICO de propósito. Nasceu para a Ordem de Compra e a Solicitação de
/// Compra passou a usar o mesmo desenho — cabeçalho da empresa, blocos de
/// identificação, tabela paginada, total, observações e numeração de página.
/// Um segundo renderizador significaria dois documentos que se parecem por
/// coincidência e divergem no primeiro ajuste.

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

/// Junta as partes de um endereço PULANDO as que não existem.
///
/// É aqui que a regra "não inventar informação" vira código: sem isto o
/// endereço de um fornecedor sem número sairia como "RUA X, , CENTRO" — que
/// não é dado faltando, é dado errado.
export function joinAddress(parts: (string | null | undefined)[]): string | null {
  const presentes = parts
    .map((parte) => parte?.trim())
    .filter((parte): parte is string => Boolean(parte));
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

/// Constrói zero ou um campo. O `...spread` no lugar de chamada torna a
/// ausência invisível na lista final, que é o comportamento desejado.
export function field(label: string, value: string | null | undefined): DocumentField[] {
  return value ? [{ label, value }] : [];
}

/// Um bloco rótulo/valor sob o cabeçalho. O renderizador desenha os dois
/// primeiros lado a lado.
export interface DocumentBlock {
  title: string;
  fields: DocumentField[];
}

/// Uma coluna da tabela de itens. `width` é PROPORÇÃO da largura útil, e a
/// soma das colunas de um documento precisa dar 1.
export interface DocumentColumn {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'right';
  /// Sai em cinza. Para colunas de apoio (origem, situação) que não devem
  /// competir com a descrição e os números.
  muted?: boolean;
}

/// Uma linha da tabela, já formatada. As chaves são as das colunas do
/// documento — daí o índice aberto, em vez de um tipo por documento.
export type DocumentRow = Record<string, string>;

/// O rodapé de valor. `null` quando o documento não tem total nenhum a
/// mostrar.
export interface DocumentTotal {
  label: string;
  value: string;
  /// As ETAPAS da conta, desenhadas acima do total em corpo menor. Existe para
  /// o documento poder mostrar de onde o total saiu — subtotal, descontos,
  /// subtotal líquido — em vez de um número que ninguém consegue conferir.
  lines?: { label: string; value: string }[];
  /// Linha miúda sob o total, explicando como ele foi obtido.
  caption?: string;
}

export interface PrintableDocument {
  /// Nome que aparece no topo. Sempre existe (`Company.legalName` é NOT NULL).
  companyName: string;
  companyFields: DocumentField[];
  title: string;
  /// O identificador que o sistema já usa (ex.: OC-0001, SOL-0001).
  code: string;
  blocks: DocumentBlock[];
  columns: readonly DocumentColumn[];
  rows: DocumentRow[];
  /// Texto exibido quando `rows` está vazio.
  emptyRowsMessage: string;
  total: DocumentTotal | null;
  notes: { title: string; text: string } | null;
  /// Bloco final de rastreabilidade. `null` quando não há o que rastrear.
  footer: DocumentBlock | null;
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

/// O cabeçalho da EDS, idêntico em todo documento que o sistema imprime.
///
/// Nada é inventado: cada campo só aparece se estiver preenchido no cadastro,
/// e o nome fantasia só entra quando diz algo além do que já está no título.
export function buildCompanyHeader(company: CompanySource): {
  companyName: string;
  companyFields: DocumentField[];
} {
  const address = joinAddress([
    company.addressLine,
    company.addressNumber,
    company.addressComplement,
    joinAddress([company.city, company.state]),
    formatZipCode(company.zipCode),
  ]);

  return {
    companyName: company.legalName,
    companyFields: [
      ...(company.tradeName && company.tradeName !== company.legalName
        ? field('Nome fantasia', company.tradeName)
        : []),
      ...field('CNPJ', formatDocument(company.cnpj)),
      ...field('Inscrição estadual', company.stateRegistration),
      ...field('Endereço', address),
      ...field('Telefone', formatPhone(company.phone)),
      ...field('E-mail', company.email),
    ],
  };
}

/// Campos que o Prisma seleciona para montar `CompanySource`. Um só lugar
/// para todo documento — antes cada `generatePdf` repetia a lista.
export const COMPANY_HEADER_SELECT = {
  legalName: true,
  tradeName: true,
  cnpj: true,
  stateRegistration: true,
  email: true,
  phone: true,
  addressLine: true,
  addressNumber: true,
  addressComplement: true,
  city: true,
  state: true,
  zipCode: true,
} as const;
