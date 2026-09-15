import type { Prisma } from '../../../../generated/prisma/client';
import {
  buildCompanyHeader,
  field,
  formatCurrency,
  formatDate,
  formatDocument,
  formatZipCode,
  joinAddress,
  siteAddress,
  type CompanySource,
  type DocumentClause,
  type PrintableDocument,
} from '../../../common/pdf/printable-document';
import { numeroPorExtenso, valorPorExtenso } from '../../../common/pdf/valor-por-extenso';

/// O CONTRATO DE PRESTAÇÃO DE SERVIÇOS (subempreitada de mão de obra).
///
/// Quem cadastra preenche só o que muda de um contrato para outro — contratada,
/// obra, objeto, prazo, preço e forma de pagamento. O restante é o texto
/// padrão de mercado para subempreitada em obra: obrigações das partes,
/// encargos e segurança do trabalho por conta da contratada, ausência de
/// vínculo, fiscalização, penalidades, rescisão e foro.
///
/// **Nada é inventado.** Dado que não está no cadastro (CNPJ da contratante,
/// endereço, representante) vira uma linha em branco para preencher à mão —
/// o documento é impresso e assinado em papel, e uma lacuna visível é
/// melhor que um texto que parece completo e não é.
///
/// O texto é um modelo de referência; a revisão jurídica é da empresa.

const BRANCO = '______________________________';
const BRANCO_CURTO = '____________________';

export interface ContractSource {
  code: string;
  scope: string;
  totalValue: Prisma.Decimal;
  pricingType: 'GLOBAL' | 'UNIT';
  unitPrice: Prisma.Decimal | null;
  unitLabel: string | null;
  startDate: Date;
  endDate: Date;
  paymentTerms: string | null;
  /// Data do instrumento ("Goiânia, 15 de setembro de 2026").
  createdAt: Date;
  contractor: {
    legalName: string;
    tradeName: string | null;
    document: string;
    responsibleName: string | null;
    city: string | null;
    state: string | null;
  };
  constructionSite: {
    code: string;
    name: string;
    addressLine: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
}

/// "15 de setembro de 2026". UTC pelo mesmo motivo de `formatDate`: a data é
/// civil.
export function formatLongDate(value: Date): string {
  return value.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/// Dias corridos, contando o primeiro e o último: 15/09 a 14/10 são 30 dias.
export function prazoEmDias(inicio: Date, fim: Date): number {
  const dia = (data: Date) =>
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
  return Math.round((dia(fim) - dia(inicio)) / 86_400_000) + 1;
}

function cidadeUf(city: string | null, state: string | null): string | null {
  if (!city) return null;
  return state ? `${city}/${state}` : city;
}

function qualificacaoContratante(company: CompanySource): string {
  const sede = joinAddress([
    company.addressLine,
    company.addressNumber,
    company.addressComplement,
    cidadeUf(company.city, company.state),
    formatZipCode(company.zipCode),
  ]);
  return (
    `${company.legalName}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ` +
    `${formatDocument(company.cnpj) ?? BRANCO}, com sede em ${sede ?? BRANCO}, ` +
    `doravante denominada CONTRATANTE;`
  );
}

function qualificacaoContratada(contractor: ContractSource['contractor']): string {
  const local = cidadeUf(contractor.city, contractor.state) ?? BRANCO;
  if (/^\d{11}$/.test(contractor.document)) {
    return (
      `${contractor.legalName}, pessoa física, inscrita no CPF sob o nº ` +
      `${formatDocument(contractor.document)}, residente e domiciliada em ${local}, ` +
      `doravante denominada CONTRATADA.`
    );
  }
  return (
    `${contractor.legalName}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ` +
    `${formatDocument(contractor.document)}, com sede em ${local}, neste ato representada por ` +
    `${contractor.responsibleName ?? BRANCO}, doravante denominada CONTRATADA.`
  );
}

function clausulaDoPreco(contract: ContractSource): string {
  const total = `${formatCurrency(contract.totalValue)} (${valorPorExtenso(contract.totalValue)})`;
  if (contract.pricingType === 'UNIT' && contract.unitPrice) {
    return (
      `Pela execução dos serviços, a CONTRATANTE pagará à CONTRATADA o preço unitário de ` +
      `${formatCurrency(contract.unitPrice)} (${valorPorExtenso(contract.unitPrice)}) por ` +
      `${contract.unitLabel?.trim() || 'unidade'}, aplicado às quantidades efetivamente executadas ` +
      `e medidas, com valor total estimado de ${total}.`
    );
  }
  return `Pela execução dos serviços, a CONTRATANTE pagará à CONTRATADA o valor global de ${total}.`;
}

/// As cláusulas, sem numeração — ela é aplicada na montagem, para que
/// acrescentar ou tirar uma cláusula não deixe a sequência errada.
function clausulas(contract: ContractSource, company: CompanySource) {
  const dias = prazoEmDias(contract.startDate, contract.endDate);
  const enderecoDaObra = siteAddress(contract.constructionSite);
  const foro =
    cidadeUf(contract.constructionSite.city, contract.constructionSite.state) ??
    cidadeUf(company.city, company.state) ??
    BRANCO;

  return [
    {
      titulo: 'DO OBJETO',
      paragrafos: [
        `O presente contrato tem por objeto a prestação, pela CONTRATADA, dos seguintes serviços: ` +
          `${contract.scope.trim()}.`,
        `Os serviços serão executados na obra ${contract.constructionSite.name} ` +
          `(${contract.constructionSite.code}), situada em ${enderecoDaObra ?? BRANCO}.`,
        'Os serviços serão executados com mão de obra, ferramentas e equipamentos próprios da ' +
          'CONTRATADA, salvo disposição em contrário acordada por escrito entre as partes.',
        'A CONTRATADA declara conhecer o local da obra, os projetos e as especificações dos serviços, ' +
          'não podendo alegar desconhecimento para eximir-se de suas obrigações.',
      ],
    },
    {
      titulo: 'DO PRAZO',
      paragrafos: [
        `Os serviços serão executados no prazo de ${dias} (${numeroPorExtenso(dias)}) ` +
          `${dias === 1 ? 'dia corrido' : 'dias corridos'}, com início em ${formatDate(contract.startDate)} ` +
          `e término previsto em ${formatDate(contract.endDate)}.`,
        'O prazo somente poderá ser prorrogado mediante termo aditivo assinado pelas partes.',
        'O atraso não justificado na execução dos serviços sujeita a CONTRATADA às penalidades ' +
          'previstas neste contrato.',
      ],
    },
    {
      titulo: 'DO PREÇO',
      paragrafos: [
        clausulaDoPreco(contract),
        'Estão incluídos no preço todos os custos diretos e indiretos necessários à execução dos ' +
          'serviços, tais como mão de obra, encargos sociais, trabalhistas, previdenciários e fiscais, ' +
          'ferramentas, equipamentos, transporte, alimentação e equipamentos de proteção individual.',
        'O preço é fixo e irreajustável durante a vigência deste contrato.',
      ],
    },
    {
      titulo: 'DA FORMA DE PAGAMENTO',
      paragrafos: [
        contract.paymentTerms?.trim() || BRANCO,
        'Cada pagamento fica condicionado à medição e ao aceite dos serviços pela CONTRATANTE e à ' +
          'apresentação da nota fiscal correspondente.',
        'Junto com cada nota fiscal, a CONTRATADA apresentará a folha de pagamento dos empregados ' +
          'alocados na obra e os comprovantes de recolhimento do FGTS e das contribuições ' +
          'previdenciárias, sem os quais o pagamento poderá ser retido até a regularização.',
        'A CONTRATANTE efetuará as retenções de tributos e contribuições previstas na legislação vigente.',
      ],
    },
    {
      titulo: 'DAS OBRIGAÇÕES DA CONTRATADA',
      paragrafos: [
        'Executar os serviços com boa técnica, de acordo com os projetos, as normas técnicas da ABNT e ' +
          'as orientações da fiscalização da CONTRATANTE.',
        'Fornecer a seus empregados e exigir o uso dos equipamentos de proteção individual, cumprindo ' +
          'as Normas Regulamentadoras de segurança e saúde no trabalho, em especial a NR-18.',
        'Arcar integral e exclusivamente com salários, encargos trabalhistas, previdenciários, fiscais ' +
          'e securitários de seus empregados e prepostos.',
        'Manter seus empregados devidamente registrados, com exames médicos, treinamentos e demais ' +
          'documentos exigidos pela legislação e pela CONTRATANTE.',
        'Refazer, às suas expensas, os serviços executados com defeito ou em desacordo com o contratado.',
        'Manter o local de trabalho limpo e organizado, removendo os entulhos resultantes dos seus serviços.',
        'Responder pelos danos causados à CONTRATANTE ou a terceiros em decorrência da execução dos serviços.',
        'Não subcontratar, total ou parcialmente, os serviços sem autorização prévia e por escrito da ' +
          'CONTRATANTE.',
      ],
    },
    {
      titulo: 'DAS OBRIGAÇÕES DA CONTRATANTE',
      paragrafos: [
        'Garantir o acesso da CONTRATADA à obra e fornecer os projetos e as informações necessárias à ' +
          'execução dos serviços.',
        'Efetuar os pagamentos nas condições estabelecidas neste contrato.',
        'Fiscalizar e medir os serviços, comunicando por escrito à CONTRATADA as irregularidades encontradas.',
      ],
    },
    {
      titulo: 'DA INEXISTÊNCIA DE VÍNCULO EMPREGATÍCIO',
      paragrafos: [
        'Não existe vínculo empregatício entre a CONTRATANTE e os empregados ou prepostos da CONTRATADA, ' +
          'que são por ela contratados, dirigidos e remunerados.',
        'Se a CONTRATANTE for acionada judicial ou administrativamente por obrigação de responsabilidade ' +
          'da CONTRATADA, esta a ressarcirá de todos os valores despendidos, podendo a CONTRATANTE reter ' +
          'os pagamentos devidos para esse fim.',
      ],
    },
    {
      titulo: 'DA FISCALIZAÇÃO E DA GARANTIA',
      paragrafos: [
        'A CONTRATANTE poderá fiscalizar a execução dos serviços a qualquer tempo, sem que isso reduza ' +
          'ou exclua a responsabilidade da CONTRATADA.',
        'A CONTRATADA responde pela qualidade dos serviços executados, nos termos da legislação aplicável, ' +
          'inclusive do artigo 618 do Código Civil.',
      ],
    },
    {
      titulo: 'DAS PENALIDADES E DA RESCISÃO',
      paragrafos: [
        'O descumprimento de qualquer cláusula deste contrato sujeita a parte infratora a multa de 10% ' +
          '(dez por cento) sobre o valor total do contrato, sem prejuízo da indenização por perdas e danos.',
        'O contrato poderá ser rescindido: (a) por qualquer das partes, mediante aviso prévio por escrito ' +
          'de 30 (trinta) dias; (b) de imediato, por descumprimento contratual não sanado em 5 (cinco) ' +
          'dias úteis após notificação; (c) em caso de falência, recuperação judicial ou dissolução de ' +
          'qualquer das partes.',
        'Em caso de rescisão, serão devidos à CONTRATADA apenas os serviços executados e medidos até a data ' +
          'da rescisão, descontados eventuais débitos e multas.',
      ],
    },
    {
      titulo: 'DAS DISPOSIÇÕES GERAIS',
      paragrafos: [
        'Qualquer alteração deste contrato somente terá validade se feita por termo aditivo assinado ' +
          'pelas partes.',
        'A tolerância de uma parte quanto ao descumprimento de obrigação pela outra não constitui novação ' +
          'nem renúncia de direitos.',
        'Este contrato não poderá ser cedido ou transferido sem a anuência prévia e por escrito da outra parte.',
      ],
    },
    {
      titulo: 'DO FORO',
      paragrafos: [
        `Fica eleito o foro da comarca de ${foro} para dirimir as questões oriundas deste contrato, ` +
          'com renúncia expressa a qualquer outro, por mais privilegiado que seja.',
      ],
    },
  ];
}

export function buildContractDocument(
  contract: ContractSource,
  company: CompanySource,
  companyLogo?: Buffer | null,
): PrintableDocument {
  const numeradas: DocumentClause[] = clausulas(contract, company).map((clausula, indice) => ({
    title: `CLÁUSULA ${indice + 1}ª — ${clausula.titulo}`,
    paragraphs: clausula.paragrafos.map((texto, item) => `${indice + 1}.${item + 1}. ${texto}`),
  }));
  const local = contract.constructionSite.city ?? company.city ?? BRANCO_CURTO;

  return {
    ...buildCompanyHeader(company, companyLogo),
    title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
    code: contract.code,
    blocks: [
      {
        title: 'CONTRATO',
        fields: [
          { label: 'Número', value: contract.code },
          { label: 'Data', value: formatDate(contract.createdAt) },
          {
            label: 'Obra',
            value: `${contract.constructionSite.code} — ${contract.constructionSite.name}`,
          },
        ],
      },
      {
        title: 'CONTRATADA',
        fields: [
          { label: 'Razão social', value: contract.contractor.legalName },
          ...field(
            /^\d{11}$/.test(contract.contractor.document) ? 'CPF' : 'CNPJ',
            formatDocument(contract.contractor.document),
          ),
          ...field('Cidade', cidadeUf(contract.contractor.city, contract.contractor.state)),
          ...field('Responsável', contract.contractor.responsibleName),
        ],
      },
    ],
    clauses: [
      {
        title: null,
        paragraphs: [
          'Pelo presente instrumento particular, de um lado,',
          qualificacaoContratante(company),
          'e, de outro lado,',
          qualificacaoContratada(contract.contractor),
          'têm entre si justo e contratado o presente Contrato de Prestação de Serviços, que se regerá ' +
            'pelas cláusulas e condições a seguir.',
        ],
      },
      ...numeradas,
      {
        title: null,
        keepWithSignatures: true,
        paragraphs: [
          'E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) ' +
            'vias de igual teor e forma, na presença das testemunhas abaixo.',
          `${local}, ${formatLongDate(contract.createdAt)}.`,
        ],
      },
    ],
    columns: [],
    rows: [],
    emptyRowsMessage: '',
    total: null,
    notes: null,
    footer: null,
    signatures: [
      { role: 'CONTRATANTE', name: company.legalName },
      { role: 'CONTRATADA', name: contract.contractor.legalName },
      { role: 'Testemunha 1 — nome e CPF' },
      { role: 'Testemunha 2 — nome e CPF' },
    ],
    signaturesPerRow: 2,
  };
}
