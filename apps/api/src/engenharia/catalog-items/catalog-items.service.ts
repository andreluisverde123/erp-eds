import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { CatalogItemType, Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { nextSequentialCode } from '../../common/utils/sequential-code.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { escapeLikePattern } from '../../compras/purchase-requests/search-key';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCatalogKey } from './catalog-key';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { QueryCatalogItemDto } from './dto/query-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';

const DUPLICADO = 'Já existe um insumo com este nome. Se for outro material, diferencie o nome.';
const EM_USO =
  'Este insumo já foi usado em solicitações de compra, composições ou preços de referência e não pode ser excluído. Desative-o para tirá-lo do uso.';
const UNIDADE_EM_COMPOSICAO =
  'Este insumo é usado em composições, e os coeficientes delas estão nesta unidade. Para mudar a unidade, cadastre um novo insumo.';
const UNIDADE_COM_PRECOS =
  'Este insumo tem preços de referência registrados nesta unidade. Para mudar a unidade, cadastre um novo insumo.';

/// Prefixo do código sequencial, POR NATUREZA.
///
/// `MAT-` continua sendo o do material, e cada natureza tem o próprio prefixo e
/// a própria sequência: um código já emitido continua dizendo a verdade sobre o
/// que é, e "MO-0001" não empurra a numeração dos materiais.
export const CODE_PREFIX_BY_TYPE: Record<CatalogItemType, string> = {
  MATERIAL: 'MAT',
  LABOR: 'MO',
  EQUIPMENT: 'EQP',
};

@Injectable()
export class CatalogItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCatalogItemDto) {
    const type = dto.type ?? CatalogItemType.MATERIAL;

    // Mesmo gerador de `SOL-0001`, `OC-0001` e do código de contrato. A janela
    // de corrida do `count()` está documentada lá e é aceitável aqui pelo mesmo
    // motivo: código de cadastro não é documento fiscal.
    //
    // A contagem é da NATUREZA. Todo insumo gravado antes do ORC-02 é
    // `MATERIAL`, então a sequência `MAT-` segue exatamente de onde estava.
    const code = await nextSequentialCode(
      () => this.prisma.catalogItem.count({ where: { companyId, type } }),
      CODE_PREFIX_BY_TYPE[type],
    );

    try {
      const created = await this.prisma.catalogItem.create({
        data: {
          companyId,
          code,
          name: dto.name.trim(),
          searchKey: normalizeCatalogKey(dto.name),
          unit: dto.unit,
          category: dto.category?.trim() || null,
          description: dto.description?.trim() || null,
          type,
          active: dto.active,
        },
      });
      return this.findOne(companyId, created.id);
    } catch (error) {
      // A unique `(companyId, searchKey)` é quem recusa a duplicidade. Conferir
      // antes com um `findFirst` deixaria uma janela entre a checagem e a
      // escrita — o banco não deixa.
      if (isUniqueConstraintError(error)) throw new ConflictException(DUPLICADO);
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryCatalogItemDto,
  ): Promise<PaginatedResult<Prisma.CatalogItemGetPayload<object>>> {
    const { page, limit, search, category, active, type } = query;

    const where: Prisma.CatalogItemWhereInput = {
      companyId,
      deletedAt: null,
      category,
      type,
      active: active === undefined ? undefined : active === 'true',
      ...catalogSearchWhere(search),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.catalogItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.catalogItem.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  /// As categorias já usadas — alimenta o filtro sem exigir uma tabela de
  /// categorias. Mesmo padrão de `EmployeesService.positions`.
  async categories(companyId: string): Promise<string[]> {
    const linhas = await this.prisma.catalogItem.findMany({
      where: { companyId, deletedAt: null, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return linhas.map((linha) => linha.category!).filter(Boolean);
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.catalogItem.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    // 404 e não 403: quem não é do inquilino não fica sabendo que o registro
    // existe. É o padrão do ERP inteiro.
    if (!item) throw new NotFoundException('Insumo não encontrado.');
    return item;
  }

  /// A natureza (`type`) não se edita — o DTO nem a aceita. Ela escolheu o
  /// prefixo do código, e "MAT-0007" virando mão de obra passaria a mentir.
  ///
  /// **A unidade de insumo com dependência não muda.** Duas dependências leem
  /// a unidade do insumo:
  ///
  /// - o coeficiente da composição — 12,5 de argamassa em KG são 12,5 kg/m²,
  ///   e trocar para SC os transformaria em 12,5 sacos por m²;
  /// - o preço de referência — R$ 38,00 registrados por SC passariam a parecer
  ///   R$ 38,00 por KG.
  ///
  /// A solicitação de compra não tem esse problema porque grava a própria
  /// unidade.
  async update(companyId: string, id: string, dto: UpdateCatalogItemDto) {
    const atual = await this.assertExists(companyId, id);

    if (dto.unit !== undefined && dto.unit !== atual.unit) {
      const [emComposicoes, precos] = await Promise.all([
        this.prisma.compositionItem.count({
          where: { catalogItemId: id, composition: { deletedAt: null } },
        }),
        this.prisma.catalogItemPrice.count({ where: { catalogItemId: id } }),
      ]);
      if (emComposicoes > 0) throw new ConflictException(UNIDADE_EM_COMPOSICAO);
      if (precos > 0) throw new ConflictException(UNIDADE_COM_PRECOS);
    }

    try {
      await this.prisma.catalogItem.update({
        where: { id, companyId },
        data: {
          name: dto.name?.trim(),
          // A chave acompanha o nome. Sem isto, renomear deixaria a busca
          // apontando para o nome antigo e a unique deixaria de valer.
          searchKey: dto.name === undefined ? undefined : normalizeCatalogKey(dto.name),
          unit: dto.unit,
          category: dto.category === undefined ? undefined : dto.category.trim() || null,
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          active: dto.active,
        },
      });
      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException(DUPLICADO);
      throw error;
    }
  }

  /// Exclusão LÓGICA, com o código e a chave embaralhados — e só de insumo
  /// que NUNCA foi usado.
  ///
  /// As duas uniques — `(empresa, código)` e `(empresa, searchKey)` — não
  /// ignoram `deletedAt`. Sem embaralhar, um insumo excluído bloquearia para
  /// sempre o nome e o número dele.
  ///
  /// **Insumo já usado não é excluído, é desativado.** Excluir embaralha o
  /// código, e o código é a identidade estável que a linha de compra, a linha
  /// de composição e o histórico de preços apontam. Excluir também tiraria o
  /// histórico de preços de vista — insumo excluído não tem histórico
  /// consultável. Desativar tira o insumo do uso sem mexer em nada disso.
  async remove(companyId: string, id: string): Promise<void> {
    const item = await this.assertExists(companyId, id);

    const [emCompras, emComposicoes, precos] = await Promise.all([
      this.prisma.purchaseRequestItem.count({ where: { catalogItemId: id } }),
      // Inclusive composição excluída: a linha dela continua apontando para o
      // insumo, e embaralhar o código a deixaria mostrando o código sujo.
      this.prisma.compositionItem.count({ where: { catalogItemId: id } }),
      this.prisma.catalogItemPrice.count({ where: { catalogItemId: id } }),
    ]);
    if (emCompras > 0 || emComposicoes > 0 || precos > 0) throw new ConflictException(EM_USO);

    await this.prisma.catalogItem.update({
      where: { id, companyId },
      data: {
        deletedAt: new Date(),
        code: mangleDeletedCode(item.code, item.id),
        searchKey: mangleDeletedCode(item.searchKey, item.id),
      },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const item = await this.prisma.catalogItem.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Insumo não encontrado.');
    return item;
  }
}

/// A busca do catálogo: por NOME normalizado ou por CÓDIGO.
///
/// O nome vai normalizado dos dois lados — "CIMENTO", "cimento" e "Cimentö"
/// chegam à mesma chave —, e o termo é escapado antes de virar `LIKE`, senão
/// digitar `%` devolveria o catálogo inteiro.
///
/// O código entra em caixa alta porque é assim que ele é gravado (`MAT-0001`),
/// e quem digita costuma escrever "mat-1".
///
/// Exportada porque o editor de composição busca insumo com a MESMA regra.
export function catalogSearchWhere(search: string | undefined): Prisma.CatalogItemWhereInput {
  const termo = search?.trim();
  if (!termo) return {};

  const chave = escapeLikePattern(normalizeCatalogKey(termo));
  return {
    OR: [
      { searchKey: { contains: chave } },
      { code: { contains: termo.toUpperCase(), mode: 'insensitive' } },
    ],
  };
}
