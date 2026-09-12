import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
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

/// Prefixo do código sequencial. `MAT-` e não `INS-` porque só MATERIAL existe:
/// no dia em que mão de obra entrar, ela terá o próprio prefixo, e os códigos
/// já emitidos continuarão dizendo a verdade sobre o que são.
const PREFIXO = 'MAT';

@Injectable()
export class CatalogItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCatalogItemDto) {
    // Mesmo gerador de `SOL-0001`, `OC-0001` e do código de contrato. A janela
    // de corrida do `count()` está documentada lá e é aceitável aqui pelo mesmo
    // motivo: código de cadastro não é documento fiscal.
    const code = await nextSequentialCode(
      () => this.prisma.catalogItem.count({ where: { companyId } }),
      PREFIXO,
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
          type: dto.type,
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
    const { page, limit, search, category, active } = query;

    const where: Prisma.CatalogItemWhereInput = {
      companyId,
      deletedAt: null,
      category,
      active: active === undefined ? undefined : active === 'true',
      ...buscaPor(search),
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

  async update(companyId: string, id: string, dto: UpdateCatalogItemDto) {
    await this.assertExists(companyId, id);

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

  /// Exclusão LÓGICA, com o código e a chave embaralhados.
  ///
  /// As duas uniques — `(empresa, código)` e `(empresa, searchKey)` — não
  /// ignoram `deletedAt`. Sem embaralhar, um insumo excluído bloquearia para
  /// sempre o nome e o número dele.
  ///
  /// A solicitação que apontava para este insumo **continua intacta**: a linha
  /// guarda a própria descrição e unidade, e a FK é `RESTRICT` sobre uma linha
  /// que nunca some da tabela.
  async remove(companyId: string, id: string): Promise<void> {
    const item = await this.assertExists(companyId, id);
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
function buscaPor(search: string | undefined): Prisma.CatalogItemWhereInput {
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
