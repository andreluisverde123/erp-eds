import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPayablesController } from './account-payables.controller';
import { AccountPayablesService, mondayOf } from './account-payables.service';
import { ApprovePaymentDto } from './dto/approve-payment.dto';

/// PROGRAMAÇÃO DE PAGAMENTOS — o "resumo de sexta" do cliente: "toda sexta eu
/// faço um resumo com o que precisa ser pago [...] o financeiro consegue ver
/// por lá, e colocar em anexo as notas fiscais".

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const DIRETOR = '99999999-0000-4000-8000-000000000001';

function conta(overrides: Record<string, unknown>) {
  return {
    id: 'conta-1',
    companyId: EMPRESA,
    status: 'OPEN',
    origin: 'MANUAL',
    invoiceId: null,
    amount: new Prisma.Decimal(1000),
    dueDate: new Date('2026-09-30T00:00:00.000Z'),
    approvedForPaymentAt: null,
    approvedForPaymentById: null,
    approvedForPaymentBy: null,
    supplier: { id: 'f-1', legalName: 'Perini Materiais LTDA', tradeName: 'Perini' },
    costCenter: null,
    constructionSite: { id: 'o-1', code: 'OBR-001', name: 'Residencial Alfa' },
    invoice: null,
    description: 'Aluguel de andaime',
    payments: [] as { amount: Prisma.Decimal }[],
    ...overrides,
  };
}

function makeService(contas: ReturnType<typeof conta>[] = [], anexos: Record<string, number> = {}) {
  const prisma = {
    accountPayable: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) =>
        where.id ? contas.filter((c) => where.id!.in.includes(c.id)) : contas,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          contas.find((c) => c.id === where.id) ?? null,
      ),
      update: jest.fn(async () => ({})),
    },
    attachment: {
      groupBy: jest.fn(
        async ({ where }: { where: { entityType: string; entityId: { in: string[] } } }) =>
          where.entityId.in
            .filter((id) => anexos[`${where.entityType}:${id}`])
            .map((id) => ({ entityId: id, _count: { _all: anexos[`${where.entityType}:${id}`] } })),
      ),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService & {
    accountPayable: { update: jest.Mock; findMany: jest.Mock };
  };

  return { service: new AccountPayablesService(prisma), prisma };
}

describe('Programação de pagamentos', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-25T12:00:00.000Z') }); // sexta
  });
  afterEach(() => jest.useRealTimers());

  describe('a semana', () => {
    it('qualquer dia vira a segunda-feira da mesma semana', () => {
      expect(mondayOf(new Date('2026-09-25')).toISOString().slice(0, 10)).toBe('2026-09-21');
      expect(mondayOf(new Date('2026-09-21')).toISOString().slice(0, 10)).toBe('2026-09-21');
      // Domingo pertence à semana que começou na segunda anterior.
      expect(mondayOf(new Date('2026-09-27')).toISOString().slice(0, 10)).toBe('2026-09-21');
    });

    it('busca o que está em aberto e vence até o domingo, INCLUINDO o que já venceu', async () => {
      const { service, prisma } = makeService();

      const programacao = await service.getSchedule(EMPRESA, '2026-09-30');

      expect(programacao.weekStart).toBe('2026-09-28');
      expect(programacao.weekEnd).toBe('2026-10-04');
      const where = prisma.accountPayable.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        companyId: EMPRESA,
        deletedAt: null,
        status: { in: ['OPEN', 'PARTIAL'] },
        dueDate: { lt: new Date('2026-10-05T00:00:00.000Z') },
      });
      // Sem limite inferior: conta atrasada é a que mais precisa aparecer.
      expect(where.dueDate.gte).toBeUndefined();
    });
  });

  describe('as linhas e os totais', () => {
    it('mostra o que FALTA pagar, descontando pagamentos parciais', async () => {
      const { service } = makeService([
        conta({
          status: 'PARTIAL',
          payments: [{ amount: new Prisma.Decimal(400) }],
        }),
      ]);

      const { rows, totals } = await service.getSchedule(EMPRESA, '2026-09-30');

      expect(rows[0]!.remaining).toBe('600.00');
      expect(totals.total).toBe(600);
    });

    it('marca a vencida e separa liberado do que falta liberar', async () => {
      const { service } = makeService([
        conta({ id: 'atrasada', dueDate: new Date('2026-09-20T00:00:00.000Z') }),
        conta({
          id: 'liberada',
          amount: new Prisma.Decimal(250),
          approvedForPaymentAt: new Date('2026-09-25T10:00:00.000Z'),
        }),
      ]);

      const { rows, totals } = await service.getSchedule(EMPRESA, '2026-09-30');

      expect(rows.find((r) => r.id === 'atrasada')!.overdue).toBe(true);
      expect(rows.find((r) => r.id === 'liberada')!.overdue).toBe(false);
      expect(totals).toEqual({ total: 1250, overdue: 1000, approved: 250, pendingApproval: 1000 });
    });

    it('conta os anexos da conta e os da nota fiscal dela', async () => {
      const { service } = makeService([conta({ id: 'c-nf', invoiceId: 'nf-1' })], {
        'AccountPayable:c-nf': 1,
        'Invoice:nf-1': 2,
      });

      const { rows } = await service.getSchedule(EMPRESA, '2026-09-30');

      expect(rows[0]).toMatchObject({ attachmentsCount: 1, invoiceAttachmentsCount: 2 });
    });
  });

  describe('liberar para pagamento', () => {
    it('grava quem liberou e quando, uma atualização por conta (auditada)', async () => {
      const { service, prisma } = makeService([conta({ id: 'a' }), conta({ id: 'b' })]);

      const resultado = await service.approveForPayment(EMPRESA, DIRETOR, ['a', 'b']);

      expect(resultado).toEqual({ approved: 2 });
      expect(prisma.accountPayable.update).toHaveBeenCalledTimes(2);
      expect(prisma.accountPayable.update).toHaveBeenCalledWith({
        where: { id: 'a', companyId: EMPRESA },
        data: { approvedForPaymentAt: expect.any(Date), approvedForPaymentById: DIRETOR },
      });
    });

    it('a que já estava liberada mantém quem liberou primeiro', async () => {
      const { service, prisma } = makeService([
        conta({ id: 'a', approvedForPaymentAt: new Date('2026-09-24T00:00:00.000Z') }),
        conta({ id: 'b' }),
      ]);

      const resultado = await service.approveForPayment(EMPRESA, DIRETOR, ['a', 'b']);

      expect(resultado).toEqual({ approved: 1 });
      expect(prisma.accountPayable.update).toHaveBeenCalledTimes(1);
    });

    it('recusa conta paga ou cancelada', async () => {
      const { service } = makeService([conta({ id: 'a', status: 'PAID' })]);

      await expect(service.approveForPayment(EMPRESA, DIRETOR, ['a'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('recusa id que não é da empresa (não encontrado)', async () => {
      const { service } = makeService([conta({ id: 'a' })]);

      await expect(
        service.approveForPayment(EMPRESA, DIRETOR, ['a', 'de-outra-empresa']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a busca das contas carrega o escopo da empresa', async () => {
      const { service, prisma } = makeService([conta({ id: 'a' })]);

      await service.approveForPayment(EMPRESA, DIRETOR, ['a']);

      expect(prisma.accountPayable.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: EMPRESA,
        deletedAt: null,
      });
    });

    it('desfazer a liberação limpa quem e quando', async () => {
      const { service, prisma } = makeService([
        conta({ id: 'a', approvedForPaymentAt: new Date(), approvedForPaymentById: DIRETOR }),
      ]);

      await service.revokePaymentApproval(EMPRESA, 'a');

      expect(prisma.accountPayable.update).toHaveBeenCalledWith({
        where: { id: 'a', companyId: EMPRESA },
        data: { approvedForPaymentAt: null, approvedForPaymentById: null },
      });
    });
  });

  describe('editar a conta depois de liberada', () => {
    it('mudar o valor derruba a liberação', async () => {
      const { service, prisma } = makeService([
        conta({ id: 'a', approvedForPaymentAt: new Date() }),
      ]);

      await service.update(EMPRESA, 'a', { amount: 1200 });

      expect(prisma.accountPayable.update.mock.calls[0][0].data).toMatchObject({
        approvedForPaymentAt: null,
        approvedForPaymentById: null,
      });
    });

    it('mudar o vencimento derruba a liberação', async () => {
      const { service, prisma } = makeService([
        conta({ id: 'a', approvedForPaymentAt: new Date() }),
      ]);

      await service.update(EMPRESA, 'a', { dueDate: '2026-10-02' });

      expect(prisma.accountPayable.update.mock.calls[0][0].data).toMatchObject({
        approvedForPaymentAt: null,
      });
    });

    it('salvar com o mesmo valor e a mesma data mantém a liberação', async () => {
      const { service, prisma } = makeService([
        conta({ id: 'a', approvedForPaymentAt: new Date() }),
      ]);

      await service.update(EMPRESA, 'a', { amount: 1000, dueDate: '2026-09-30' });

      expect(prisma.accountPayable.update.mock.calls[0][0].data).not.toHaveProperty(
        'approvedForPaymentAt',
      );
    });
  });

  describe('permissões', () => {
    const permissoes = (metodo: keyof AccountPayablesController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, AccountPayablesController.prototype[metodo]) as
        string[] | undefined;

    it('liberar e desfazer exigem `financeiro.approve` (quem faz o resumo, não quem paga)', () => {
      expect(permissoes('approvePayment')).toEqual(['financeiro.approve']);
      expect(permissoes('revokePaymentApproval')).toEqual(['financeiro.approve']);
    });

    it('ver a programação e baixar o PDF ficam com a permissão da classe (`financeiro.view`)', () => {
      expect(permissoes('getSchedule')).toBeUndefined();
      expect(permissoes('exportSchedule')).toBeUndefined();
      expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountPayablesController)).toEqual([
        'financeiro.view',
      ]);
    });
  });

  describe('o pedido de liberação', () => {
    it('exige ao menos uma conta', async () => {
      const erros = await validate(plainToInstance(ApprovePaymentDto, { ids: [] }));
      expect(erros).not.toHaveLength(0);
    });

    it('recusa id que não é UUID', async () => {
      const erros = await validate(plainToInstance(ApprovePaymentDto, { ids: ['1; drop'] }));
      expect(erros).not.toHaveLength(0);
    });
  });
});
