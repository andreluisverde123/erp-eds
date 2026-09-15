import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Prisma } from '../../../generated/prisma/client';
import { Readable } from 'node:stream';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { CatalogItemsService } from '../../engenharia/catalog-items/catalog-items.service';
import type { StorageService } from '../../storage/storage.module';
import { PNG_1X1 } from '../../common/pdf/png-1x1.fixture';
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
  catalogItemId?: string | null;
  inStock?: boolean;
};

/// Um insumo do cadastro, como o banco o guarda.
type InsumoGravado = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  unit: string;
  searchKey: string;
  active: boolean;
  deletedAt: Date | null;
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
    /// O CADASTRO de insumos. É o array passado aqui, e não uma cópia: o teste
    /// de snapshot renomeia um insumo e confere o efeito nele.
    catalogo?: InsumoGravado[];
  } = {},
) {
  const {
    status = 'QUOTING',
    itens = itensIniciais(),
    threshold = 0,
    descontoGeral = { discountType: 'AMOUNT' as const, discountValue: new Prisma.Decimal(0) },
    compras = [],
    catalogo = [],
  } = overrides;

  const store = itens.map((item) => ({ ...item }));
  const solicitacao = { ...descontoGeral };
  const deleteManyCalls: unknown[] = [];
  const statusGravado: string[] = [];
  const travas: string[] = [];

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
      count: jest.fn(async () => 0),
      /// A CRIAÇÃO grava as linhas no `store`, que é o que o `findOne` lê.
      create: jest.fn(
        async ({ data }: { data: { items: { create: Record<string, unknown>[] } } }) => {
          data.items.create.forEach((linha) =>
            store.push({
              id: `item-${store.length + 1}`,
              estimatedUnitPrice: null,
              notes: null,
              unavailable: false,
              unavailabilityNote: null,
              discountType: 'AMOUNT',
              discountValue: new Prisma.Decimal(0),
              ...linha,
              quantity: new Prisma.Decimal(Number(linha.quantity ?? 0)),
            } as ItemLinha),
          );
          return { id: SOLICITACAO };
        },
      ),
    },
    constructionSite: {
      findFirst: jest.fn(async ({ where }: { where: { companyId: string } }) =>
        where.companyId === EMPRESA_A ? { id: 'obra-1' } : null,
      ),
    },
    costCenter: {
      findFirst: jest.fn(async () => ({ constructionSiteId: 'obra-1' })),
    },
    /// O cadastro de insumos, COM ESTADO: renomear aqui muda o array, e é o
    /// que deixa o teste de snapshot provar que a linha não acompanha.
    catalogItem: {
      count: jest.fn(
        async ({ where }: { where: { id: { in: string[] }; companyId: string } }) =>
          catalogo.filter(
            (insumo) =>
              where.id.in.includes(insumo.id) &&
              insumo.companyId === where.companyId &&
              insumo.deletedAt === null,
          ).length,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; companyId: string } }) =>
          catalogo.find(
            (insumo) =>
              insumo.id === where.id &&
              insumo.companyId === where.companyId &&
              insumo.deletedAt === null,
          ) ?? null,
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const alvo = catalogo.find((insumo) => insumo.id === where.id)!;
          Object.entries(data).forEach(([campo, valor]) => {
            if (valor !== undefined) Object.assign(alvo, { [campo]: valor });
          });
          return { ...alvo };
        },
      ),
    },
    /// Nenhuma composição nestes testes. O catálogo consulta o uso em
    /// composição antes de trocar a unidade e antes de excluir (ORC-02).
    compositionItem: { count: jest.fn(async () => 0) },
    /// Nem preço de referência (ORC-03): o catálogo também o consulta antes
    /// de trocar a unidade e antes de excluir.
    catalogItemPrice: { count: jest.fn(async () => 0) },
    purchaseRequestItem: {
      count: jest.fn(
        async ({ where }: { where: { catalogItemId: string } }) =>
          store.filter((item) => item.catalogItemId === where.catalogItemId).length,
      ),
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
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const alvo = store.find((item) => item.id === where.id);
        return alvo ? { inStock: false, ...alvo } : null;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const indice = store.findIndex((item) => item.id === where.id);
        const [removido] = store.splice(indice, 1);
        return removido;
      }),
      /// Usado pela INCLUSÃO de itens depois do envio. Acrescenta ao `store`,
      /// que é o que o `findOne` devolve depois — sem isso o teste não veria a
      /// linha nova aparecer na solicitação.
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        data.forEach((linha) =>
          store.push({
            id: `item-${store.length + 1}`,
            quantity: new Prisma.Decimal(Number(linha.quantity ?? 0)),
            estimatedUnitPrice: null,
            notes: null,
            unavailable: false,
            unavailabilityNote: null,
            discountType: 'AMOUNT',
            discountValue: new Prisma.Decimal(0),
            ...linha,
          } as ItemLinha),
        );
        return { count: data.length };
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
    /// A trava da solicitação (`FOR UPDATE`). Registra o SQL para o teste
    /// conferir que a alteração de item roda travada.
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      travas.push(strings.join('?'));
      return [];
    }),
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
  /// O logo do PDF sai do storage — ver a nota no spec da ordem de compra.
  const storage = {
    getStream: jest.fn(async () => Readable.from([PNG_1X1])),
  } as unknown as StorageService;

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
      storage,
    ),
    storage,
    auditado,
    prisma,
    store,
    solicitacao,
    deleteManyCalls,
    statusGravado,
    assertThreshold,
    travas,
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

  /// INCLUIR ITENS depois do envio.
  ///
  /// Existe porque quem pede lembra de um material depois de mandar a
  /// solicitação, e a única saída era abrir outra. A faixa é ESTREITA de
  /// propósito: só acrescenta, nunca altera nem apaga — é o que mantém de pé
  /// as três proteções que a regra C-4 garantia (cotação, chave estrangeira e
  /// alçada).
  describe('Incluir itens numa solicitação enviada', () => {
    const NOVO = { description: 'Tinta acrílica 18L', unit: 'LT', quantity: 10 };

    it('acrescenta em AGUARDANDO APROVAÇÃO', async () => {
      const { service, prisma } = makeService({ status: 'PENDING' });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] });

      expect(prisma.purchaseRequestItem.createMany).toHaveBeenCalled();
    });

    it('acrescenta em EM COTAÇÃO', async () => {
      const { service, prisma } = makeService({ status: 'QUOTING' });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] });

      expect(prisma.purchaseRequestItem.createMany).toHaveBeenCalled();
    });

    it('NÃO apaga nem altera o que já existe', async () => {
      // É a diferença inteira entre esta operação e a edição: o `update`
      // substitui a lista, e é por isso que ele continua congelado depois do
      // envio. Apagar descartaria a cotação já feita e bateria no
      // `onDelete: Restrict` de um item já comprado.
      const { service, prisma, deleteManyCalls } = makeService({ status: 'QUOTING' });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] });

      expect(deleteManyCalls).toHaveLength(0);
      expect(prisma.purchaseRequestItem.update).not.toHaveBeenCalled();
    });

    it('recusa depois de APROVADA — a alçada já decidiu sobre outro conteúdo', async () => {
      // A alçada é avaliada NA APROVAÇÃO. Acrescentar depois deixaria passar
      // um item de qualquer valor com o carimbo de uma aprovação que nunca o
      // viu, e a ordem de compra não tem alçada própria para segurar isso.
      const { service } = makeService({ status: 'APPROVED' });

      await expect(service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] })).rejects.toThrow(
        ConflictException,
      );
    });

    it('recusa em RASCUNHO — lá a edição já faz isso, e melhor', async () => {
      const { service } = makeService({ status: 'DRAFT' });

      await expect(service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] })).rejects.toThrow(
        /ainda é um rascunho/,
      );
    });

    it('recusa em CANCELADA', async () => {
      const { service } = makeService({ status: 'CANCELLED' });

      await expect(service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] })).rejects.toThrow(
        ConflictException,
      );
    });

    it('a solicitação de outra empresa não é encontrada', async () => {
      const { service } = makeService({ status: 'PENDING' });

      await expect(service.addItems(EMPRESA_B, SOLICITACAO, { items: [NOVO] })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('grava a chave de busca do item novo, como a criação faz', async () => {
      // Sem ela o material incluído ficaria invisível para o autocomplete —
      // e ninguém relacionaria isso com a tela em que ele foi digitado.
      const { service, prisma } = makeService({ status: 'PENDING' });

      await service.addItems(EMPRESA_A, SOLICITACAO, {
        items: [{ description: 'Cimento CP-II', unit: 'SC', quantity: 5 }],
      });

      const [{ data }] = (prisma.purchaseRequestItem.createMany as jest.Mock).mock.calls[0];
      expect(data[0].searchKey).toBe('cimento cp-ii');
    });

    it('a inclusão entra no histórico da solicitação', async () => {
      // A solicitação deixou de ser congelada: quem a lê semanas depois
      // precisa distinguir o que foi pedido de origem do que entrou depois.
      const { service, auditado } = makeService({ status: 'PENDING' });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [NOVO] });

      expect(auditado[0]).toMatchObject({
        entityType: 'PurchaseRequest',
        entityId: SOLICITACAO,
      });
      const changes = auditado[0]!.changes as Record<string, { to: string }>;
      expect(changes.itensIncluidos!.to).toContain('Tinta acrílica 18L');
    });

    it('incluir exige `compras.request` — quem pede é quem inclui', () => {
      const permissoes = Reflect.getMetadata(
        PERMISSIONS_KEY,
        PurchaseRequestsController.prototype.addItems,
      ) as string[];

      // Não é permissão nova: é a mesma de criar e editar.
      expect(permissoes).toEqual(['compras.request']);
    });
  });

  /// ITEM VINDO DO CADASTRO DE INSUMOS (ORC-01).
  ///
  /// O vínculo é opcional, e a linha continua sendo DOCUMENTO: descrição e
  /// unidade são as que a linha grava. O catálogo mudar depois não as toca.
  describe('Item vindo do cadastro de insumos', () => {
    const INSUMO = '77777777-7777-4777-8777-777777777777';
    const cimentoDoCatalogo = (sobrescrever: Partial<InsumoGravado> = {}): InsumoGravado => ({
      id: INSUMO,
      companyId: EMPRESA_A,
      code: 'MAT-0001',
      name: 'Cimento CP II 50kg',
      unit: 'SC',
      searchKey: 'cimento cp ii 50kg',
      active: true,
      deletedAt: null,
      ...sobrescrever,
    });
    const LINHA_DO_CATALOGO = {
      catalogItemId: INSUMO,
      description: 'Cimento CP II 50kg',
      unit: 'SC',
      quantity: 10,
    };
    const LINHA_LIVRE = { description: 'Torneira de jardim', unit: 'UN', quantity: 2 };

    it('criar com insumo grava o vínculo JUNTO da descrição e da unidade da linha', async () => {
      const { service, prisma } = makeService({ itens: [], catalogo: [cimentoDoCatalogo()] });

      await service.create(EMPRESA_A, 'usuario-1', {
        constructionSiteId: 'obra-1',
        items: [LINHA_DO_CATALOGO],
      });

      const [{ data }] = (prisma.purchaseRequest.create as jest.Mock).mock.calls[0];
      expect(data.items.create[0]).toMatchObject({
        catalogItemId: INSUMO,
        description: 'Cimento CP II 50kg',
        unit: 'SC',
        searchKey: 'cimento cp ii 50kg',
      });
    });

    it('criar SEM insumo continua como sempre: texto livre, sem consultar o catálogo', async () => {
      const { service, prisma } = makeService({ itens: [] });

      const criada = await service.create(EMPRESA_A, 'usuario-1', {
        constructionSiteId: 'obra-1',
        items: [LINHA_LIVRE],
      });

      const [{ data }] = (prisma.purchaseRequest.create as jest.Mock).mock.calls[0];
      expect(data.items.create[0]).toMatchObject(LINHA_LIVRE);
      expect(data.items.create[0].catalogItemId).toBeUndefined();
      expect(prisma.catalogItem.count).not.toHaveBeenCalled();
      expect(criada.items[0]).toMatchObject({ description: 'Torneira de jardim', unit: 'UN' });
    });

    it('insumo de OUTRA empresa é recusado, e nada é gravado', async () => {
      // A FK do banco aceitaria: ela não conhece empresa.
      const { service, prisma } = makeService({
        itens: [],
        catalogo: [cimentoDoCatalogo({ companyId: EMPRESA_B })],
      });

      await expect(
        service.create(EMPRESA_A, 'usuario-1', {
          constructionSiteId: 'obra-1',
          items: [LINHA_DO_CATALOGO],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseRequest.create).not.toHaveBeenCalled();
    });

    it('insumo excluído é recusado', async () => {
      const { service } = makeService({
        status: 'PENDING',
        catalogo: [cimentoDoCatalogo({ deletedAt: new Date() })],
      });

      await expect(
        service.addItems(EMPRESA_A, SOLICITACAO, { items: [LINHA_DO_CATALOGO] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('insumo DESATIVADO continua aceito: editar um rascunho antigo não pode quebrar', async () => {
      // A edição de rascunho apaga e recria as linhas. Recusar o vínculo a um
      // insumo desativado depois travaria a edição de quem pediu antes.
      const { service, prisma } = makeService({
        status: 'DRAFT',
        catalogo: [cimentoDoCatalogo({ active: false })],
      });

      await service.update(EMPRESA_A, SOLICITACAO, { items: [LINHA_DO_CATALOGO] });

      const [{ data }] = (prisma.purchaseRequestItem.createMany as jest.Mock).mock.calls[0];
      expect(data[0]).toMatchObject({ catalogItemId: INSUMO, description: 'Cimento CP II 50kg' });
    });

    it('incluir itens aceita linha do catálogo e linha livre na mesma chamada', async () => {
      const { service, prisma } = makeService({
        status: 'PENDING',
        catalogo: [cimentoDoCatalogo()],
      });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [LINHA_DO_CATALOGO, LINHA_LIVRE] });

      const [{ data }] = (prisma.purchaseRequestItem.createMany as jest.Mock).mock.calls[0];
      expect(data[0].catalogItemId).toBe(INSUMO);
      expect(data[1].catalogItemId).toBeUndefined();
      // Uma consulta só para validar todos os insumos da chamada.
      expect(prisma.catalogItem.count).toHaveBeenCalledTimes(1);
    });

    it('renomear o insumo no catálogo NÃO reescreve a linha já gravada', async () => {
      const catalogo = [cimentoDoCatalogo()];
      const { service, prisma } = makeService({ status: 'PENDING', itens: [], catalogo });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [LINHA_DO_CATALOGO] });

      // O catálogo muda de verdade — nome, chave e unidade.
      await new CatalogItemsService(prisma).update(EMPRESA_A, INSUMO, {
        name: 'Cimento CP V ARI 40kg',
        unit: 'KG',
      });
      expect(catalogo[0]).toMatchObject({ name: 'Cimento CP V ARI 40kg', unit: 'KG' });

      const detalhe = await service.findOne(EMPRESA_A, SOLICITACAO);
      const vinculada = detalhe.items.find((item) => item.catalogItemId === INSUMO);

      // A solicitação continua dizendo o que foi pedido.
      expect(vinculada).toMatchObject({
        description: 'Cimento CP II 50kg',
        unit: 'SC',
        searchKey: 'cimento cp ii 50kg',
      });
    });

    it('insumo usado na solicitação não pode ser excluído do catálogo', async () => {
      const { service, prisma } = makeService({
        status: 'PENDING',
        catalogo: [cimentoDoCatalogo()],
      });

      await service.addItems(EMPRESA_A, SOLICITACAO, { items: [LINHA_DO_CATALOGO] });

      await expect(new CatalogItemsService(prisma).remove(EMPRESA_A, INSUMO)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('12. RBAC e janela de edição', () => {
    /// A permissão EFETIVA de uma rota. O guard usa `getAllAndOverride`, então
    /// o decorator do MÉTODO vence o da classe; sem decorator próprio, a rota
    /// herda o da classe (`compras.view`).
    const permissaoDe = (metodo: keyof typeof PurchaseRequestsController.prototype) =>
      Reflect.getMetadata(PERMISSIONS_KEY, PurchaseRequestsController.prototype[metodo]) as
        string[] | undefined;

    it('a sugestão de material exige a MESMA permissão do formulário que ela serve', () => {
      // O defeito que isto trava: a rota herdava `compras.view` da classe
      // enquanto `create`/`update` exigiam `compras.request`. Um perfil com
      // "pode solicitar" e sem "pode visualizar" abria o formulário, salvava, e
      // levava 403 só no autocomplete — que falha em silêncio, então ninguém
      // conseguia dizer por que "funciona para uns e para outros não".
      expect(permissaoDe('suggestItems')).toEqual(['compras.request']);
      expect(permissaoDe('create')).toEqual(['compras.request']);
      expect(permissaoDe('update')).toEqual(['compras.request']);
    });

    it('a sugestão não passou a exigir `compras.manage` — quem pede não compra', () => {
      // Alinhar a permissão não pode ter virado promoção: o solicitante da
      // Engenharia continua sem nada do setor de Compras.
      expect(permissaoDe('suggestItems')).not.toContain('compras.manage');
    });

    it('a sugestão do CADASTRO segue a mesma regra: quem solicita, não quem mantém o catálogo', () => {
      // Com `catalogo.view`, um perfil que pode solicitar e não mantém cadastro
      // perderia a sugestão do catálogo em silêncio.
      expect(permissaoDe('suggestCatalogItems')).toEqual(['compras.request']);
    });

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

/// ITEM EXCLUÍDO E ITEM EM ESTOQUE numa solicitação já enviada.
///
/// Os dois liberados para quem pede e para quem compra (`compras.request`),
/// de PENDING a APPROVED, enquanto a linha não está em ordem de compra ativa.
describe('PurchaseRequestsService — excluir item e marcar em estoque', () => {
  const COMPRA_DO_CIMENTO = {
    purchaseRequestItemId: CIMENTO,
    quantity: new Prisma.Decimal(10),
    purchaseOrder: {
      id: 'oc-1',
      code: 'OC-0001',
      createdAt: new Date('2026-09-01'),
      supplier: { legalName: 'Depósito Central LTDA', tradeName: 'Depósito Central' },
    },
  };

  describe('Excluir item', () => {
    it.each(['PENDING', 'QUOTING', 'APPROVED'])(
      'exclui em %s, travando a solicitação',
      async (status) => {
        const { service, store, travas } = makeService({ status });

        const resultado = await service.removeItem(EMPRESA_A, SOLICITACAO, TORNEIRA);

        expect(store.map((item) => item.id)).toEqual([CIMENTO, PVC]);
        expect(resultado.items.map((item) => item.id)).toEqual([CIMENTO, PVC]);
        expect(travas[0]).toContain('FOR UPDATE');
      },
    );

    it('registra a exclusão no histórico, com descrição e quantidade', async () => {
      const { service, auditado } = makeService({ status: 'QUOTING' });

      await service.removeItem(EMPRESA_A, SOLICITACAO, TORNEIRA);

      expect(auditado[0]).toMatchObject({
        entityType: 'PurchaseRequest',
        entityId: SOLICITACAO,
        changes: { itemExcluido: { from: '—', to: 'Torneira de jardim: 5 UN' } },
      });
    });

    it('recusa item que já está em ordem de compra', async () => {
      const { service, store } = makeService({ status: 'APPROVED', compras: [COMPRA_DO_CIMENTO] });

      await expect(service.removeItem(EMPRESA_A, SOLICITACAO, CIMENTO)).rejects.toThrow(
        /já está na ordem de compra OC-0001/,
      );
      expect(store).toHaveLength(3);
    });

    it('não deixa a solicitação sem itens — desistir de tudo é cancelar', async () => {
      const { service } = makeService({ status: 'PENDING', itens: [itensIniciais()[0]!] });

      await expect(service.removeItem(EMPRESA_A, SOLICITACAO, CIMENTO)).rejects.toThrow(
        /ao menos um item/,
      );
    });

    it('rascunho usa a edição; cancelada não muda', async () => {
      await expect(
        makeService({ status: 'DRAFT' }).service.removeItem(EMPRESA_A, SOLICITACAO, CIMENTO),
      ).rejects.toThrow(/rascunho/);
      await expect(
        makeService({ status: 'CANCELLED' }).service.removeItem(EMPRESA_A, SOLICITACAO, CIMENTO),
      ).rejects.toThrow(ConflictException);
    });

    it('item de outra solicitação não é encontrado; solicitação de outra empresa também não', async () => {
      const { service } = makeService({ status: 'PENDING' });

      await expect(
        service.removeItem(EMPRESA_A, SOLICITACAO, '77777777-7777-4777-8777-777777777777'),
      ).rejects.toThrow(NotFoundException);
      await expect(service.removeItem(EMPRESA_B, SOLICITACAO, CIMENTO)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ordem cancelada ainda ligada à linha: a trava do banco vira mensagem', async () => {
      const { service, prisma } = makeService({ status: 'APPROVED' });
      (prisma.purchaseRequestItem.delete as jest.Mock).mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: '7' }),
      );

      await expect(service.removeItem(EMPRESA_A, SOLICITACAO, TORNEIRA)).rejects.toThrow(
        /ordem de compra cancelada/,
      );
    });
  });

  describe('Marcar em estoque', () => {
    function cotada() {
      return itensIniciais().map((item) => ({
        ...item,
        estimatedUnitPrice: new Prisma.Decimal(item.id === CIMENTO ? 40 : 10),
        discountType: 'AMOUNT' as const,
        discountValue: new Prisma.Decimal(item.id === CIMENTO ? 50 : 0),
      }));
    }

    it('marca, limpa preço, indisponibilidade e desconto, e tira do total', async () => {
      const { service, store } = makeService({ status: 'QUOTING', itens: cotada() });

      const antes = await service.findOne(EMPRESA_A, SOLICITACAO);
      // 10 × 40 − 50 + 20 × 10 + 5 × 10 = 600
      expect(antes.estimatedTotal).toBe(600);

      const depois = await service.setItemStock(EMPRESA_A, SOLICITACAO, CIMENTO, true);

      expect(linha(store, CIMENTO)).toMatchObject({
        inStock: true,
        estimatedUnitPrice: null,
        unavailable: false,
        unavailabilityNote: null,
        discountValue: 0,
      });
      expect(depois.estimatedTotal).toBe(250);
    });

    it('em estoque não tem saldo a comprar: conta como atendido', async () => {
      const { service } = makeService({ status: 'APPROVED' });

      const depois = await service.setItemStock(EMPRESA_A, SOLICITACAO, TORNEIRA, true);
      const torneira = depois.items.find((item) => item.id === TORNEIRA)!;

      expect(torneira.fulfillment.pendingQuantity.toNumber()).toBe(0);
      expect(torneira.fulfillment.status).toBe('FULFILLED');
      expect(depois.fulfillment).toMatchObject({
        totalItems: 3,
        fulfilledItems: 1,
        pendingItems: 2,
      });
    });

    it('a listagem também desconta o item em estoque do saldo', async () => {
      const { prisma } = makeService({ status: 'APPROVED' });
      const fulfillment = new FulfillmentService(prisma);

      const resumo = await fulfillment.summaryByRequest([
        {
          id: SOLICITACAO,
          items: itensIniciais().map((item) => ({
            id: item.id,
            quantity: item.quantity,
            inStock: true,
          })),
        },
      ]);

      expect(resumo.get(SOLICITACAO)).toMatchObject({ status: 'FULFILLED', pendingItems: 0 });
    });

    it('desmarcar devolve à compra e fica no histórico', async () => {
      const itens = itensIniciais().map((item) =>
        item.id === PVC ? { ...item, inStock: true } : item,
      );
      const { service, store, auditado } = makeService({ status: 'QUOTING', itens });

      await service.setItemStock(EMPRESA_A, SOLICITACAO, PVC, false);

      expect(linha(store, PVC).inStock).toBe(false);
      expect(auditado[0]).toMatchObject({
        changes: { voltouParaCompra: { to: 'Tubo PVC 100mm: 20 UN' } },
      });
    });

    it('marcar registra no histórico; repetir o mesmo estado não muda nada nem registra', async () => {
      const { service, prisma, auditado } = makeService({ status: 'PENDING' });

      await service.setItemStock(EMPRESA_A, SOLICITACAO, CIMENTO, true);
      expect(auditado[0]).toMatchObject({ changes: { emEstoque: { to: 'Cimento CP-II: 10 SC' } } });

      (prisma.purchaseRequestItem.update as jest.Mock).mockClear();
      await service.setItemStock(EMPRESA_A, SOLICITACAO, CIMENTO, true);
      expect(prisma.purchaseRequestItem.update).not.toHaveBeenCalled();
      expect(auditado).toHaveLength(1);
    });

    it('recusa marcar o que já está em ordem de compra', async () => {
      const { service } = makeService({ status: 'APPROVED', compras: [COMPRA_DO_CIMENTO] });

      await expect(service.setItemStock(EMPRESA_A, SOLICITACAO, CIMENTO, true)).rejects.toThrow(
        /OC-0001/,
      );
    });

    it('rascunho e cancelada recusam', async () => {
      await expect(
        makeService({ status: 'DRAFT' }).service.setItemStock(
          EMPRESA_A,
          SOLICITACAO,
          CIMENTO,
          true,
        ),
      ).rejects.toThrow(/rascunho/);
      await expect(
        makeService({ status: 'CANCELLED' }).service.setItemStock(
          EMPRESA_A,
          SOLICITACAO,
          CIMENTO,
          true,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('a cotação não cota item em estoque: com preço é recusada, sem preço ele fica como está', async () => {
      const itens = itensIniciais().map((item) =>
        item.id === TORNEIRA ? { ...item, inStock: true } : item,
      );

      const recusada = makeService({ status: 'QUOTING', itens });
      await expect(
        recusada.service.updateQuote(EMPRESA_A, SOLICITACAO, {
          items: [
            { id: CIMENTO, estimatedUnitPrice: 40 },
            { id: TORNEIRA, estimatedUnitPrice: 10 },
          ],
        }),
      ).rejects.toThrow(/em estoque não entra na cotação/);

      const aceita = makeService({ status: 'QUOTING', itens });
      await aceita.service.updateQuote(EMPRESA_A, SOLICITACAO, {
        items: [{ id: CIMENTO, estimatedUnitPrice: 40 }, { id: TORNEIRA }],
      });
      expect(aceita.prisma.purchaseRequestItem.update).toHaveBeenCalledTimes(1);
      expect(linha(aceita.store, TORNEIRA)).toMatchObject({
        inStock: true,
        estimatedUnitPrice: null,
      });
    });

    it('a aprovação usa o total sem o item em estoque', async () => {
      const itens = cotada().map((item) =>
        item.id === CIMENTO
          ? {
              ...item,
              estimatedUnitPrice: null,
              discountValue: new Prisma.Decimal(0),
              inStock: true,
            }
          : item,
      );
      const { service, assertThreshold } = makeService({ status: 'QUOTING', itens });

      await service.updateStatus(EMPRESA_A, SOLICITACAO, 'APPROVED', [
        'compras.manage',
        'compras.approve',
      ]);

      expect(assertThreshold).toHaveBeenCalledWith(EMPRESA_A, expect.anything(), 250);
    });
  });

  describe('Editar item', () => {
    const CIMENTO_COMO_ESTA = {
      description: 'Cimento CP-II',
      unit: 'SC',
      quantity: 10,
      notes: 'Marca indiferente',
    };

    function cimentoCotado() {
      return itensIniciais().map((item) =>
        item.id === CIMENTO
          ? {
              ...item,
              estimatedUnitPrice: new Prisma.Decimal(40),
              discountValue: new Prisma.Decimal(5),
            }
          : item,
      );
    }

    it('só a quantidade: mantém o preço cotado, recalcula o total e roda travada', async () => {
      const { service, store, travas, statusGravado } = makeService({
        status: 'QUOTING',
        itens: cimentoCotado(),
      });

      const depois = await service.updateItem(EMPRESA_A, SOLICITACAO, CIMENTO, {
        ...CIMENTO_COMO_ESTA,
        quantity: 12,
      });

      expect(Number(linha(store, CIMENTO).quantity)).toBe(12);
      expect(preco(store, CIMENTO)).toBe(40);
      // 12 × 40 − 5
      expect(depois.estimatedTotal).toBe(475);
      expect(travas[0]).toContain('FOR UPDATE');
      expect(statusGravado).toEqual([]);
    });

    it('troca de material: apaga preço, indisponível e desconto da linha, e grava a chave de busca', async () => {
      const { service, store } = makeService({ status: 'QUOTING', itens: cimentoCotado() });

      await service.updateItem(EMPRESA_A, SOLICITACAO, CIMENTO, {
        ...CIMENTO_COMO_ESTA,
        description: 'Cimento CP-III 50kg',
      });

      expect(linha(store, CIMENTO)).toMatchObject({
        description: 'Cimento CP-III 50kg',
        estimatedUnitPrice: null,
        unavailable: false,
        unavailabilityNote: null,
        discountValue: 0,
      });
      expect((linha(store, CIMENTO) as { searchKey?: string }).searchKey).toBeTruthy();
    });

    it('troca de unidade também apaga a cotação da linha', async () => {
      const { service, store } = makeService({ status: 'QUOTING', itens: cimentoCotado() });

      await service.updateItem(EMPRESA_A, SOLICITACAO, CIMENTO, {
        ...CIMENTO_COMO_ESTA,
        unit: 'KG',
      });

      expect(preco(store, CIMENTO)).toBeNull();
    });

    it('aprovada: mudar a quantidade devolve para Em cotação e fica no histórico', async () => {
      const { service, statusGravado, auditado } = makeService({ status: 'APPROVED' });

      await service.updateItem(EMPRESA_A, SOLICITACAO, PVC, {
        description: 'Tubo PVC 100mm',
        unit: 'UN',
        quantity: 25,
      });

      expect(statusGravado).toEqual(['QUOTING']);
      expect(auditado[0]).toMatchObject({
        entityType: 'PurchaseRequest',
        entityId: SOLICITACAO,
        changes: {
          itemEditado: { from: 'Tubo PVC 100mm: 20 UN', to: 'Tubo PVC 100mm: 25 UN' },
          status: { from: 'APPROVED', to: 'QUOTING' },
        },
      });
    });

    it('aprovada: mudar só a observação não reabre', async () => {
      const { service, statusGravado, auditado } = makeService({ status: 'APPROVED' });

      await service.updateItem(EMPRESA_A, SOLICITACAO, PVC, {
        description: 'Tubo PVC 100mm',
        unit: 'UN',
        quantity: 20,
        notes: 'Urgente',
      });

      expect(statusGravado).toEqual([]);
      expect(auditado[0]).toMatchObject({
        changes: { itemEditado: { to: 'Tubo PVC 100mm: 20 UN (obs.: Urgente)' } },
      });
      expect((auditado[0]!.changes as Record<string, unknown>).status).toBeUndefined();
    });

    it('aprovada: item em estoque não entra no total e não reabre', async () => {
      const itens = itensIniciais().map((item) =>
        item.id === TORNEIRA ? { ...item, inStock: true } : item,
      );
      const { service, statusGravado } = makeService({ status: 'APPROVED', itens });

      await service.updateItem(EMPRESA_A, SOLICITACAO, TORNEIRA, {
        description: 'Torneira de jardim',
        unit: 'UN',
        quantity: 8,
      });

      expect(statusGravado).toEqual([]);
    });

    it('sem mudança nenhuma não grava nem registra', async () => {
      const { service, prisma, auditado } = makeService({ status: 'PENDING' });

      await service.updateItem(EMPRESA_A, SOLICITACAO, CIMENTO, CIMENTO_COMO_ESTA);

      expect(prisma.purchaseRequestItem.update).not.toHaveBeenCalled();
      expect(auditado).toHaveLength(0);
    });

    it('recusa item em ordem de compra, rascunho, cancelada, outra empresa e insumo de fora', async () => {
      await expect(
        makeService({ status: 'APPROVED', compras: [COMPRA_DO_CIMENTO] }).service.updateItem(
          EMPRESA_A,
          SOLICITACAO,
          CIMENTO,
          { ...CIMENTO_COMO_ESTA, quantity: 11 },
        ),
      ).rejects.toThrow(/já está na ordem de compra OC-0001/);
      await expect(
        makeService({ status: 'DRAFT' }).service.updateItem(
          EMPRESA_A,
          SOLICITACAO,
          CIMENTO,
          CIMENTO_COMO_ESTA,
        ),
      ).rejects.toThrow(/rascunho/);
      await expect(
        makeService({ status: 'CANCELLED' }).service.updateItem(
          EMPRESA_A,
          SOLICITACAO,
          CIMENTO,
          CIMENTO_COMO_ESTA,
        ),
      ).rejects.toThrow(ConflictException);
      await expect(
        makeService({ status: 'PENDING' }).service.updateItem(
          EMPRESA_B,
          SOLICITACAO,
          CIMENTO,
          CIMENTO_COMO_ESTA,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        makeService({ status: 'PENDING' }).service.updateItem(EMPRESA_A, SOLICITACAO, CIMENTO, {
          ...CIMENTO_COMO_ESTA,
          catalogItemId: '99999999-9999-4999-8999-999999999999',
        }),
      ).rejects.toThrow(/insumo inválido/);
    });
  });

  it('as três rotas exigem `compras.request` — quem pede e quem compra', () => {
    for (const rota of ['removeItem', 'setItemStock', 'updateItem'] as const) {
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, PurchaseRequestsController.prototype[rota]),
      ).toEqual(['compras.request']);
    }
  });
});
