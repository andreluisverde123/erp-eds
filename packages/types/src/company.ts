/// Identidade da EMPRESA DONA do sistema.
///
/// Este ERP é proprietário da construtora EDS: não é vendido, não é assinado
/// e não hospeda outras construtoras. Existe UMA empresa, e é esta. Toda
/// personalização visual e institucional da aplicação parte deste arquivo —
/// nome, marca, dados cadastrais e cores de marca ficam aqui e em nenhum
/// outro lugar do código.
///
/// Vive em `@repo/types` de propósito: é o único pacote que a API e o web
/// consomem em comum, então os dois lados leem exatamente os mesmos valores.
/// Um nome de empresa espalhado por componente e por service é o que se está
/// evitando aqui.
///
/// Não confundir com o registro `Company` do banco. O banco continua sendo a
/// fonte dos dados operacionais da empresa (razão social, CNPJ e endereço
/// editáveis em Configurações → Empresa, usados em documento e relatório).
/// Este arquivo é a identidade da APLICAÇÃO: o que aparece antes de existir
/// sessão — aba do navegador, manifest, tela de login, splash — quando ainda
/// não há banco nenhum consultado. A precedência entre os dois está em
/// `useBrand`, no web: o dado do banco vence quando existe.

export interface CompanyAddress {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  /// UF, duas letras.
  state: string | null;
  /// Só dígitos, 8 posições.
  zipCode: string | null;
}

export interface CompanyContacts {
  email: string | null;
  phone: string | null;
  website: string | null;
}

/// Cores de MARCA da empresa. São exatamente as três que o design system já
/// expõe como token de marca (`--primary`, seu texto e `--ring`); nenhum token
/// novo é criado a partir daqui. Os valores estão espelhados em
/// `packages/ui/src/styles/globals.css`, que é onde o CSS de fato os lê — este
/// objeto é a fonte declarada, para quem precisa da cor em TypeScript
/// (geração de PDF, gráfico, e-mail).
export interface CompanyTheme {
  /// Vermelho institucional da EDS, extraído do logo oficial.
  primary: string;
  /// Tom escuro do mesmo vermelho, usado no logo como sombra.
  primaryDark: string;
  primaryForeground: string;
}

export interface CompanyIdentity {
  /// Marca curta. É o que o usuário chama de "o sistema".
  shortName: string;
  /// Nome da aplicação: aba do navegador, manifest, splash, login.
  appName: string;
  /// Descrição institucional — meta description e manifest.
  description: string;
  /// Razão social. `null` enquanto o dado oficial não for informado: melhor
  /// a aplicação omitir do que exibir um valor inventado em documento.
  legalName: string | null;
  tradeName: string | null;
  /// Só dígitos, 14 posições. `null` enquanto não informado.
  cnpj: string | null;
  /// Inscrição estadual. `null` enquanto não informada.
  stateRegistration: string | null;
  /// Caminho público do logo horizontal (barra lateral, login, documentos).
  logo: string;
  /// Caminho público do símbolo quadrado (favicon, ícone de app).
  symbol: string;
  address: CompanyAddress;
  contacts: CompanyContacts;
  theme: CompanyTheme;
}

/// A EDS. Empresa única e permanente desta aplicação.
///
/// Os campos em `null` são dados cadastrais oficiais que ainda não foram
/// fornecidos. Estão declarados — e não omitidos — para que o lugar de
/// preenchê-los seja óbvio e único. Todo consumidor trata `null` como
/// "não exibir"; nenhuma tela quebra por causa deles.
///
/// Pendentes hoje: inscrição estadual, endereço e contatos. Enquanto forem
/// `null`, documento e relatório saem identificados por razão social e CNPJ,
/// mas sem endereço e sem canal de contato.
export const EDS_COMPANY: CompanyIdentity = {
  shortName: 'EDS',
  appName: 'ERP EDS',
  description: 'Sistema de gestão da construtora EDS — obras, compras, financeiro e pessoal.',

  /// Razão social exatamente como consta no CNPJ — é ela que vale em documento
  /// (ordem de compra, relatório, holerite), não a marca de exibição.
  legalName: 'E D S Construcoes e Imobiliaria Ltda',

  /// Marca de EXIBIÇÃO (rodapé da barra lateral, via `COMPANY_NAME`). Difere do
  /// nome fantasia registrado — "E D S Construcoes e Imobiliaria" — de
  /// propósito: o registrado é a grafia da Receita, sem acento e com as
  /// iniciais separadas, e não é como a empresa se apresenta. Documento usa
  /// `legalName`; tela usa este.
  tradeName: 'EDS Construtora',

  /// Só dígitos: 05.534.927/0001-25. `formatCompanyCnpj` cuida da máscara.
  cnpj: '05534927000125',

  /// Ainda não informada. Continua `null` — nenhuma tela quebra por isso.
  stateRegistration: null,

  logo: '/logo-eds.svg',
  symbol: '/favicon.svg',

  address: {
    street: null,
    number: null,
    complement: null,
    district: null,
    city: null,
    state: null,
    zipCode: null,
  },

  contacts: {
    email: null,
    phone: null,
    website: null,
  },

  theme: {
    primary: '#ED2124',
    primaryDark: '#B42D32',
    primaryForeground: '#FFFFFF',
  },
};

/// Formata o CNPJ para exibição (`00.000.000/0000-00`). Devolve `null` quando
/// o dado não está preenchido, para a tela simplesmente não renderizar a linha.
export function formatCompanyCnpj(cnpj: string | null): string | null {
  if (!cnpj || cnpj.length !== 14) return null;
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/// Endereço em uma linha, pulando o que não estiver preenchido. `null` quando
/// não há nada a exibir.
export function formatCompanyAddress(address: CompanyAddress): string | null {
  const street = [address.street, address.number, address.complement].filter(Boolean).join(', ');
  const region = [address.district, address.city, address.state].filter(Boolean).join(' - ');
  const line = [street, region, address.zipCode].filter(Boolean).join(' · ');
  return line || null;
}
