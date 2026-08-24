import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountPayablesController } from './account-payables.controller';
import { AccountPayablesService } from './account-payables.service';
import { CreateAccountPayableDto } from './dto/create-account-payable.dto';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

const FORNECEDOR_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORNECEDOR_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const CC_OBRA = 'cccccccc-0000-4000-8000-000000000001';
const CC_ADM = 'cccccccc-0000-4000-8000-000000000002';
const CC_EMPRESA_B = 'cccccccc-0000-4000-8000-000000000009';
const OBRA = 'dddddddd-0000-4000-8000-000000000001';
const NOTA = 'eeeeeeee-0000-4000-8000-000000000001';

/// Cadastro das duas empresas. O dublê reproduz o filtro por `companyId`
/// porque é ele que sustenta o isolamento — um mock que aceitasse qualquer id
/// faria os testes de tenant passarem sem que o código filtrasse nada.
const FORNECEDORES = [
  { id: FORNECEDOR_A, companyId: EMPRESA_A },
  { id: FORNECEDOR_B, companyId: EMPRESA_B },
];

const CENTROS = [
  { id: CC_OBRA, companyId: EMPRESA_A, constructionSiteId: OBRA },
  // Centro administrativo: existe no modelo e NÃO pertence a obra nenhuma.
  { id: CC_ADM, companyId: EMPRESA_A, constructionSiteId: null },
  { id: CC_EMPRESA_B, companyId: EMPRESA_B, constructionSiteId: null },
];

const NOTAS = [
  {
    id: NOTA,
    companyId: EMPRESA_A,
    supplierId: FORNECEDOR_A,
    costCenterId: CC_OBRA,
    constructionSiteId: OBRA,
    /// Nota ainda não lançada. A guarda contra duplicar o lançamento lê esta
    /// lista — ver o teste "11. Não duplicação de Conta a Pagar".
    accountsPayable: [] as { id: string }[],
  },
];

/// Conta a pagar como o `includeArgs` a devolve, com a cadeia inteira:
/// obra <- solicitação <- ordem <- nota <- conta.
const LINHA_COM_ORIGEM = {
  id: 'conta-1',
  companyId: EMPRESA_A,
  status: 'OPEN',
  origin: 'INVOICE',
  supplier: { id: FORNECEDOR_A, legalName: 'Perini Materiais LTDA', tradeName: 'Perini' },
  costCenter: { id: CC_OBRA, code: 'CC-001', name: 'Residencial Alfa' },
  constructionSite: { id: OBRA, code: 'OBR-001', name: 'Residencial Alfa' },
  invoice: {
    id: NOTA,
    number: '000456',
    series: '1',
    status: 'VALIDATED',
    purchaseOrder: {
      id: 'oc-1',
      code: 'OC-000123',
      status: 'OPEN',
      purchaseRequest: { id: 'sol-1', code: 'REQ-000789', status: 'APPROVED' },
    },
    inboundInvoices: [{ id: 'nfe-1', number: '000456', series: '1', accessKey: '3'.repeat(44) }],
  },
  payments: [],
};

function makeService() {
  const criadas: { data: Record<string, unknown> }[] = [];

  const escopo =
    <T extends { id: string; companyId: string }>(linhas: T[]) =>
    async ({ where }: { where: { id?: string; companyId: string } }) =>
      linhas.find((linha) => linha.id === where.id && linha.companyId === where.companyId) ?? null;

  const prisma = {
    supplier: { findFirst: jest.fn(escopo(FORNECEDORES)) },
    costCenter: { findFirst: jest.fn(escopo(CENTROS)) },
    invoice: { findFirst: jest.fn(escopo(NOTAS)) },
    accountPayable: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        criadas.push(args);
        return { id: 'conta-1' };
      }),
      /// Devolve a linha no formato do `includeArgs` — com fornecedor, centro,
      /// obra e a nota com a cadeia até a solicitação. É o que o `findOne`
      /// atravessa para montar a origem da despesa.
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === EMPRESA_A ? { ...LINHA_COM_ORIGEM } : null,
      ),
      findMany: jest.fn(async () => [{ ...LINHA_COM_ORIGEM }]),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => ({ id: 'conta-1' })),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  return { service: new AccountPayablesService(prisma), prisma, criadas };
}

const BASE_MANUAL = {
  supplierId: FORNECEDOR_A,
  description: 'Aluguel do canteiro — agosto',
  costCenterId: CC_OBRA,
  amount: 3500,
  dueDate: '2026-09-10',
};

const dados = (criadas: { data: Record<string, unknown> }[]) => criadas[0]!.data;

describe('AccountPayablesService — conta a pagar avulsa', () => {
  describe('1, 2 e 3. Criar conta avulsa, sem ordem de compra e sem NF-e', () => {
    it('cria a conta sem nota nenhuma, marcada como MANUAL', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      expect(dados(criadas)).toMatchObject({
        companyId: EMPRESA_A,
        origin: 'MANUAL',
        invoiceId: null,
        description: 'Aluguel do canteiro — agosto',
        amount: 3500,
      });
    });

    it('não toca em ordem de compra nem em nota fiscal', async () => {
      const { service, prisma, criadas } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
      expect(dados(criadas)).not.toHaveProperty('purchaseOrderId');
    });

    it('nasce OPEN, para seguir pelo fluxo de pagamento que já existe', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      // `status` não é enviado: o default do schema é OPEN e quem o move
      // daqui em diante é o `recalculateStatus`, a partir dos pagamentos.
      expect(dados(criadas)).not.toHaveProperty('status');
    });

    it('usa `create` (auditado) e não `createMany`', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      // A extensão de auditoria só cobre `create`/`update` de nível superior.
      // Trocar por `createMany` faria o lançamento manual deixar de registrar
      // quem criou — que é exatamente o que se precisa saber num lançamento
      // sem documento.
      expect(prisma.accountPayable.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Fornecedor existente', () => {
    it('vincula o fornecedor escolhido do cadastro', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      expect(dados(criadas).supplierId).toBe(FORNECEDOR_A);
    });

    it('recusa fornecedor inexistente', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, {
          ...BASE_MANUAL,
          supplierId: '99999999-9999-4999-8999-999999999999',
        }),
      ).rejects.toThrow(/Fornecedor informado não existe/);
    });
  });

  describe('5 e 6. Obra e centro de custo', () => {
    it('a obra é DERIVADA do centro de custo, não escolhida à parte', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      expect(dados(criadas)).toMatchObject({
        costCenterId: CC_OBRA,
        constructionSiteId: OBRA,
      });
    });

    it('centro administrativo gera conta SEM obra', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, { ...BASE_MANUAL, costCenterId: CC_ADM });

      // É assim que a despesa administrativa entra: o centro existe e não
      // pertence a obra nenhuma. Mesmo comportamento da solicitação de compra.
      expect(dados(criadas)).toMatchObject({
        costCenterId: CC_ADM,
        constructionSiteId: null,
      });
    });

    it('recusa centro de custo inexistente', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, {
          ...BASE_MANUAL,
          costCenterId: '99999999-9999-4999-8999-999999999999',
        }),
      ).rejects.toThrow(/Centro de custo informado não existe/);
    });
  });

  describe('7 e 8. Valor e vencimento inválidos', () => {
    async function erros(payload: Record<string, unknown>) {
      const dto = plainToInstance(CreateAccountPayableDto, payload);
      return validate(dto);
    }

    it.each([
      ['valor zero', { amount: 0 }],
      ['valor negativo', { amount: -100 }],
      ['valor não numérico', { amount: 'muito' }],
      ['vencimento inválido', { dueDate: '10/09/2026' }],
      ['vencimento ausente', { dueDate: undefined }],
    ])('recusa %s', async (_caso, override) => {
      await expect(erros({ ...BASE_MANUAL, ...override })).resolves.not.toHaveLength(0);
    });

    it.each([
      ['fornecedor ausente', { supplierId: undefined }],
      ['descrição vazia', { description: '' }],
      ['centro de custo ausente', { costCenterId: undefined }],
    ])('sem nota, recusa %s', async (_caso, override) => {
      await expect(erros({ ...BASE_MANUAL, ...override })).resolves.not.toHaveLength(0);
    });

    it('forma de pagamento fora do enum é recusada', async () => {
      await expect(
        erros({ ...BASE_MANUAL, paymentMethod: 'TRANSFERENCIA' }),
      ).resolves.not.toHaveLength(0);
    });

    it('aceita as formas de pagamento que o sistema já tem', async () => {
      for (const metodo of ['PIX', 'BANK_SLIP', 'CREDIT_CARD', 'CASH']) {
        await expect(erros({ ...BASE_MANUAL, paymentMethod: metodo })).resolves.toHaveLength(0);
      }
    });

    it('o lançamento avulso é válido sem os campos opcionais', async () => {
      await expect(erros(BASE_MANUAL)).resolves.toHaveLength(0);
    });
  });

  describe('10, 11 e 14. Isolamento multi-tenant', () => {
    it('recusa fornecedor de OUTRA empresa', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, { ...BASE_MANUAL, supplierId: FORNECEDOR_B }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa centro de custo (obra) de OUTRA empresa', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, { ...BASE_MANUAL, costCenterId: CC_EMPRESA_B }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa nota fiscal de OUTRA empresa', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_B, { invoiceId: NOTA, dueDate: '2026-09-10', amount: 100 }),
      ).rejects.toThrow(/Nota fiscal informada não existe/);
    });

    it('a mensagem não revela que o registro existe em outro tenant', async () => {
      const { service } = makeService();

      const deOutraEmpresa = await service
        .create(EMPRESA_A, { ...BASE_MANUAL, supplierId: FORNECEDOR_B })
        .catch((erro: Error) => erro.message);
      const inexistente = await service
        .create(EMPRESA_A, {
          ...BASE_MANUAL,
          supplierId: '99999999-9999-4999-8999-999999999999',
        })
        .catch((erro: Error) => erro.message);

      expect(deOutraEmpresa).toBe(inexistente);
    });

    it('a conta nasce sempre com o companyId do token', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      expect(dados(criadas).companyId).toBe(EMPRESA_A);
    });

    it('toda consulta de cadastro carrega o escopo da empresa', async () => {
      const { service, prisma } = makeService();

      await service.create(EMPRESA_A, BASE_MANUAL);

      for (const mock of [prisma.supplier.findFirst, prisma.costCenter.findFirst]) {
        expect((mock as jest.Mock).mock.calls[0]![0].where.companyId).toBe(EMPRESA_A);
      }
    });

    it('não é possível abrir conta de outra empresa', async () => {
      const { service } = makeService();

      await expect(service.findOne(EMPRESA_B, 'conta-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('12. Listagem', () => {
    it('o filtro de fornecedor vai DIRETO na conta, não pela nota', async () => {
      const { service, prisma } = makeService();

      await service.findAll(EMPRESA_A, { page: 1, limit: 10, supplierId: FORNECEDOR_A });

      const where = (prisma.accountPayable.findMany as jest.Mock).mock.calls[0]![0].where;
      // Se fosse `invoice: { supplierId }`, toda conta avulsa sumiria da
      // listagem — filtro de relação exige que a relação exista.
      expect(where.supplierId).toBe(FORNECEDOR_A);
      expect(where.invoice).toBeUndefined();
    });

    it('a busca alcança descrição e documento do lançamento avulso', async () => {
      const { service, prisma } = makeService();

      await service.findAll(EMPRESA_A, { page: 1, limit: 10, search: 'aluguel' });

      const where = (prisma.accountPayable.findMany as jest.Mock).mock.calls[0]![0].where;
      const campos = (where.OR as Record<string, unknown>[]).map((c) => Object.keys(c)[0]);
      expect(campos).toEqual(
        expect.arrayContaining(['description', 'documentNumber', 'invoice', 'supplier']),
      );
    });

    it('sem busca nem filtro, nenhuma cláusula esconde as contas avulsas', async () => {
      const { service, prisma } = makeService();

      await service.findAll(EMPRESA_A, { page: 1, limit: 10 });

      const where = (prisma.accountPayable.findMany as jest.Mock).mock.calls[0]![0].where;
      expect(where.OR).toBeUndefined();
      expect(where.invoice).toBeUndefined();
    });

    it('dá para filtrar só o que é avulso', async () => {
      const { service, prisma } = makeService();

      await service.findAll(EMPRESA_A, { page: 1, limit: 10, origin: 'MANUAL' });

      const where = (prisma.accountPayable.findMany as jest.Mock).mock.calls[0]![0].where;
      expect(where.origin).toBe('MANUAL');
    });
  });

  describe('14 e 15. O fluxo com nota fiscal continua igual', () => {
    it('com invoiceId, a conta nasce INVOICE e derivada da nota', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, { invoiceId: NOTA, dueDate: '2026-09-10', amount: 1000 });

      expect(dados(criadas)).toMatchObject({
        origin: 'INVOICE',
        invoiceId: NOTA,
        supplierId: FORNECEDOR_A,
        costCenterId: CC_OBRA,
        constructionSiteId: OBRA,
        description: null,
      });
    });

    it('com nota, fornecedor e centro enviados pelo cliente são IGNORADOS', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, {
        invoiceId: NOTA,
        dueDate: '2026-09-10',
        amount: 1000,
        // A nota manda: ela já foi conferida, e deixar o cliente sobrescrever
        // reabriria por aqui o que a conciliação garante.
        supplierId: FORNECEDOR_B,
        costCenterId: CC_ADM,
      });

      expect(dados(criadas)).toMatchObject({
        supplierId: FORNECEDOR_A,
        costCenterId: CC_OBRA,
      });
    });

    it('com invoiceId, o DTO não exige fornecedor, descrição nem centro', async () => {
      const dto = plainToInstance(CreateAccountPayableDto, {
        invoiceId: NOTA,
        dueDate: '2026-09-10',
        amount: 1000,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('recusa nota inexistente', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, {
          invoiceId: '99999999-9999-4999-8999-999999999999',
          dueDate: '2026-09-10',
          amount: 100,
        }),
      ).rejects.toThrow(/Nota fiscal informada não existe/);
    });
  });

  describe('9. Permissões (RBAC existente, sem regra nova)', () => {
    /// Lê a permissão declarada no handler. Um teste de metadado, e não de
    /// requisição, porque o `PermissionsGuard` já é testado pelo próprio
    /// framework — o que pode quebrar aqui é alguém REMOVER o decorator.
    const permissaoDe = (metodo: keyof AccountPayablesController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, AccountPayablesController.prototype[metodo]) as
        string[] | undefined;

    it('lançar exige `financeiro.manage`', () => {
      expect(permissaoDe('create')).toEqual(['financeiro.manage']);
    });

    it('quem só consulta não lança', () => {
      // O controller inteiro exige `financeiro.view`; o POST soma `.manage`.
      // Um usuário com apenas `.view` cai no guard antes de chegar ao service.
      expect(permissaoDe('create')).not.toContain('financeiro.view');
      expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountPayablesController)).toEqual([
        'financeiro.view',
      ]);
    });

    it('o lançamento avulso NÃO criou permissão nova', () => {
      const usadas = (['create', 'update', 'updateStatus', 'remove'] as const).flatMap(
        (metodo) => permissaoDe(metodo) ?? [],
      );
      expect(new Set(usadas)).toEqual(new Set(['financeiro.manage']));
    });
  });

  describe('13. Fluxo de pagamento existente, sem caminho novo', () => {
    it('a regra de edição não mudou: só conta em aberto', async () => {
      const { service, prisma } = makeService();
      (prisma.accountPayable.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'conta-1',
        companyId: EMPRESA_A,
        status: 'PARTIAL',
      });

      await expect(service.update(EMPRESA_A, 'conta-1', { amount: 10 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('cancelar continua valendo só a partir de OPEN', async () => {
      const { service, prisma } = makeService();
      (prisma.accountPayable.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'conta-1',
        companyId: EMPRESA_A,
        status: 'PAID',
      });

      await expect(service.updateStatus(EMPRESA_A, 'conta-1', 'CANCELLED')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
  // ---------------------------------------------------------------------------
  // Integração Engenharia -> Financeiro
  // ---------------------------------------------------------------------------

  describe('5 e 8. A conta a pagar exibe a origem operacional', () => {
    it('o detalhe traz obra, solicitação, ordem, fornecedor e nota', async () => {
      const { service } = makeService();

      const { traceability } = await service.findOne(EMPRESA_A, 'conta-1');

      expect(traceability.constructionSite?.name).toBe('Residencial Alfa');
      expect(traceability.purchaseRequest?.code).toBe('REQ-000789');
      expect(traceability.purchaseOrder?.code).toBe('OC-000123');
      expect(traceability.supplier.tradeName).toBe('Perini');
      expect(traceability.invoice?.number).toBe('000456');
      expect(traceability.inboundInvoice?.accessKey).toHaveLength(44);
      expect(traceability.depth).toBe('PURCHASE_REQUEST');
    });

    it('a LISTAGEM também traz a origem — o financeiro não precisa abrir conta por conta', async () => {
      const { service } = makeService();

      const { data } = await service.findAll(EMPRESA_A, { page: 1, limit: 10 });

      expect(data[0]!.traceability.purchaseOrder?.code).toBe('OC-000123');
    });

    it('a origem sai por relacionamento — nenhuma coluna nova foi gravada na conta', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, { ...BASE_MANUAL });

      const gravado = Object.keys(dados(criadas));
      expect(gravado).not.toContain('purchaseOrderId');
      expect(gravado).not.toContain('purchaseRequestId');
      expect(gravado).not.toContain('purchaseOrderCode');
      expect(gravado).not.toContain('constructionSiteName');
    });
  });

  describe('11. Não duplicação de Conta a Pagar', () => {
    it('recusa um segundo lançamento para uma nota que já tem parcelas', async () => {
      const { service, prisma } = makeService();
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValueOnce({
        ...NOTAS[0],
        accountsPayable: [{ id: 'conta-1' }, { id: 'conta-2' }],
      });

      await expect(
        service.create(EMPRESA_A, { ...BASE_MANUAL, invoiceId: NOTA }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('a mensagem diz quantas parcelas já existem e manda usar o lançamento atual', async () => {
      const { service, prisma } = makeService();
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValueOnce({
        ...NOTAS[0],
        accountsPayable: [{ id: 'conta-1' }],
      });

      await expect(service.create(EMPRESA_A, { ...BASE_MANUAL, invoiceId: NOTA })).rejects.toThrow(
        /já tem 1 conta\(s\) a pagar/,
      );
    });

    it('nada é gravado quando a duplicação é recusada', async () => {
      const { service, prisma, criadas } = makeService();
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValueOnce({
        ...NOTAS[0],
        accountsPayable: [{ id: 'conta-1' }],
      });

      await service.create(EMPRESA_A, { ...BASE_MANUAL, invoiceId: NOTA }).catch(() => undefined);

      expect(criadas).toHaveLength(0);
    });

    it('nota ainda não lançada continua virando conta normalmente', async () => {
      const { service, criadas } = makeService();

      await service.create(EMPRESA_A, { ...BASE_MANUAL, invoiceId: NOTA });

      expect(criadas).toHaveLength(1);
      expect(dados(criadas).origin).toBe('INVOICE');
    });
  });

  describe('10. Isolamento entre empresas na cadeia inteira', () => {
    it('a empresa B não enxerga a conta da empresa A, nem a origem dela', async () => {
      const { service } = makeService();

      await expect(service.findOne(EMPRESA_B, 'conta-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a listagem da empresa B não devolve conta da empresa A', async () => {
      const { service, prisma } = makeService();
      (prisma.accountPayable.findMany as jest.Mock).mockResolvedValueOnce([]);

      const { data } = await service.findAll(EMPRESA_B, { page: 1, limit: 10 });

      expect(data).toHaveLength(0);
      // O filtro por empresa é do WHERE, não de um `filter` depois da consulta.
      expect((prisma.accountPayable.findMany as jest.Mock).mock.calls[0]![0].where).toMatchObject({
        companyId: EMPRESA_B,
      });
    });

    it('nota de outra empresa não é alcançável nem para lançar conta', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_B, { ...BASE_MANUAL, invoiceId: NOTA }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
