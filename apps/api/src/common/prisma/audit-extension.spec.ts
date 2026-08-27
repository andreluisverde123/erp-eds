import { createAuditExtension } from './audit-extension';
import { auditContextStorage } from '../audit-context';
import type { PrismaClient } from '../../../generated/prisma/client';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const REGISTRO = '33333333-3333-4333-8333-333333333333';

/// Dublê do cliente NÃO estendido: devolve o "antes" na primeira leitura e o
/// "depois" na segunda, que é exatamente como a extensão o consome.
function makeBase(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  delegate = 'purchaseRequest',
) {
  const logs: Record<string, unknown>[] = [];
  let leituras = 0;

  const base = {
    [delegate]: {
      findUnique: jest.fn(async () => {
        leituras += 1;
        return leituras === 1 ? antes : depois;
      }),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        logs.push(data);
        return data;
      }),
    },
  } as unknown as PrismaClient;

  return { base, logs };
}

async function rodarUpdate(base: PrismaClient, model = 'PurchaseRequest'): Promise<void> {
  const extension = createAuditExtension(base);
  await auditContextStorage.run({ userId: USUARIO, companyId: EMPRESA }, () =>
    extension.query.$allModels.$allOperations({
      model,
      operation: 'update',
      args: { where: { id: REGISTRO } },
      query: async () => ({ id: REGISTRO }),
    }),
  );
}

describe('audit-extension — campos que o service registra por conta própria', () => {
  it('não duplica o desconto da solicitação no diff genérico', async () => {
    // O `updateQuote` já grava "Desconto geral: sem desconto → R$ 150,00".
    // O par cru sairia como duas linhas que não dizem se são reais ou por
    // cento — e ao lado da entrada boa, no mesmo histórico.
    const { base, logs } = makeBase(
      { status: 'QUOTING', discountType: 'AMOUNT', discountValue: 0 },
      { status: 'QUOTING', discountType: 'PERCENT', discountValue: 150 },
    );

    await rodarUpdate(base);

    expect(logs).toHaveLength(0);
  });

  it('continua registrando os demais campos da solicitação', async () => {
    const { base, logs } = makeBase(
      { status: 'PENDING', discountValue: 0 },
      { status: 'QUOTING', discountValue: 0 },
    );

    await rodarUpdate(base);

    expect(logs).toHaveLength(1);
    expect(logs[0]!.changes).toEqual({ status: { from: 'PENDING', to: 'QUOTING' } });
  });

  it('a exclusão é por MODELO, não pelo nome do campo', async () => {
    // O MESMO campo, no mesmo diff, em dois modelos auditados diferentes:
    // silenciado na solicitação (que o registra sozinha) e registrado no
    // fornecedor, que não o declara.
    const solicitacao = makeBase({ discountValue: 0 }, { discountValue: 150 });
    await rodarUpdate(solicitacao.base, 'PurchaseRequest');
    expect(solicitacao.logs).toHaveLength(0);

    const fornecedor = makeBase({ discountValue: 0 }, { discountValue: 150 }, 'supplier');
    await rodarUpdate(fornecedor.base, 'Supplier');

    expect(fornecedor.logs).toHaveLength(1);
    expect(fornecedor.logs[0]!.changes).toEqual({ discountValue: { from: 0, to: 150 } });
  });

  it('modelo fora da auditoria não gera log nenhum', async () => {
    const { base, logs } = makeBase({ a: 1 }, { a: 2 });

    await rodarUpdate(base, 'SystemSettings');

    expect(logs).toHaveLength(0);
  });
});
