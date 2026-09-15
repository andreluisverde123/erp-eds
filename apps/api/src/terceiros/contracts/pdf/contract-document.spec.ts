import { Prisma } from '../../../../generated/prisma/client';
import { PERMISSIONS_KEY } from '../../../auth/decorators/permissions.decorator';
import { renderDocumentPdf } from '../../../common/pdf/pdf-renderer';
import type { CompanySource, PrintableDocument } from '../../../common/pdf/printable-document';
import { ContractsController } from '../contracts.controller';
import { buildContractDocument, prazoEmDias, type ContractSource } from './contract-document';

/// `Intl` separa "R$" do número com espaço não-quebrável (U+00A0) — ver o spec
/// do PDF da solicitação. A frase inteira tem espaços, então só o "R$ " é trocado.
const brl = (texto: string) => texto.replaceAll('R$ ', 'R$\u00a0');

const EMPRESA_COMPLETA: CompanySource = {
  legalName: 'EDS CONSTRUTORA LTDA',
  tradeName: 'EDS',
  cnpj: '12345678000190',
  stateRegistration: null,
  email: null,
  phone: null,
  addressLine: 'AVENIDA CENTRAL',
  addressNumber: '1000',
  addressComplement: null,
  city: 'GOIÂNIA',
  state: 'GO',
  zipCode: '74000000',
};

/// O que a empresa de produção tem hoje: só o nome.
const EMPRESA_VAZIA: CompanySource = {
  ...EMPRESA_COMPLETA,
  legalName: 'EDS Construções e Imobiliária',
  tradeName: null,
  cnpj: null,
  addressLine: null,
  addressNumber: null,
  city: null,
  state: null,
  zipCode: null,
};

function contrato(overrides: Partial<ContractSource> = {}): ContractSource {
  return {
    code: 'CT-0001',
    scope: 'Execução de alvenaria de vedação do bloco A',
    totalValue: new Prisma.Decimal('12500.00'),
    pricingType: 'GLOBAL',
    unitPrice: null,
    unitLabel: null,
    startDate: new Date('2026-09-15T00:00:00Z'),
    endDate: new Date('2026-10-14T00:00:00Z'),
    paymentTerms: 'Medições quinzenais, com pagamento em até 10 dias após a aprovação da medição.',
    createdAt: new Date('2026-09-15T12:00:00Z'),
    contractor: {
      legalName: 'Alvenarias Silva LTDA',
      tradeName: null,
      document: '98765432000155',
      responsibleName: 'João da Silva',
      city: 'Aparecida de Goiânia',
      state: 'GO',
    },
    constructionSite: {
      code: 'OB-001',
      name: 'Residencial Aurora',
      addressLine: 'Rua 10',
      addressNumber: '200',
      addressComplement: null,
      neighborhood: 'Setor Oeste',
      city: 'Goiânia',
      state: 'GO',
      zipCode: '74120000',
    },
    ...overrides,
  };
}

const texto = (documento: PrintableDocument) =>
  (documento.clauses ?? [])
    .flatMap((clausula) => [clausula.title ?? '', ...clausula.paragraphs])
    .join('\n');

describe('PDF do contrato de prestação de serviços', () => {
  it('traz os campos preenchidos no cadastro dentro das cláusulas', () => {
    const documento = buildContractDocument(contrato(), EMPRESA_COMPLETA);
    const corpo = texto(documento);

    expect(documento).toMatchObject({
      title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
      code: 'CT-0001',
    });
    expect(corpo).toContain('dos seguintes serviços: Execução de alvenaria de vedação do bloco A.');
    expect(corpo).toContain('prazo de 30 (trinta) dias corridos, com início em 15/09/2026');
    expect(corpo).toContain(brl('o valor global de R$ 12.500,00 (doze mil e quinhentos reais).'));
    expect(corpo).toContain('4.1. Medições quinzenais, com pagamento em até 10 dias');
    expect(corpo).toContain('foro da comarca de Goiânia/GO');
    expect(corpo).toContain('Goiânia, 15 de setembro de 2026.');
  });

  it('qualifica as partes: CNPJ e sede da contratante, representante da contratada', () => {
    const corpo = texto(buildContractDocument(contrato(), EMPRESA_COMPLETA));

    expect(corpo).toContain(
      'EDS CONSTRUTORA LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-90',
    );
    expect(corpo).toContain(
      'Alvenarias Silva LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 98.765.432/0001-55',
    );
    expect(corpo).toContain('neste ato representada por João da Silva');
  });

  it('numera as cláusulas e os itens em sequência', () => {
    const documento = buildContractDocument(contrato(), EMPRESA_COMPLETA);
    const titulos = (documento.clauses ?? []).map((clausula) => clausula.title).filter(Boolean);

    expect(titulos[0]).toBe('CLÁUSULA 1ª — DO OBJETO');
    expect(titulos.at(-1)).toBe('CLÁUSULA 11ª — DO FORO');
    expect(documento.clauses![1]!.paragraphs[0]).toMatch(/^1\.1\. /);
  });

  it('dado ausente vira linha em branco, nunca texto inventado', () => {
    const corpo = texto(
      buildContractDocument(
        contrato({
          paymentTerms: null,
          contractor: { ...contrato().contractor, responsibleName: null },
          constructionSite: {
            ...contrato().constructionSite,
            addressLine: null,
            addressNumber: null,
            neighborhood: null,
            city: null,
            state: null,
            zipCode: null,
          },
        }),
        EMPRESA_VAZIA,
      ),
    );

    expect(corpo).toMatch(/inscrita no CNPJ sob o nº _{10,}, com sede em _{10,}/);
    expect(corpo).toMatch(/4\.1\. _{10,}/);
    expect(corpo).toMatch(/representada por _{10,}/);
    expect(corpo).toMatch(/foro da comarca de _{10,}/);
  });

  it('preço unitário: valor por unidade e total estimado, os dois por extenso', () => {
    const corpo = texto(
      buildContractDocument(
        contrato({
          pricingType: 'UNIT',
          unitPrice: new Prisma.Decimal('45.0000'),
          unitLabel: 'm²',
        }),
        EMPRESA_COMPLETA,
      ),
    );

    expect(corpo).toContain(brl('preço unitário de R$ 45,00 (quarenta e cinco reais) por m²'));
    expect(corpo).toContain(
      brl('valor total estimado de R$ 12.500,00 (doze mil e quinhentos reais)'),
    );
  });

  it('contratada pessoa física é qualificada pelo CPF', () => {
    const corpo = texto(
      buildContractDocument(
        contrato({
          contractor: {
            ...contrato().contractor,
            legalName: 'José Pereira',
            document: '12345678901',
          },
        }),
        EMPRESA_COMPLETA,
      ),
    );

    expect(corpo).toContain('José Pereira, pessoa física, inscrita no CPF sob o nº 123.456.789-01');
  });

  it('assinaturas das partes e de duas testemunhas, duas por linha', () => {
    const documento = buildContractDocument(contrato(), EMPRESA_COMPLETA);

    expect(documento.signatures?.map((assinatura) => assinatura.role)).toEqual([
      'CONTRATANTE',
      'CONTRATADA',
      'Testemunha 1 — nome e CPF',
      'Testemunha 2 — nome e CPF',
    ]);
    expect(documento.signaturesPerRow).toBe(2);
    // O fecho (local e data) nunca fica numa página e as assinaturas em outra.
    expect(documento.clauses!.at(-1)).toMatchObject({ keepWithSignatures: true });
  });

  it('prazo conta o primeiro e o último dia', () => {
    expect(prazoEmDias(new Date('2026-09-15'), new Date('2026-09-15'))).toBe(1);
    expect(prazoEmDias(new Date('2026-09-15'), new Date('2026-10-14'))).toBe(30);
  });

  it('gera um PDF de verdade, com as cláusulas em mais de uma página', async () => {
    const { buffer, pageCount } = await renderDocumentPdf(
      buildContractDocument(contrato(), EMPRESA_COMPLETA),
    );

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount).toBeGreaterThanOrEqual(2);
  });

  it('a rota do PDF usa a mesma permissão de ver contratos', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ContractsController.prototype.pdf)).toEqual([
      'terceiros.view',
    ]);
  });
});
