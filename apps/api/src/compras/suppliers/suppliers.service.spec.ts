import { ConflictException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';

function makeService() {
  const supplier = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'sup-1',
      ...data,
    })),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'sup-1',
      ...data,
    })),
    findFirst: jest.fn(async () => ({ id: 'sup-1', companyId: EMPRESA })),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  };
  const prisma = {
    supplier,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  return { service: new SuppliersService(prisma), supplier };
}

describe('SuppliersService — normalização do CNPJ', () => {
  it('grava só os dígitos quando o usuário digita com máscara', async () => {
    const { service, supplier } = makeService();

    await service.create(EMPRESA, {
      legalName: 'FORNECEDORA LTDA',
      document: '12.345.678/0001-90',
    });

    expect(supplier.create.mock.calls[0]![0].data).toMatchObject({
      companyId: EMPRESA,
      document: '12345678000190',
    });
  });

  it('CNPJ já sem máscara passa intacto', async () => {
    const { service, supplier } = makeService();

    await service.create(EMPRESA, {
      legalName: 'FORNECEDORA LTDA',
      document: '12345678000190',
    });

    expect(supplier.create.mock.calls[0]![0].data.document).toBe('12345678000190');
  });

  it('cadastrar o MESMO CNPJ com e sem máscara é recusado como duplicidade', async () => {
    const { service, supplier } = makeService();
    // A normalização faz as duas entradas colidirem na unique
    // `(companyId, document)` — antes dela, a segunda passava e virava um
    // segundo fornecedor para o mesmo CNPJ.
    supplier.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
        meta: { target: ['companyId', 'document'] },
      }),
    );

    await expect(
      service.create(EMPRESA, { legalName: 'DUPLICADA', document: '12.345.678/0001-90' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('editar não reintroduz a máscara', async () => {
    const { service, supplier } = makeService();

    await service.update(EMPRESA, 'sup-1', { document: '12.345.678/0001-90' });

    expect(supplier.update.mock.calls[0]![0].data.document).toBe('12345678000190');
  });

  it('editar sem tocar no documento não o sobrescreve', async () => {
    const { service, supplier } = makeService();

    await service.update(EMPRESA, 'sup-1', { legalName: 'NOVO NOME' });

    expect(supplier.update.mock.calls[0]![0].data).not.toHaveProperty('document');
  });

  it('busca por CNPJ mascarado encontra o registro gravado só com dígitos', async () => {
    const { service, supplier } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 20, search: '12.345.678' });

    const where = supplier.findMany.mock.calls[0]![0].where as {
      OR: { document?: { contains: string } }[];
    };
    const porDocumento = where.OR.find((clausula) => clausula.document);
    expect(porDocumento!.document!.contains).toBe('12345678');
  });

  it('busca por texto não vira busca vazia quando não há dígito nenhum', async () => {
    const { service, supplier } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 20, search: 'FORNECEDORA' });

    const where = supplier.findMany.mock.calls[0]![0].where as {
      OR: { document?: { contains: string } }[];
    };
    const porDocumento = where.OR.find((clausula) => clausula.document);
    // Sem dígitos, cai de volta no termo original em vez de procurar por "".
    expect(porDocumento!.document!.contains).toBe('FORNECEDORA');
  });

  it('toda consulta carrega o escopo da empresa', async () => {
    const { service, supplier } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 20 });

    expect((supplier.findMany.mock.calls[0]![0].where as { companyId: string }).companyId).toBe(
      EMPRESA,
    );
  });
});
