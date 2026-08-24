import { Logger } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InboundInvoicesService } from './inbound-invoices.service';

/// Regressão do fluxo que já existia: NF-e -> Conciliação -> Conta a Pagar.
///
/// A conta a pagar deixou de exigir nota (para permitir o lançamento avulso),
/// e `origin`/`supplierId` passaram a ser obrigatórios na criação. Este teste
/// existe para garantir que a conciliação continua produzindo exatamente as
/// mesmas parcelas de antes — agora com a origem declarada.

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const FORNECEDOR = 'aaaaaaaa-0000-4000-8000-000000000001';
const CENTRO = 'cccccccc-0000-4000-8000-000000000001';
const OBRA = 'dddddddd-0000-4000-8000-000000000001';

function makeService() {
  const parcelasCriadas: Record<string, unknown>[] = [];
  const notasCriadas: Record<string, unknown>[] = [];

  const tx = {
    invoice: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        notasCriadas.push(data);
        return { id: 'nota-financeiro-1' };
      }),
    },
    accountPayable: {
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        parcelasCriadas.push(...data);
        return { count: data.length };
      }),
    },
    inboundInvoice: { update: jest.fn() },
  };

  const notaRecebida = {
    id: 'nota-recebida-1',
    companyId: EMPRESA,
    status: 'PENDING' as const,
    number: '12345',
    series: '1',
    issueDate: new Date('2026-08-01T00:00:00Z'),
    totalAmount: new Prisma.Decimal('1500.00'),
    supplierId: FORNECEDOR,
    supplierName: 'FORNECEDORA LTDA',
    supplierDocument: '12345678000190',
    items: [],
  };

  const prisma = {
    inboundInvoice: {
      findFirst: jest.fn(async () => notaRecebida),
      groupBy: jest.fn(async () => []),
    },
    purchaseOrder: { findFirst: jest.fn(async () => null) },
    costCenter: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; companyId: string } }) =>
        where.id === CENTRO && where.companyId === EMPRESA
          ? { id: CENTRO, constructionSiteId: OBRA }
          : null,
      ),
    },
    supplier: { findFirst: jest.fn(async () => ({ id: FORNECEDOR })) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (c: typeof tx) => Promise<unknown>)(tx) : arg,
    ),
  } as unknown as PrismaService;

  const service = new InboundInvoicesService(prisma, {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLoggerService);

  return { service, parcelasCriadas, notasCriadas, tx };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('Conciliação -> Conta a Pagar (regressão)', () => {
  it('a parcela nasce com origem INVOICE, presa à nota criada', async () => {
    const { service, parcelasCriadas, notasCriadas } = makeService();

    await service.reconcile(EMPRESA, USUARIO, undefined, 'nota-recebida-1', {
      costCenterId: CENTRO,
      paymentMethod: 'PIX',
      paymentTerms: 'CASH',
    });

    expect(notasCriadas).toHaveLength(1);
    expect(parcelasCriadas).toHaveLength(1);
    expect(parcelasCriadas[0]).toMatchObject({
      companyId: EMPRESA,
      origin: 'INVOICE',
      invoiceId: 'nota-financeiro-1',
    });
  });

  it('a parcela carrega fornecedor, centro de custo e obra da nota', async () => {
    const { service, parcelasCriadas } = makeService();

    await service.reconcile(EMPRESA, USUARIO, undefined, 'nota-recebida-1', {
      costCenterId: CENTRO,
      paymentMethod: 'PIX',
      paymentTerms: 'CASH',
    });

    // Antes desta etapa esses dados só existiam por travessia até a nota.
    // Agora vivem na parcela — e precisam bater com o que a nota diz.
    expect(parcelasCriadas[0]).toMatchObject({
      supplierId: FORNECEDOR,
      costCenterId: CENTRO,
      constructionSiteId: OBRA,
    });
  });

  it('o parcelamento continua funcionando: 30/60/90 gera três parcelas', async () => {
    const { service, parcelasCriadas } = makeService();

    await service.reconcile(EMPRESA, USUARIO, undefined, 'nota-recebida-1', {
      costCenterId: CENTRO,
      paymentMethod: 'BANK_SLIP',
      paymentTerms: 'NET_30_60_90',
    });

    expect(parcelasCriadas).toHaveLength(3);
    // Todas com a mesma origem e ancoragem — nenhuma parcela órfã.
    for (const parcela of parcelasCriadas) {
      expect(parcela).toMatchObject({ origin: 'INVOICE', supplierId: FORNECEDOR });
    }
    const soma = parcelasCriadas.reduce(
      (total, parcela) => total.plus(parcela.amount as Prisma.Decimal),
      new Prisma.Decimal(0),
    );
    expect(soma.toString()).toBe('1500');
  });
});
