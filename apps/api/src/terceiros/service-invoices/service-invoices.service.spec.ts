import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import { AttachmentsService } from '../../attachments/attachments.service';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceInvoiceDto } from './dto/create-service-invoice.dto';
import { situationOf } from './service-invoice-situation';
import { ServiceInvoicesController } from './service-invoices.controller';
import { ServiceInvoicesService } from './service-invoices.service';

/// "Quem lança terceirizado e nota é a engenharia (nós que contratamos); o
/// financeiro só vai pagar o que foi autorizado." Exemplo do cliente: conserto
/// de uma bomba na fazenda, R$ 1.000, com nota e sem contrato.

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const ENGENHEIRA = '99999999-0000-4000-8000-000000000001';
const TERCEIRIZADO = 'aaaaaaaa-0000-4000-8000-000000000001';
const FAZENDA = 'cccccccc-0000-4000-8000-000000000001';

const BOMBA: CreateServiceInvoiceDto = {
  contractorId: TERCEIRIZADO,
  costCenterId: FAZENDA,
  documentNumber: ' 4521 ',
  description: 'Conserto da bomba da fazenda',
  amount: 1000,
  dueDate: '2026-10-05',
};

function linha(extra: Record<string, unknown> = {}) {
  return {
    id: 'conta-1',
    documentNumber: '4521',
    description: 'Conserto da bomba da fazenda',
    notes: null,
    amount: new Prisma.Decimal(1000),
    issueDate: null,
    dueDate: new Date('2026-10-05T00:00:00.000Z'),
    status: 'OPEN',
    createdAt: new Date(),
    approvedForPaymentAt: null,
    approvedForPaymentBy: null,
    launchedBy: { id: ENGENHEIRA, name: 'Ana' },
    contractor: {
      id: TERCEIRIZADO,
      legalName: 'Bombas Silva ME',
      tradeName: null,
      document: '11222333000181',
    },
    costCenter: { id: FAZENDA, code: 'ADM-02', name: 'Fazenda' },
    constructionSite: null,
    ...extra,
  };
}

function makeService({
  terceirizado = true,
  centro = true,
  fornecedorExistente = false,
  repetida = false,
  conta = linha() as Record<string, unknown> | null,
  pagamentos = 0,
}: {
  terceirizado?: boolean;
  centro?: boolean;
  fornecedorExistente?: boolean;
  repetida?: boolean;
  conta?: Record<string, unknown> | null;
  pagamentos?: number;
} = {}) {
  const prisma = {
    contractor: {
      findFirst: jest.fn(async () =>
        terceirizado
          ? {
              id: TERCEIRIZADO,
              legalName: 'Bombas Silva ME',
              tradeName: null,
              document: '11.222.333/0001-81',
              email: null,
              phone: '95999990000',
              city: 'Boa Vista',
              state: 'RR',
            }
          : null,
      ),
    },
    costCenter: {
      findFirst: jest.fn(async () => (centro ? { id: FAZENDA, constructionSiteId: null } : null)),
    },
    supplier: {
      findFirst: jest.fn(async () => (fornecedorExistente ? { id: 'fornecedor-existente' } : null)),
      create: jest.fn(async () => ({ id: 'fornecedor-novo' })),
    },
    accountPayable: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        'documentNumber' in where ? (repetida ? { id: 'outra' } : null) : conta,
      ),
      findMany: jest.fn(async () => [linha()]),
      count: jest.fn(async () => 1),
      create: jest.fn(async () => linha()),
      update: jest.fn(async () => linha({ status: 'CANCELLED' })),
    },
    payment: { count: jest.fn(async () => pagamentos) },
    attachment: { groupBy: jest.fn(async () => [{ entityId: 'conta-1', _count: { _all: 1 } }]) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService & {
    accountPayable: Record<string, jest.Mock>;
    supplier: Record<string, jest.Mock>;
  };
  const attachments = {
    uploadForServiceInvoice: jest.fn(async () => ({ id: 'anexo-1' })),
    listForServiceInvoice: jest.fn(async () => []),
  } as unknown as AttachmentsService & { uploadForServiceInvoice: jest.Mock };

  return { service: new ServiceInvoicesService(prisma, attachments), prisma, attachments };
}

describe('Notas de serviço de terceirizado', () => {
  describe('lançar', () => {
    it('vira conta a pagar comum, com o terceirizado e quem lançou', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA, ENGENHEIRA, BOMBA);

      expect(prisma.accountPayable.create.mock.calls[0][0].data).toMatchObject({
        companyId: EMPRESA,
        origin: 'MANUAL',
        contractorId: TERCEIRIZADO,
        launchedById: ENGENHEIRA,
        costCenterId: FAZENDA,
        documentNumber: '4521',
        amount: 1000,
      });
    });

    it('NÃO nasce liberada: quem libera é o responsável, na Programação de Pagamentos', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA, ENGENHEIRA, BOMBA);

      expect(prisma.accountPayable.create.mock.calls[0][0].data).not.toHaveProperty(
        'approvedForPaymentAt',
      );
    });

    it('centro administrativo (a fazenda) gera conta sem obra', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA, ENGENHEIRA, BOMBA);

      expect(prisma.accountPayable.create.mock.calls[0][0].data.constructionSiteId).toBeNull();
    });

    it('o terceirizado vira fornecedor pelo CNPJ (só dígitos)', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA, ENGENHEIRA, BOMBA);

      expect(prisma.supplier.findFirst.mock.calls[0][0].where).toEqual({
        companyId: EMPRESA,
        document: '11222333000181',
        deletedAt: null,
      });
      expect(prisma.supplier.create.mock.calls[0][0].data).toMatchObject({
        companyId: EMPRESA,
        legalName: 'Bombas Silva ME',
        document: '11222333000181',
      });
      expect(prisma.accountPayable.create.mock.calls[0][0].data.supplierId).toBe('fornecedor-novo');
    });

    it('reaproveita o fornecedor que já existe com o mesmo CNPJ', async () => {
      const { service, prisma } = makeService({ fornecedorExistente: true });

      await service.create(EMPRESA, ENGENHEIRA, BOMBA);

      expect(prisma.supplier.create).not.toHaveBeenCalled();
      expect(prisma.accountPayable.create.mock.calls[0][0].data.supplierId).toBe(
        'fornecedor-existente',
      );
    });

    it('recusa lançar a mesma nota do mesmo terceirizado duas vezes', async () => {
      const { service } = makeService({ repetida: true });

      await expect(service.create(EMPRESA, ENGENHEIRA, BOMBA)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('terceirizado ou centro de outra empresa: recusado', async () => {
      await expect(
        makeService({ terceirizado: false }).service.create(EMPRESA, ENGENHEIRA, BOMBA),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        makeService({ centro: false }).service.create(EMPRESA, ENGENHEIRA, BOMBA),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('contrato NÃO é exigido', async () => {
      const erros = await validate(plainToInstance(CreateServiceInvoiceDto, BOMBA));
      expect(erros).toHaveLength(0);
    });
  });

  describe('o recorte: a Engenharia só enxerga as notas de serviço', () => {
    it('a lista traz só contas com terceirizado, da empresa', async () => {
      const { service, prisma } = makeService();

      await service.findAll(EMPRESA, { page: 1, limit: 10 });

      expect(prisma.accountPayable.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: EMPRESA,
        deletedAt: null,
        contractorId: { not: null },
      });
    });

    it('conta do Financeiro (sem terceirizado) responde "não encontrada"', async () => {
      const { service } = makeService({ conta: null });

      await expect(service.listFiles(EMPRESA, 'conta-do-financeiro')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.cancel(EMPRESA, 'conta-do-financeiro')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('a busca pela conta exige terceirizado preenchido', async () => {
      const { service, prisma } = makeService();

      await service.listFiles(EMPRESA, 'conta-1');

      expect(prisma.accountPayable.findFirst.mock.calls[0][0].where).toMatchObject({
        companyId: EMPRESA,
        contractorId: { not: null },
      });
    });

    it('o arquivo da nota vai para os anexos da CONTA (o Financeiro vê na Programação)', async () => {
      const { service, attachments } = makeService();
      const arquivo = { originalname: 'nf-4521.pdf' } as Express.Multer.File;

      await service.uploadFile(EMPRESA, ENGENHEIRA, 'conta-1', arquivo);

      expect(attachments.uploadForServiceInvoice).toHaveBeenCalledWith(
        EMPRESA,
        ENGENHEIRA,
        'conta-1',
        arquivo,
      );
    });
  });

  describe('situação vista pela Engenharia', () => {
    it.each([
      ['OPEN', null, 'AGUARDANDO_LIBERACAO'],
      ['OPEN', new Date(), 'LIBERADA'],
      ['PARTIAL', new Date(), 'PAGA_PARCIAL'],
      ['PAID', new Date(), 'PAGA'],
      ['CANCELLED', null, 'CANCELADA'],
    ] as const)('%s, liberada em %s → %s', (status, approvedForPaymentAt, esperado) => {
      expect(situationOf({ status, approvedForPaymentAt })).toBe(esperado);
    });
  });

  describe('cancelar', () => {
    it('cancela a nota lançada por engano, enquanto ninguém mexeu nela', async () => {
      const { service, prisma } = makeService();

      await service.cancel(EMPRESA, 'conta-1');

      expect(prisma.accountPayable.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED' });
    });

    it('já liberada: só quem liberou desfaz', async () => {
      const { service } = makeService({ conta: linha({ approvedForPaymentAt: new Date() }) });

      await expect(service.cancel(EMPRESA, 'conta-1')).rejects.toThrow(/já foi liberada/);
    });

    it('com pagamento: assunto do Financeiro', async () => {
      await expect(
        makeService({ pagamentos: 1 }).service.cancel(EMPRESA, 'conta-1'),
      ).rejects.toThrow(/pagamento/);
      await expect(
        makeService({ conta: linha({ status: 'PAID' }) }).service.cancel(EMPRESA, 'conta-1'),
      ).rejects.toThrow(/pagamento/);
    });
  });

  describe('permissões: as de Terceirizados, não as do Financeiro', () => {
    const permissoes = (metodo: keyof ServiceInvoicesController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, ServiceInvoicesController.prototype[metodo]) as
        string[] | undefined;

    it('ver é `terceiros.view`; lançar, cancelar e anexar é `terceiros.manage`', () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, ServiceInvoicesController)).toEqual([
        'terceiros.view',
      ]);
      expect(permissoes('create')).toEqual(['terceiros.manage']);
      expect(permissoes('cancel')).toEqual(['terceiros.manage']);
      expect(permissoes('uploadFile')).toEqual(['terceiros.manage']);
      expect(permissoes('findAll')).toBeUndefined();
    });
  });
});
