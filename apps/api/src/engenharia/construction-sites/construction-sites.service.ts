import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConstructionSiteDto } from './dto/create-construction-site.dto';
import { QueryConstructionSiteDto } from './dto/query-construction-site.dto';
import { UpdateConstructionSiteDto } from './dto/update-construction-site.dto';

const listArgs = Prisma.validator<Prisma.ConstructionSiteDefaultArgs>()({
  include: { _count: { select: { costCenters: { where: { deletedAt: null } } } } },
});

const detailArgs = Prisma.validator<Prisma.ConstructionSiteDefaultArgs>()({
  include: {
    /// O responsável como USUÁRIO — é ele que a tela pré-seleciona no
    /// dropdown ao abrir a obra para edição.
    responsible: { select: { id: true, name: true, email: true } },
    costCenters: { where: { deletedAt: null }, orderBy: { code: 'asc' } },
    _count: { select: { costCenters: { where: { deletedAt: null } } } },
  },
});

export type ConstructionSiteListItem = Prisma.ConstructionSiteGetPayload<typeof listArgs>;
export type ConstructionSiteDetail = Prisma.ConstructionSiteGetPayload<typeof detailArgs>;

const DUPLICATE_CODE_MESSAGE = 'Já existe uma obra com este código.';

@Injectable()
export class ConstructionSitesService {
  constructor(private readonly prisma: PrismaService) {}

  /// Resolve o responsável e, quando ele é usuário, GARANTE o acesso dele a
  /// esta obra no Diário.
  ///
  /// **É aqui que o vínculo nasce.** Antes disto, cadastrar uma obra e escolher
  /// um responsável não dava a ele nada: a obra não aparecia no Diário de
  /// ninguém, e o vínculo só existia por script. Escolher o responsável passa a
  /// ser o ato que concede.
  ///
  /// O vínculo é criado, nunca REMOVIDO ao trocar de responsável. Quem era
  /// responsável antes continua enxergando a obra — tirar o acesso de alguém
  /// como efeito colateral de editar um cadastro é o tipo de surpresa que
  /// ninguém relaciona com a causa. Remover é ato explícito, na tela de acessos
  /// do Diário.
  ///
  /// O NOME é gravado a partir do usuário, e o que vier no `responsibleName` é
  /// ignorado nesse caso: dois nomes para a mesma pessoa divergiriam no
  /// primeiro que fosse editado.
  private async resolveResponsible(
    companyId: string,
    siteId: string | null,
    dto: { responsibleId?: string; responsibleName?: string },
  ): Promise<{ responsibleId: string | null; responsibleName: string | undefined }> {
    if (!dto.responsibleId) {
      return { responsibleId: null, responsibleName: dto.responsibleName };
    }

    const usuario = await this.prisma.user.findFirst({
      where: { id: dto.responsibleId, companyId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    });

    if (!usuario) {
      throw new BadRequestException('Responsável informado não existe ou está inativo.');
    }

    if (siteId) await this.grantDiarioAccess(usuario.id, siteId);

    return { responsibleId: usuario.id, responsibleName: usuario.name };
  }

  /// `ENGINEER` como papel do vínculo: é o que "responsável pela obra"
  /// significa no Diário. Fiscal é outro papel, escolhido na tela de acessos.
  ///
  /// Idempotente por `upsert` — salvar a mesma obra duas vezes não duplica o
  /// vínculo nem estoura o índice único de `(usuário, obra)`.
  private async grantDiarioAccess(userId: string, constructionSiteId: string): Promise<void> {
    await this.prisma.userConstructionSite.upsert({
      where: { userId_constructionSiteId: { userId, constructionSiteId } },
      create: { userId, constructionSiteId, role: 'ENGINEER' },
      // Vínculo que já existe fica como está: se alguém o marcou como fiscal
      // na tela de acessos, ser escolhido responsável não deve rebaixá-lo.
      update: {},
    });
  }


  async create(companyId: string, dto: CreateConstructionSiteDto): Promise<ConstructionSiteDetail> {
    // Antes de criar: um responsável inválido tem de recusar a requisição
    // inteira, e não deixar a obra gravada sem o vínculo que a justifica.
    const responsavel = await this.resolveResponsible(companyId, null, dto);

    try {
      const created = await this.prisma.constructionSite.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          clientName: dto.clientName,
          // ENDEREÇO DE ENTREGA. Precisa estar aqui, campo a campo, porque o
          // `data` é montado explicitamente — um campo que exista no DTO e não
          // apareça nesta lista é aceito pela validação, chega ao service e é
          // descartado em silêncio. Foi exatamente o que aconteceu quando o
          // endereço da obra foi criado: a tela salvava e o dado não gravava.
          zipCode: dto.zipCode,
          addressLine: dto.addressLine,
          addressNumber: dto.addressNumber,
          addressComplement: dto.addressComplement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          state: dto.state,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
          status: dto.status,
          responsibleId: responsavel.responsibleId,
          responsibleName: responsavel.responsibleName,
          description: dto.description,
        },
      });

      // O vínculo depois da criação: a obra precisa existir para ser vinculada.
      if (responsavel.responsibleId) {
        await this.grantDiarioAccess(responsavel.responsibleId, created.id);
      }

      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CODE_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryConstructionSiteDto,
  ): Promise<PaginatedResult<ConstructionSiteListItem>> {
    const { page, limit, search, status, city } = query;

    const where: Prisma.ConstructionSiteWhereInput = {
      companyId,
      deletedAt: null,
      status,
      city: city ? { equals: city, mode: 'insensitive' } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
            { clientName: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.constructionSite.findMany({
        where,
        ...listArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.constructionSite.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string): Promise<ConstructionSiteDetail> {
    const site = await this.prisma.constructionSite.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });

    if (!site) {
      throw new NotFoundException('Obra não encontrada.');
    }

    return site;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateConstructionSiteDto,
  ): Promise<ConstructionSiteDetail> {
    await this.findOne(companyId, id);
    const responsavel = await this.resolveResponsible(companyId, id, dto);

    try {
      await this.prisma.constructionSite.update({
        where: { id, companyId },
        data: {
          code: dto.code,
          name: dto.name,
          clientName: dto.clientName,
          // ENDEREÇO DE ENTREGA. Precisa estar aqui, campo a campo, porque o
          // `data` é montado explicitamente — um campo que exista no DTO e não
          // apareça nesta lista é aceito pela validação, chega ao service e é
          // descartado em silêncio. Foi exatamente o que aconteceu quando o
          // endereço da obra foi criado: a tela salvava e o dado não gravava.
          zipCode: dto.zipCode,
          addressLine: dto.addressLine,
          addressNumber: dto.addressNumber,
          addressComplement: dto.addressComplement,
          neighborhood: dto.neighborhood,
          city: dto.city,
          state: dto.state,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : undefined,
          status: dto.status,
          // `undefined` mantém o valor atual; a troca só acontece quando o
          // cliente manda o campo.
          responsibleId: dto.responsibleId ? responsavel.responsibleId : undefined,
          responsibleName: responsavel.responsibleName,
          description: dto.description,
        },
      });

      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CODE_MESSAGE);
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    const site = await this.findOne(companyId, id);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.constructionSite.update({
        where: { id, companyId },
        data: { deletedAt: now, code: mangleDeletedCode(site.code, site.id) },
      }),
      ...site.costCenters.map((costCenter) =>
        this.prisma.costCenter.update({
          where: { id: costCenter.id },
          data: { deletedAt: now, code: mangleDeletedCode(costCenter.code, costCenter.id) },
        }),
      ),
    ]);
  }
}
