import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { auditContextStorage } from '../../common/audit-context';
import { ApprovalThresholdService } from '../../common/approval/approval-threshold.service';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { FulfillmentService } from '../fulfillment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { UpdatePurchaseRequestQuoteDto } from './dto/update-purchase-request-quote.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';
const SOLICITACAO = '33333333-3333-4333-8333-333333333333';

const CIMENTO = '44444444-4444-4444-8444-444444444444';
const PVC = '55555555-5555-4555-8555-555555555555';
const TORNEIRA = '66666666-6666-4666-8666-666666666666';

/// A solicitação do exemplo do cliente: 10 sacos de cimento, 20 tubos de PVC e
/// 5 torneiras. O fornecedor A tem os dois primeiros e não tem a torneira.
type ItemLinha = {
  id: string;
  description: string;
  quantity: Prisma.Decimal;
  unit: string;
  estimatedUnitPrice: Prisma.Decimal | null;
  notes: string | null;
  unavailable: boolean;
  unavailabilityNote: string | null;
  discountType: 'AMOUNT' | 'PERCENT';
  discountValue: Prisma.Decimal;
};

function itensIniciais(): ItemLinha[] {
  return [
    {
      id: CIMENTO,
      description: 'Cimento CP-II',
      quantity: new Prisma.Decimal(10),
      unit: 'SC',
      estimatedUnitPrice: null,
      notes: 'Marca indiferente',
      unavailable: false,
      unavailabilityNote: null,
      discountType: 'AMOUNT',
      discountValue: new Prisma.Decimal(0),
    },
    {
      id: PVC,
      description: 'Tubo PVC 100mm',
      quantity: new Prisma.Decimal(20),
      unit: 'UN',
      estimatedUnitPrice: null,
      notes: null,
      unavailable: false,
      unavailabilityNote: null,
      discountType: 'AMOUNT',
      discountValue: new Prisma.Decimal(0),
    },
    {
      id: TORNEIRA,
      description: 'Torneira de jardim',
      quantity: new Prisma.Decimal(5),
      unit: 'UN',
      estimatedUnitPrice: null,
      notes: null,
      unavailable: false,
      unavailabilityNote: null,
      discountType: 'AMOUNT',
      discountValue: new Prisma.Decimal(0),
    },
  ];
}

/// Dublê COM ESTADO: `update` mexe na lista que o `findOne` devolve depois.
/// Sem isso, os testes de total e de alternância de estado não provariam nada —
/// leriam de volta o mesmo objeto fixo que entrou.
function makeService(
  overrides: {
    status?: string;
    itens?: ItemLinha[];
    threshold?: number;
    descontoGeral?: { discountType: 'AMOUNT' | 'PERCENT'; discountValue: Prisma.Decimal };
    /// As COMPRAS já feitas desta solicitação — as linhas de ordem de compra
    /// que apontam para os itens dela. Vazio (o padrão) é a solicitação que
    /// ninguém comprou ainda, que é o estado da maioria destes testes.
    compras?: {
      purchaseRequestItemId: string;
      quantity: Prisma.Decimal;
      purchaseOrder: {
        id: string;
        code: string;
        createdAt: Date;
        supplier: { legalName: string; tradeName: string | null };
      };
    }[];
  } = {},
) {
  const {
    status = 'QUOTING',
    itens = itensIniciais(),
    threshold = 0,
    descontoGeral = { discountType: 'AMOUNT' as const, discountValue: new Prisma.Decimal(0) },
    compras = [],
  } = overrides;

  const store = itens.map((item) => ({ ...item }));
  const solicitacao = { ...descontoGeral };
  const deleteManyCalls: unknown[] = [];
  const statusGravado: string[] = [];

  const prisma = {
    // Todo acesso passa por aqui filtrando `companyId` — é o que faz o teste
    // de isolamento multi-tenant valer alguma coisa.
    purchaseRequest: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === EMPRESA_A
          ? {
              id: SOLICITACAO,
              companyId: EMPRESA_A,
              code: 'SOL-0001',
              status,
              constructionSiteId: 'obra-1',
              costCenterId: 'cc-1',
              createdAt: new Date('2026-08-27'),
              neededBy: null,
              notes: null,
              requestedBy: { name: 'Marina Alves' },
              constructionSite: { code: 'OB-001', name: 'Residencial Aurora' },
              costCenter: { code: 'CC-201', name: 'Estrutura' },
              discountType: solicitacao.discountType,
              discountValue: solicitacao.discountValue,
              items: store.map((item) => ({ ...item })),
            }
          : null,
      ),
      update: jest.fn(
        async ({
          data,
        }: {
          data: { status?: string; discountType?: 'AMOUNT' | 'PERCENT'; discountValue?: number };
        }) => {
          if (data.status) statusGravado.push(data.status);
          if (data.discountType !== undefined) solicitacao.discountType = data.discountType;
          if (data.discountValue !== undefined) {
            solicitacao.discountValue = new Prisma.Decimal(data.discountValue);
          }
          return { id: SOLICITACAO };
        },
      ),
    },
    purchaseRequestItem: {
      findMany: jest.fn(async () => store.map((item) => ({ ...item }))),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const alvo = store.find((item) => item.id === where.id)!;
          Object.assign(alvo, data);
          return { ...alvo };
        },
      ),
      deleteMany: jest.fn(async (args: unknown) => {
        deleteManyCalls.push(args);
        return { count: 0 };
      }),
    },
    company: {
      findFirstOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== EMPRESA_A) throw new Error('empresa não encontrada');
        return {
          legalName: 'EDS CONSTRUTORA LTDA',
          tradeName: 'EDS',
          cnpj: '12345678000190',
          stateRegistration: null,
          email: null,
          phone: null,
          addressLine: null,
          addressNumber: null,
          addressComplement: null,
          city: null,
          state: null,
          zipCode: null,
        };
      }),
    },
    systemSettings: {
      findUnique: jest.fn(async () => ({
        purchaseApprovalThreshold: new Prisma.Decimal(threshold),
      })),
    },
    auditLog: { findMany: jest.fn(async () => []) },
    /// A fonte do ATENDIMENTO: não existe coluna de "quantidade atendida", o
    /// saldo sai daqui somando as compras que apontam para cada linha pedida.
    purchaseOrderItem: {
      findMany: jest.fn(async () => compras.map((compra) => ({ ...compra }))),
      groupBy: jest.fn(async () => {
        const soma = new Map<string, Prisma.Decimal>();
        for (const compra of compras) {
          const anterior = soma.get(compra.purchaseRequestItemId) ?? new Prisma.Decimal(0);
          soma.set(compra.purchaseRequestItemId, anterior.plus(compra.quantity));
        }
        return [...soma].map(([purchaseRequestItemId, quantity]) => ({
          purchaseRequestItemId,
          _sum: { quantity },
        }));
      }),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  const approvalThreshold = new ApprovalThresholdService(prisma);
  const assertThreshold = jest.spyOn(approvalThreshold, 'assertWithinPurchaseThreshold');

  /// O que foi para a auditoria nesta chamada. `AuditLoggerService` grava via
  /// Prisma; aqui só interessa O QUE ele recebeu.
  const auditado: Record<string, unknown>[] = [];
  const auditLogger = new AuditLoggerService(prisma);
  jest.spyOn(auditLogger, 'log').mockImplementation(async (entry) => {
    auditado.push(entry as unknown as Record<string, unknown>);
  });

  return {
    service: new PurchaseRequestsService(
      prisma,
      approvalThreshold,
      auditLogger,
      new FulfillmentService(prisma),
    ),
    auditado,
    prisma,
    store,
    solicitacao,
    deleteManyCalls,
    statusGravado,
    assertThreshold,
  };
}

function linha(store: ItemLinha[], id: string) {
  return store.find((item) => item.id === id)!;
}

function preco(store: ItemLinha[], id: string) {
  const valor = linha(store, id).estimatedUnitPrice;
  return valor === null ? null : Number(valor);
}

describe('PurchaseRequestsService — cotação parcial e item não disponível', () => {
  describe('1. Cotação com todos os itens disponíveis', () => {
    it('grava os três preços e soma o total inteiro', async () => {
      const { service, store } = makeService();

      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: PVC, estimatedUnitPrice: 22 },
          { id: TORNEIRA, estimatedUnitPrice: 90 },
        ],
      });

      expect(preco(store, CIMENTO)).toBe(35);
      expect(preco(store, PVC)).toBe(22);
      expect(preco(store, TORNEIRA)).toBe(90);
      expect(store.every((item) => item.unavailable === false)).toBe(true);
      // 10×35 + 20×22 + 5×90 = 350 + 440 + 450
      expect(resultado.estimatedTotal).toBe(1240);
    });
  });

  describe('2. Cotação com um item indisponível', () => {
    it('salva normalmente — não exige preço para o item que o fornecedor não tem', async () => {
      const { service, store } = makeService();

      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: PVC, estimatedUnitPrice: 22 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      expect(linha(store, TORNEIRA).unavailable).toBe(true);
      expect(preco(store, TORNEIRA)).toBeNull();
      // 350 + 440, sem a torneira.
      expect(resultado.estimatedTotal).toBe(790);
    });

    it('aceita a observação opcional de indisponibilidade', async () => {
      const { service, store } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: TORNEIRA, unavailable: true, unavailabilityNote: 'Produto sem estoque.' },
        ],
      });

      expect(linha(store, TORNEIRA).unavailabilityNote).toBe('Produto sem estoque.');
    });

    it('deixa a observação nula quando ela não vem — ela é opcional', async () => {
      const { service, store } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      expect(linha(store, TORNEIRA).unavailabilityNote).toBeNull();
    });
  });

  describe('3. Cotação com vários itens indisponíveis', () => {
    it('salva com um único item cotado e ignora os dois que faltam', async () => {
      const { service, store } = makeService();

      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: PVC, unavailable: true },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      expect(store.filter((item) => item.unavailable)).toHaveLength(2);
      expect(resultado.estimatedTotal).toBe(350);
    });

    it('recusa a cotação em que NENHUM item foi cotado', async () => {
      const { service } = makeService();

      await expect(
        service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, unavailable: true },
            { id: PVC, unavailable: true },
            { id: TORNEIRA, unavailable: true },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Item indisponível sem preço', () => {
    it('não exige preço: o DTO valida com o item só marcado como indisponível', async () => {
      const dto = plainToInstance(UpdatePurchaseRequestQuoteDto, {
        items: [{ id: TORNEIRA, unavailable: true }],
      });

      await expect(validate(dto)).resolves.toEqual([]);
    });

    it('recusa preço junto de indisponível — as duas coisas se contradizem', async () => {
      const { service } = makeService();

      await expect(
        service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 35 },
            { id: TORNEIRA, unavailable: true, estimatedUnitPrice: 90 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('não usa preço zero para dizer "não tem" — zero continua sendo um preço', async () => {
      const { service, store } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 0 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      // Zero é brinde/bonificação e ENTRA na conta como disponível; o que
      // some do total é o indisponível, que não tem preço nenhum.
      expect(linha(store, CIMENTO).unavailable).toBe(false);
      expect(preco(store, CIMENTO)).toBe(0);
      expect(preco(store, TORNEIRA)).toBeNull();
    });
  });

  describe('5. Item indisponível sem valor monetário nenhum', () => {
    /// Não há campo de desconto no modelo — a cotação grava valor unitário e
    /// disponibilidade, e nada mais. O que este teste garante é o equivalente:
    /// o item indisponível não carrega NENHUM valor, e a observação de quem
    /// pediu continua sendo dela.
    it('deixa o item sem preço e sem tocar na observação do solicitante', async () => {
      const { service, store } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: TORNEIRA, unavailable: true, unavailabilityNote: 'Fora de linha.' },
        ],
      });

      const torneira = linha(store, TORNEIRA);
      expect(torneira.estimatedUnitPrice).toBeNull();
      expect(torneira.notes).toBeNull();
      expect(linha(store, CIMENTO).notes).toBe('Marca indiferente');
    });
  });

  describe('6. Total ignorando item indisponível', () => {
    it('soma só os disponíveis — R$ 800 do exemplo do cliente', async () => {
      const { service } = makeService();

      // Cimento 10 × 50 = 500, PVC 20 × 15 = 300, torneira fora.
      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: PVC, estimatedUnitPrice: 15 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      expect(resultado.estimatedTotal).toBe(800);
    });

    it('a alçada de aprovação recebe o total SEM o item indisponível', async () => {
      const { service, assertThreshold } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: PVC, estimatedUnitPrice: 15 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      await service.updateStatus(EMPRESA_A, SOLICITACAO, 'APPROVED', ['compras.manage']);

      expect(assertThreshold).toHaveBeenCalledWith(EMPRESA_A, ['compras.manage'], 800);
    });

    it('aprova normalmente com item indisponível — o fluxo é o mesmo de sempre', async () => {
      const { service, statusGravado } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      await service.updateStatus(EMPRESA_A, SOLICITACAO, 'APPROVED', ['compras.manage']);

      expect(statusGravado).toEqual(['APPROVED']);
    });
  });

  describe('7. Alterar indisponível → disponível', () => {
    it('volta a aceitar preço e limpa a observação de indisponibilidade', async () => {
      const { service, store } = makeService({
        itens: itensIniciais().map((item) =>
          item.id === TORNEIRA
            ? { ...item, unavailable: true, unavailabilityNote: 'Sem estoque.' }
            : item,
        ),
      });

      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: TORNEIRA, unavailable: false, estimatedUnitPrice: 90 },
        ],
      });

      const torneira = linha(store, TORNEIRA);
      expect(torneira.unavailable).toBe(false);
      expect(Number(torneira.estimatedUnitPrice)).toBe(90);
      expect(torneira.unavailabilityNote).toBeNull();
      // 10×50 + 5×90
      expect(resultado.estimatedTotal).toBe(950);
    });
  });

  describe('8. Alterar disponível → indisponível', () => {
    it('apaga o preço que estava gravado, em vez de deixá-lo para trás', async () => {
      const { service, store } = makeService({
        itens: itensIniciais().map((item) =>
          item.id === TORNEIRA ? { ...item, estimatedUnitPrice: new Prisma.Decimal(90) } : item,
        ),
      });

      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      expect(linha(store, TORNEIRA).unavailable).toBe(true);
      expect(preco(store, TORNEIRA)).toBeNull();
      expect(resultado.estimatedTotal).toBe(500);
    });
  });

  describe('9. Cotação de outro fornecedor para o mesmo item', () => {
    /// O sistema não guarda cotação por fornecedor (regra C-3: `QUOTING` é
    /// rótulo de estágio). O que o cliente descreve — fornecedor A não tem, B
    /// tem por R$ 450 — acontece recotando a MESMA linha, que continua
    /// intacta e disponível para isso.
    it('a linha recusada por um fornecedor é cotável de novo por outro', async () => {
      const { service, store } = makeService();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: TORNEIRA, unavailable: true, unavailabilityNote: 'Fornecedor A não tem.' },
        ],
      });

      const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: TORNEIRA, estimatedUnitPrice: 90 },
        ],
      });

      const torneira = linha(store, TORNEIRA);
      expect(torneira.unavailable).toBe(false);
      expect(Number(torneira.estimatedUnitPrice)).toBe(90);
      // 5 torneiras × 90 = 450, o valor do fornecedor B do exemplo.
      expect(resultado.estimatedTotal).toBe(950);
    });
  });

  describe('10. Solicitação permanecendo íntegra', () => {
    it('não apaga item nenhum e não mexe em descrição, quantidade nem unidade', async () => {
      const { service, store, deleteManyCalls } = makeService();
      const antes = itensIniciais();

      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 35 },
          { id: PVC, unavailable: true },
          { id: TORNEIRA, unavailable: true },
        ],
      });

      expect(deleteManyCalls).toHaveLength(0);
      expect(store).toHaveLength(3);
      store.forEach((item, index) => {
        expect(item.description).toBe(antes[index]!.description);
        expect(Number(item.quantity)).toBe(Number(antes[index]!.quantity));
        expect(item.unit).toBe(antes[index]!.unit);
      });
    });
  });

  describe('11. Isolamento multi-tenant', () => {
    it('não cota solicitação de outra empresa', async () => {
      const { service } = makeService();

      await expect(
        service.updateQuote(EMPRESA_B, SOLICITACAO, {
          items: [{ id: CIMENTO, estimatedUnitPrice: 35 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('não cota item que não pertence a esta solicitação', async () => {
      const { service } = makeService();

      await expect(
        service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [{ id: '99999999-9999-4999-8999-999999999999', estimatedUnitPrice: 35 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('não marca como indisponível um item de outra solicitação', async () => {
      const { service } = makeService();

      await expect(
        service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 35 },
            { id: '99999999-9999-4999-8999-999999999999', unavailable: true },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PDF da solicitação — isolamento, erro e efeito colateral', () => {
    it('gera o PDF da solicitação da própria empresa', async () => {
      const { service } = makeService();

      const { buffer, code, pageCount } = await service.generatePdf(EMPRESA_A, SOLICITACAO);

      expect(code).toBe('SOL-0001');
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pageCount).toBe(1);
    });

    it('11. não gera PDF de solicitação de outra empresa', async () => {
      const { service } = makeService();

      await expect(service.generatePdf(EMPRESA_B, SOLICITACAO)).rejects.toThrow(NotFoundException);
    });

    it('a empresa do cabeçalho vem do TOKEN, não da solicitação', async () => {
      const { service, prisma } = makeService();

      await service.generatePdf(EMPRESA_A, SOLICITACAO);

      expect(prisma.company.findFirstOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EMPRESA_A } }),
      );
    });

    it('10. falha ao montar o documento vira erro, não PDF corrompido', async () => {
      const { service, prisma } = makeService();
      (prisma.company.findFirstOrThrow as jest.Mock).mockRejectedValueOnce(
        new Error('banco indisponível'),
      );

      await expect(service.generatePdf(EMPRESA_A, SOLICITACAO)).rejects.toThrow(
        'banco indisponível',
      );
    });

    it('imprimir NÃO muda o status da solicitação', async () => {
      const { service, statusGravado } = makeService();

      await service.generatePdf(EMPRESA_A, SOLICITACAO);

      expect(statusGravado).toEqual([]);
    });

    it('o documento carrega os itens e a cotação que estão gravados', async () => {
      const { service, store } = makeService();
      await service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [
          { id: CIMENTO, estimatedUnitPrice: 50 },
          { id: PVC, estimatedUnitPrice: 15 },
          { id: TORNEIRA, unavailable: true, unavailabilityNote: 'Sem estoque.' },
        ],
      });

      const { buffer } = await service.generatePdf(EMPRESA_A, SOLICITACAO);

      // O conteúdo em si é conferido em `pdf/purchase-request-pdf.spec.ts`,
      // que testa o builder sem passar por pdfkit. Aqui basta provar que o
      // caminho inteiro roda sobre o dado já cotado.
      expect(linha(store, TORNEIRA).unavailable).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });

  describe('Desconto na cotação — o que o service grava e o que ele recusa', () => {
    describe('2 e 3. Gravação nos dois níveis', () => {
      it('grava o desconto de item e o desconto geral', async () => {
        const { service, store, solicitacao } = makeService();

        const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            // 10 × 100 = 1.000 − 100 = 900
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
            // 20 × 100 = 2.000
            { id: PVC, estimatedUnitPrice: 100 },
            { id: TORNEIRA, unavailable: true },
          ],
          discount: { type: 'AMOUNT', value: 100 },
        });

        expect(Number(linha(store, CIMENTO).discountValue)).toBe(100);
        expect(linha(store, CIMENTO).discountType).toBe('AMOUNT');
        expect(Number(solicitacao.discountValue)).toBe(100);

        // O exemplo do prompt: 3.000 − 100 = 2.900 − 100 = 2.800
        expect(resultado.totals.itemsSubtotal).toBe(3000);
        expect(resultado.totals.itemsDiscount).toBe(100);
        expect(resultado.totals.subtotalAfterItemDiscounts).toBe(2900);
        expect(resultado.totals.generalDiscount).toBe(100);
        expect(resultado.totals.total).toBe(2800);
        expect(resultado.estimatedTotal).toBe(2800);
      });

      it('grava desconto percentual preservando a intenção de quem digitou', async () => {
        const { service, store } = makeService();

        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 10 } },
          ],
        });

        // 10% e não "R$ 100": se o preço mudar, o desconto acompanha.
        expect(linha(store, CIMENTO).discountType).toBe('PERCENT');
        expect(Number(linha(store, CIMENTO).discountValue)).toBe(10);
      });
    });

    describe('14. Edição do desconto', () => {
      it('remover o desconto de um item zera o campo, em vez de mantê-lo', async () => {
        const { service, store } = makeService();
        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
          ],
        });

        // Segunda cotação sem `discount`: ausência é remoção.
        const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
        });

        expect(Number(linha(store, CIMENTO).discountValue)).toBe(0);
        expect(resultado.totals.itemsDiscount).toBe(0);
        expect(resultado.totals.total).toBe(1000);
      });

      it('remover o desconto geral zera o campo da solicitação', async () => {
        const { service, solicitacao } = makeService();
        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
          discount: { type: 'AMOUNT', value: 200 },
        });

        const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
        });

        expect(Number(solicitacao.discountValue)).toBe(0);
        expect(resultado.totals.generalDiscount).toBe(0);
      });

      it('trocar de reais para porcentagem substitui, não acumula', async () => {
        const { service, store } = makeService();
        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
          ],
        });

        const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 5 } },
          ],
        });

        expect(linha(store, CIMENTO).discountType).toBe('PERCENT');
        expect(Number(linha(store, CIMENTO).discountValue)).toBe(5);
        // 1.000 − 5% = 950, e não 1.000 − 100 − 50.
        expect(resultado.totals.total).toBe(950);
      });

      it('10. rascunho e aprovada continuam fora da janela de edição', async () => {
        for (const status of ['DRAFT', 'APPROVED', 'CANCELLED']) {
          const { service } = makeService({ status });

          await expect(
            service.updateQuote(EMPRESA_A, SOLICITACAO, {
              items: [
                { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 10 } },
              ],
            }),
          ).rejects.toThrow(ConflictException);
        }
      });
    });

    describe('6. Item indisponível não recebe desconto', () => {
      it('recusa desconto em item marcado como não disponível', async () => {
        const { service } = makeService();

        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100 },
              { id: TORNEIRA, unavailable: true, discount: { type: 'AMOUNT', value: 10 } },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('recusa desconto em item sem valor unitário — não há base', async () => {
        const { service } = makeService();

        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100 },
              { id: PVC, discount: { type: 'AMOUNT', value: 10 } },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('marcar como indisponível LIMPA o desconto que estava gravado', async () => {
        const { service, store } = makeService();
        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100 },
            { id: TORNEIRA, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 50 } },
          ],
        });

        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100 },
            { id: TORNEIRA, unavailable: true },
          ],
        });

        expect(Number(linha(store, TORNEIRA).discountValue)).toBe(0);
        expect(linha(store, TORNEIRA).estimatedUnitPrice).toBeNull();
      });
    });

    describe('9. Desconto superior ao valor', () => {
      it('recusa desconto de item maior que o próprio item', async () => {
        const { service } = makeService();

        // 10 × 100 = 1.000; desconto de 1.500 não existe.
        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 1500 } },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('recusa desconto geral maior que o subtotal LÍQUIDO', async () => {
        const { service } = makeService();

        // 1.000 − 100 = 900 de subtotal líquido; 950 de desconto geral é
        // maior que a base, mesmo sendo menor que o bruto.
        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
            ],
            discount: { type: 'AMOUNT', value: 950 },
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('recusa percentual acima de 100 nos dois níveis', async () => {
        const { service } = makeService();

        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 150 } },
            ],
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
            discount: { type: 'PERCENT', value: 150 },
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('8. desconto exatamente igual à base é aceito', async () => {
        const { service } = makeService();

        const resultado = await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 100 } },
            { id: PVC, estimatedUnitPrice: 100 },
          ],
          discount: { type: 'AMOUNT', value: 2000 },
        });

        expect(resultado.totals.total).toBe(0);
      });

      it('a base conferida é a que a linha VAI TER, não a que ela tinha', async () => {
        // Cotação 1: item a R$ 100 com R$ 900 de desconto (10 × 100 = 1.000).
        const { service } = makeService();
        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 900 } },
          ],
        });

        // Cotação 2: preço cai para R$ 50 (base 500) e o desconto de 900
        // deixa de caber. Conferir contra a base ANTIGA deixaria passar.
        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 50, discount: { type: 'AMOUNT', value: 900 } },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('10. Desconto negativo', () => {
      it('o DTO recusa valor negativo nos dois níveis', async () => {
        const item = plainToInstance(UpdatePurchaseRequestQuoteDto, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: -50 } },
          ],
        });
        const geral = plainToInstance(UpdatePurchaseRequestQuoteDto, {
          items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
          discount: { type: 'AMOUNT', value: -50 },
        });

        await expect(validate(item)).resolves.not.toEqual([]);
        await expect(validate(geral)).resolves.not.toEqual([]);
      });

      it('o DTO recusa tipo de desconto inventado', async () => {
        const dto = plainToInstance(UpdatePurchaseRequestQuoteDto, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'BRINDE', value: 10 } },
          ],
        });

        await expect(validate(dto)).resolves.not.toEqual([]);
      });
    });

    describe('13. Aprovação usa o valor final', () => {
      it('a alçada recebe o total DEPOIS dos dois descontos', async () => {
        const { service, assertThreshold } = makeService();

        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
            { id: PVC, estimatedUnitPrice: 100 },
            { id: TORNEIRA, unavailable: true },
          ],
          discount: { type: 'AMOUNT', value: 100 },
        });

        await service.updateStatus(EMPRESA_A, SOLICITACAO, 'APPROVED', ['compras.manage']);

        // 2.800, não 3.000: aprovar pelo bruto exigiria alçada para uma
        // compra que, com desconto, cabe na que o aprovador já tem.
        expect(assertThreshold).toHaveBeenCalledWith(EMPRESA_A, ['compras.manage'], 2800);
      });

      it('o fluxo de aprovação em si não mudou', async () => {
        const { service, statusGravado } = makeService();
        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 10 } },
          ],
          discount: { type: 'PERCENT', value: 10 },
        });

        await service.updateStatus(EMPRESA_A, SOLICITACAO, 'APPROVED', ['compras.manage']);

        expect(statusGravado).toEqual(['APPROVED']);
      });
    });

    describe('Auditoria do desconto', () => {
      /// A auditoria só grava quando há um usuário na requisição — é o
      /// `AuditContextInterceptor` que popula esse contexto. Nos testes ele é
      /// simulado com o mesmo `AsyncLocalStorage`.
      const USUARIO = '77777777-7777-4777-8777-777777777777';
      const comUsuario = <T>(fn: () => Promise<T>) =>
        auditContextStorage.run({ userId: USUARIO, companyId: EMPRESA_A }, fn);

      it('registra desconto de item e desconto geral numa entrada só', async () => {
        const { service, auditado } = makeService();

        await comUsuario(() =>
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
              { id: PVC, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 10 } },
            ],
            discount: { type: 'AMOUNT', value: 50 },
          }),
        );

        // UMA linha, não uma por item: uma cotação de vinte itens afogaria o
        // histórico.
        expect(auditado).toHaveLength(1);
        expect(auditado[0]).toMatchObject({
          companyId: EMPRESA_A,
          userId: USUARIO,
          action: 'UPDATE',
          // Atribuída à SOLICITAÇÃO, que é onde o painel de histórico procura.
          entityType: 'PurchaseRequest',
          entityId: SOLICITACAO,
        });
      });

      it('descreve o desconto em linguagem de negócio, não no par cru', async () => {
        const { service, auditado } = makeService();

        await comUsuario(() =>
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
              { id: PVC, estimatedUnitPrice: 100, discount: { type: 'PERCENT', value: 10 } },
            ],
            discount: { type: 'PERCENT', value: 5 },
          }),
        );

        const changes = auditado[0]!.changes as Record<string, { from: string; to: string }>;

        // "discountValue: 0 → 100" não diria se são reais ou por cento.
        expect(changes.descontosDosItens!.from).toBe(
          'Cimento CP-II: sem desconto · Tubo PVC 100mm: sem desconto',
        );
        expect(changes.descontosDosItens!.to).toContain('Cimento CP-II: R$');
        expect(changes.descontosDosItens!.to).toContain('Tubo PVC 100mm: 10%');
        expect(changes.descontoGeral).toEqual({ from: 'sem desconto', to: '5%' });
      });

      it('a descrição do item vai no VALOR, nunca na chave', async () => {
        // O painel insere um espaço antes de cada maiúscula do nome do campo:
        // "Cimento CP-II" como chave viraria " Cimento  C P- I I".
        const { service, auditado } = makeService();

        await comUsuario(() =>
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
            ],
          }),
        );

        const changes = auditado[0]!.changes as Record<string, unknown>;
        expect(Object.keys(changes)).toEqual(['descontosDosItens']);
      });

      it('cotação sem mexer em desconto não gera linha de auditoria', async () => {
        const { service, auditado } = makeService();

        await comUsuario(() =>
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
          }),
        );

        expect(auditado).toEqual([]);
      });

      it('registra também a REMOÇÃO de um desconto', async () => {
        const { service, auditado } = makeService();
        await comUsuario(() =>
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
            ],
            discount: { type: 'AMOUNT', value: 50 },
          }),
        );

        await comUsuario(() =>
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [{ id: CIMENTO, estimatedUnitPrice: 100 }],
          }),
        );

        const changes = auditado[1]!.changes as Record<string, { from: string; to: string }>;
        expect(changes.descontosDosItens!.to).toBe('Cimento CP-II: sem desconto');
        expect(changes.descontoGeral).toEqual({ from: 'R$\u00a050,00', to: 'sem desconto' });
      });

      it('sem contexto de requisição, não inventa autor para o log', async () => {
        // Seed e scripts rodam fora de uma requisição HTTP: gravar um log sem
        // usuário seria pior que não gravar.
        const { service, auditado } = makeService();

        await service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
          ],
        });

        expect(auditado).toEqual([]);
      });
    });

    describe('15 e 16. Isolamento multi-tenant e RBAC', () => {
      it('não aplica desconto em solicitação de outra empresa', async () => {
        const { service, store, solicitacao } = makeService();

        await expect(
          service.updateQuote(EMPRESA_B, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100, discount: { type: 'AMOUNT', value: 100 } },
            ],
            discount: { type: 'AMOUNT', value: 50 },
          }),
        ).rejects.toThrow(NotFoundException);

        expect(Number(linha(store, CIMENTO).discountValue)).toBe(0);
        expect(Number(solicitacao.discountValue)).toBe(0);
      });

      it('não aplica desconto em item de outra solicitação', async () => {
        const { service } = makeService();

        await expect(
          service.updateQuote(EMPRESA_A, SOLICITACAO, {
            items: [
              { id: CIMENTO, estimatedUnitPrice: 100 },
              {
                id: '99999999-9999-4999-8999-999999999999',
                estimatedUnitPrice: 100,
                discount: { type: 'AMOUNT', value: 10 },
              },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('aplicar desconto é cotar — continua exigindo `compras.manage`', () => {
        const permissoes = Reflect.getMetadata(
          PERMISSIONS_KEY,
          PurchaseRequestsController.prototype.updateQuote,
        ) as string[];

        expect(permissoes).toEqual(['compras.manage']);
      });
    });
  });

  describe('12. RBAC e janela de edição', () => {
    it('cotar exige `compras.manage` — quem só abre solicitação não cota', () => {
      const permissoes = Reflect.getMetadata(
        PERMISSIONS_KEY,
        PurchaseRequestsController.prototype.updateQuote,
      ) as string[];

      expect(permissoes).toEqual(['compras.manage']);
    });

    it('não cota rascunho — a solicitação ainda é do solicitante', async () => {
      const { service } = makeService({ status: 'DRAFT' });

      await expect(
        service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [{ id: CIMENTO, estimatedUnitPrice: 35 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('não cota depois de aprovada — dali em diante vale o preço da ordem', async () => {
      const { service } = makeService({ status: 'APPROVED' });

      await expect(
        service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [{ id: CIMENTO, unavailable: true }],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
