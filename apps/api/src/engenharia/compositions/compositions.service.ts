import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { auditContextStorage } from '../../common/audit-context';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { escapeLikePattern } from '../../compras/purchase-requests/search-key';
import { PrismaService } from '../../prisma/prisma.service';
import { latestReferencePrices } from '../catalog-item-prices/latest-prices';
import { catalogSearchWhere } from '../catalog-items/catalog-items.service';
import { normalizeCatalogKey } from '../catalog-items/catalog-key';
import {
  COEFFICIENT_SCALE,
  coefficientProblem,
  COST_SCALE,
  itemCost,
  PRICE_SCALE,
  toDecimal,
  unitCost,
  unitPriceProblem,
} from './composition-cost';
import { CreateCompositionItemDto, UpdateCompositionItemDto } from './dto/composition-item.dto';
import { CreateCompositionDto } from './dto/create-composition.dto';
import { QueryCompositionDto } from './dto/query-composition.dto';
import { UpdateCompositionDto } from './dto/update-composition.dto';

const PREFIXO = 'COMP';

const NAO_ENCONTRADA = 'Composição não encontrada.';
const ITEM_NAO_ENCONTRADO = 'Item da composição não encontrado.';
const INSUMO_NAO_ENCONTRADO = 'Insumo não encontrado.';
const INSUMO_INATIVO =
  'Este insumo está desativado e não pode entrar em composição. Reative-o em Insumos para usá-lo.';
const INSUMO_REPETIDO =
  'Este insumo já está nesta composição. Ajuste o coeficiente da linha existente.';
const CODIGO_COLIDIU =
  'Não foi possível reservar o próximo código de composição. Tente salvar de novo.';

/// O que a linha mostra do insumo. Lido por RELAÇÃO, e não copiado para o
/// item: a composição é cadastro vivo, não documento. Renomear o insumo deve,
/// sim, aparecer aqui — quem congela é o orçamento (ORC-04), ao copiar.
const INSUMO_DA_LINHA = {
  id: true,
  code: true,
  name: true,
  unit: true,
  type: true,
  active: true,
} satisfies Prisma.CatalogItemSelect;

const DETALHE = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: { catalogItem: { select: INSUMO_DA_LINHA } },
  },
} satisfies Prisma.CompositionInclude;

type CompositionWithItems = Prisma.CompositionGetPayload<{ include: typeof DETALHE }>;

/// Composições de custo: quanto custa produzir UMA unidade de um serviço.
///
/// ## O que é derivado e o que é gravado
///
/// Gravados: coeficiente e preço unitário de cada item. Derivados, a cada
/// leitura, por `composition-cost.ts`: o custo de cada item e o custo unitário
/// da composição. Nenhum custo vem do cliente e nenhum é salvo — ver a
/// migration `composicoes_de_custo`.
///
/// ## O preço da linha é SNAPSHOT
///
/// `CompositionItem.unitPrice` é o valor que alguém escolheu para esta
/// composição. O histórico de preços de referência (ORC-03) só SUGERE esse
/// valor na hora de incluir o insumo (`catalogOptions`); nenhuma leitura ou
/// escrita de composição consulta o histórico depois disso. Um preço novo no
/// histórico nunca muda uma composição existente — atualizar é editar a linha.
///
/// ## Isolamento
///
/// `CompositionItem` não tem `companyId`; a empresa é a da composição. Toda
/// operação de item confere primeiro a composição contra a sessão e depois o
/// item contra a composição. O insumo incluído é conferido contra a sessão
/// também: a FK do banco sozinha aceitaria o insumo de outra empresa.
@Injectable()
export class CompositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async create(companyId: string, dto: CreateCompositionDto) {
    // Mesmo gerador de `MAT-0001`, `SOL-0001` e `OC-0001`. O `count` inclui as
    // excluídas, então um número nunca é reaproveitado.
    const code = await nextSequentialCode(
      () => this.prisma.composition.count({ where: { companyId } }),
      PREFIXO,
    );

    try {
      const created = await this.prisma.composition.create({
        data: {
          companyId,
          code,
          name: dto.name.trim(),
          searchKey: normalizeCatalogKey(dto.name),
          unit: dto.unit,
          description: dto.description?.trim() || null,
          active: dto.active,
        },
      });
      return this.findOne(companyId, created.id);
    } catch (error) {
      // A única unique da composição é `(empresa, código)`, e o código vem do
      // servidor. Colidir aqui é a janela de corrida do `count()` — duas
      // criações simultâneas —, não um nome repetido.
      if (isUniqueConstraintError(error)) throw new ConflictException(CODIGO_COLIDIU);
      throw error;
    }
  }

  async findAll(companyId: string, query: QueryCompositionDto) {
    const { page, limit, search, active } = query;

    const where: Prisma.CompositionWhereInput = {
      companyId,
      deletedAt: null,
      active: active === undefined ? undefined : active === 'true',
      ...buscaPor(search),
    };

    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.composition.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        // Só o necessário para a conta: a listagem mostra o custo unitário,
        // e ele não existe gravado.
        include: { items: { select: { coefficient: true, unitPrice: true } } },
      }),
      this.prisma.composition.count({ where }),
    ]);

    const data = linhas.map(({ items, ...composicao }) => ({
      ...semInternos(composicao),
      itemCount: items.length,
      unitCost: unitCost(items).toFixed(COST_SCALE),
    }));

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const composicao = await this.prisma.composition.findFirst({
      where: { id, companyId, deletedAt: null },
      include: DETALHE,
    });
    // 404 e não 403: quem não é do inquilino não fica sabendo que o registro
    // existe.
    if (!composicao) throw new NotFoundException(NAO_ENCONTRADA);
    return detalhar(composicao);
  }

  async update(companyId: string, id: string, dto: UpdateCompositionDto) {
    await this.assertComposition(companyId, id);

    await this.prisma.composition.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        // A chave acompanha o nome, senão a busca acharia pelo nome antigo.
        searchKey: dto.name === undefined ? undefined : normalizeCatalogKey(dto.name),
        unit: dto.unit,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        active: dto.active,
      },
    });
    return this.findOne(companyId, id);
  }

  /// Exclusão LÓGICA, com o código embaralhado para liberar a unique.
  ///
  /// Os itens ficam onde estão, presos à composição excluída. Hoje nada lê
  /// composição excluída; quando o orçamento existir (ORC-04), ele copia a
  /// composição no momento do uso, e excluir a de cadastro não mexe na cópia.
  async remove(companyId: string, id: string): Promise<void> {
    const composicao = await this.assertComposition(companyId, id);

    await this.prisma.composition.update({
      where: { id },
      data: { deletedAt: new Date(), code: mangleDeletedCode(composicao.code, composicao.id) },
    });
  }

  /// Insumos que podem ENTRAR numa composição: da empresa, ativos e não
  /// excluídos, com a natureza e a unidade que a linha vai usar — e o preço de
  /// referência VIGENTE HOJE, quando houver, como SUGESTÃO.
  ///
  /// Mora aqui, e não em `/catalog-items`, pelo mesmo motivo da sugestão de
  /// Compras: serve o editor de composição e exige a permissão dele
  /// (`composicoes.manage`), não a de consultar o catálogo.
  ///
  /// **A sugestão não é gravada em lugar nenhum.** A tela preenche o campo de
  /// preço com ela, a pessoa pode trocar, e o que for enviado em `addItem` é
  /// o que a linha guarda.
  ///
  /// O preço só é sugerido se estiver na unidade ATUAL do insumo. A unidade de
  /// insumo com preço não muda, então isto não deveria acontecer; se um dia
  /// acontecer (alteração por fora da API), sugerir R$ por SC para um insumo
  /// em KG seria pior do que não sugerir.
  async catalogOptions(companyId: string, search: string, limit = 10) {
    const termo = search?.trim();
    if (!termo) return [];

    const opcoes = await this.prisma.catalogItem.findMany({
      where: { companyId, deletedAt: null, active: true, ...catalogSearchWhere(termo) },
      select: { id: true, code: true, name: true, unit: true, type: true },
      orderBy: { name: 'asc' },
      take: Math.min(Math.max(limit, 1), 20),
    });

    const vigentes = await latestReferencePrices(
      this.prisma,
      companyId,
      opcoes.map((opcao) => opcao.id),
    );

    return opcoes.map((opcao) => {
      const referencia = vigentes.get(opcao.id);
      return {
        ...opcao,
        referencePrice: referencia && referencia.unit === opcao.unit ? referencia : null,
      };
    });
  }

  async addItem(companyId: string, compositionId: string, dto: CreateCompositionItemDto) {
    await this.assertComposition(companyId, compositionId);

    const insumo = await this.prisma.catalogItem.findFirst({
      where: { id: dto.catalogItemId, companyId, deletedAt: null },
      select: { id: true, active: true },
    });
    // 400, como no vínculo de compra: o erro é do CORPO da requisição, que
    // aponta para algo que esta empresa não tem. A composição existe.
    if (!insumo) throw new BadRequestException(INSUMO_NAO_ENCONTRADO);
    if (!insumo.active) throw new BadRequestException(INSUMO_INATIVO);

    const coefficient = exigirCoeficiente(dto.coefficient);
    const unitPrice = exigirPreco(dto.unitPrice);

    try {
      // Os campos são nomeados um a um: nada do corpo além deles chega ao
      // banco, e custo nenhum vem de fora. O preço é o ENVIADO — sugerido ou
      // digitado —, nunca relido do histórico aqui.
      await this.prisma.compositionItem.create({
        data: { compositionId, catalogItemId: insumo.id, coefficient, unitPrice },
      });
    } catch (error) {
      // A unique `(composição, insumo)` recusa a repetição. Conferir antes com
      // `findFirst` deixaria uma janela entre a checagem e a escrita.
      if (isUniqueConstraintError(error)) throw new ConflictException(INSUMO_REPETIDO);
      throw error;
    }

    return this.findOne(companyId, compositionId);
  }

  /// Atualiza coeficiente e/ou preço. Insumo desativado DEPOIS de entrar na
  /// composição continua editável: desativar tira do uso NOVO, e travar a
  /// linha impediria até corrigir o preço dela.
  async updateItem(
    companyId: string,
    compositionId: string,
    itemId: string,
    dto: UpdateCompositionItemDto,
  ) {
    await this.assertComposition(companyId, compositionId);
    await this.assertItem(compositionId, itemId);

    await this.prisma.compositionItem.update({
      where: { id: itemId },
      data: {
        coefficient:
          dto.coefficient === undefined ? undefined : exigirCoeficiente(dto.coefficient),
        unitPrice: dto.unitPrice === undefined ? undefined : exigirPreco(dto.unitPrice),
      },
    });

    return this.findOne(companyId, compositionId);
  }

  /// Remove a linha da composição — exclusão FÍSICA do item, não da
  /// composição. Nenhum documento aponta para item de composição (o orçamento
  /// copiará, não referenciará), então não há histórico a preservar na tabela.
  ///
  /// A extensão de auditoria só cobre create/update; a remoção é registrada
  /// aqui, com o que a linha dizia, para a pergunta "quem tirou o pedreiro
  /// desta composição?" ter resposta.
  async removeItem(companyId: string, compositionId: string, itemId: string) {
    await this.assertComposition(companyId, compositionId);
    const item = await this.assertItem(compositionId, itemId);

    await this.prisma.compositionItem.delete({ where: { id: itemId } });

    await this.auditLogger.log({
      companyId,
      userId: auditContextStorage.getStore()?.userId ?? null,
      action: 'DELETE',
      entityType: 'CompositionItem',
      entityId: itemId,
      changes: {
        compositionId,
        catalogItemId: item.catalogItemId,
        coefficient: item.coefficient.toFixed(COEFFICIENT_SCALE),
        unitPrice: item.unitPrice.toFixed(PRICE_SCALE),
      },
    });

    return this.findOne(companyId, compositionId);
  }

  private async assertComposition(companyId: string, id: string) {
    const composicao = await this.prisma.composition.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, code: true },
    });
    if (!composicao) throw new NotFoundException(NAO_ENCONTRADA);
    return composicao;
  }

  /// O item é procurado DENTRO da composição já conferida. Um id de item de
  /// outra composição — inclusive de outra empresa — dá "não encontrado".
  private async assertItem(compositionId: string, itemId: string) {
    const item = await this.prisma.compositionItem.findFirst({
      where: { id: itemId, compositionId },
    });
    if (!item) throw new NotFoundException(ITEM_NAO_ENCONTRADO);
    return item;
  }
}

function exigirCoeficiente(valor: unknown): Prisma.Decimal {
  const problema = coefficientProblem(valor);
  if (problema) throw new BadRequestException(problema);
  return toDecimal(valor)!;
}

function exigirPreco(valor: unknown): Prisma.Decimal {
  const problema = unitPriceProblem(valor);
  if (problema) throw new BadRequestException(problema);
  return toDecimal(valor)!;
}

function semInternos<T extends { companyId: string; searchKey: string; deletedAt: Date | null }>(
  composicao: T,
): Omit<T, 'companyId' | 'searchKey' | 'deletedAt'> {
  const { companyId: _companyId, searchKey: _searchKey, deletedAt: _deletedAt, ...resto } =
    composicao;
  return resto;
}

/// A composição com os custos. Os números saem como TEXTO com escala fixa, e
/// não como `number`: é a forma de 0,000123 chegar à tela sem passar pelo
/// ponto flutuante.
function detalhar(composicao: CompositionWithItems) {
  const { items, ...campos } = composicao;

  return {
    ...semInternos(campos),
    itemCount: items.length,
    unitCost: unitCost(items).toFixed(COST_SCALE),
    items: items.map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      coefficient: item.coefficient.toFixed(COEFFICIENT_SCALE),
      unitPrice: item.unitPrice.toFixed(PRICE_SCALE),
      totalCost: itemCost(item.coefficient, item.unitPrice).toFixed(COST_SCALE),
      catalogItem: item.catalogItem,
    })),
  };
}

/// Por nome normalizado ou por código — a mesma regra da busca de insumos.
function buscaPor(search: string | undefined): Prisma.CompositionWhereInput {
  const termo = search?.trim();
  if (!termo) return {};

  return {
    OR: [
      { searchKey: { contains: escapeLikePattern(normalizeCatalogKey(termo)) } },
      { code: { contains: termo.toUpperCase(), mode: 'insensitive' } },
    ],
  };
}
