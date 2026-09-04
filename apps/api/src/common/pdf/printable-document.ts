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

/// Uma linha para assinar à mão.
///
/// O documento sai do sistema e é assinado em papel — não há assinatura
/// eletrônica aqui, e o `name` NÃO é uma assinatura: é a identificação de quem
/// deve assinar sobre a linha.
///
/// `name` opcional porque nem todo signatário é conhecido pelo sistema. A
/// ordem emitida antes de o autor passar a ser gravado imprime a linha sem
/// nome — que é exatamente o que um campo para assinar à mão sempre foi.
export interface DocumentSignature {
  /// O papel de quem assina ("Responsável pela emissão", "Fornecedor").
  role: string;
  name?: string | null;
}

/// O DESTAQUE do documento: um dado que precisa ser lido de longe.
///
/// Existe para o ENDEREÇO DE ENTREGA. Ele vinha no rodapé de rastreabilidade,
/// em 9pt, entre a solicitação de origem e o centro de custo — informação de
/// arquivo, no lugar de informação de ação. Quem recebe a ordem precisa achar
/// onde descarregar sem procurar, e o motorista lê o papel em pé, no caminhão.
///
/// Genérico, e não um "campo de entrega": é o mesmo elemento que qualquer
/// documento futuro usaria para o dado que manda nele.
export interface DocumentHighlight {
  title: string;
  /// A informação principal, em corpo maior.
  value: string;
  /// Apoio, menor e em cinza — o que qualifica o valor sem competir com ele.
  caption?: string | null;
}

export interface PrintableDocument {
  /// Nome que aparece no topo. Sempre existe (`Company.legalName` é NOT NULL).
  companyName: string;
  companyFields: DocumentField[];
  /// Bytes do logo da empresa (PNG ou JPEG), quando houver.
  ///
  /// `Buffer` já resolvido, e não a chave do storage: a camada de conteúdo é
  /// PURA e não faz I/O — é o que permite testá-la sem storage e sem gerar
  /// arquivo. Quem lê os bytes é o `generatePdf` de cada módulo, via
  /// `loadCompanyLogo`.
  ///
  /// `null` é o caso normal, não erro: empresa sem logo cadastrado imprime o
  /// cabeçalho de texto de sempre.
  companyLogo?: Buffer | null;
  title: string;
  /// O identificador que o sistema já usa (ex.: OC-0001, SOL-0001).
  code: string;
  blocks: DocumentBlock[];
  /// Desenhado entre os blocos de identificação e a tabela — depois de quem
  /// vende e quem compra, antes do que foi comprado. `null` some sem deixar
  /// espaço.
  highlight?: DocumentHighlight | null;
  columns: readonly DocumentColumn[];
  rows: DocumentRow[];
  /// Texto exibido quando `rows` está vazio.
  emptyRowsMessage: string;
  total: DocumentTotal | null;
  notes: { title: string; text: string } | null;
  /// Bloco final de rastreabilidade. `null` quando não há o que rastrear.
  footer: DocumentBlock | null;
  /// Linhas para assinar à mão, lado a lado no fim do documento. Vazio quando
  /// o documento não é assinado.
  signatures?: DocumentSignature[];
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
export function buildCompanyHeader(
  company: CompanySource,
  companyLogo?: Buffer | null,
): {
  companyName: string;
  companyFields: DocumentField[];
  companyLogo: Buffer | null;
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
    companyLogo: companyLogo ?? null,
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

/// O ENDEREÇO DE ENTREGA da obra, em uma linha.
///
/// Mora aqui, e não em cada documento, porque a Solicitação e a Ordem de
/// Compra precisam imprimir exatamente o mesmo texto: o fornecedor recebe a
/// ordem e o almoxarife confere contra a solicitação, e dois endereços
/// formatados de jeitos diferentes para o mesmo lugar geram ligação.
///
/// `joinAddress` pula o que não existe, então obra com rua e cidade e sem
/// número sai "RUA X, CENTRO, GOIÂNIA, GO" — nunca "RUA X, , CENTRO".
/// Devolve `null` quando não há nada, e aí a linha some do documento.
export function siteAddress(
  site: {
    addressLine: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  } | null,
): string | null {
  if (!site) return null;

  return joinAddress([
    site.addressLine,
    site.addressNumber,
    site.addressComplement,
    site.neighborhood,
    joinAddress([site.city, site.state]),
    formatZipCode(site.zipCode),
  ]);
}

/// Campos que o Prisma seleciona para montar `CompanySource`. Um só lugar
/// para todo documento — antes cada `generatePdf` repetia a lista.
/// Colunas da obra que os documentos precisam. Um só lugar — antes cada
/// `generatePdf` listava as suas, e acrescentar um campo de endereço exigia
/// lembrar de mudar os dois.
export const SITE_ADDRESS_SELECT = {
  code: true,
  name: true,
  addressLine: true,
  addressNumber: true,
  addressComplement: true,
  neighborhood: true,
  city: true,
  state: true,
  zipCode: true,
} as const;

export const COMPANY_HEADER_SELECT = {
  legalName: true,
  /// A CHAVE do arquivo no storage, não os bytes. Quem os carrega é
  /// `loadCompanyLogo`, no `generatePdf` de cada módulo.
  logoUrl: true,
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
