import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const DUPLICATE_NAME_MESSAGE = 'Já existe um perfil com este nome.';

const includeArgs = Prisma.validator<Prisma.RoleDefaultArgs>()({
  include: {
    rolePermissions: { include: { permission: { select: { code: true } } } },
    _count: { select: { userRoles: true } },
  },
});

type RoleWithPermissions = Prisma.RoleGetPayload<typeof includeArgs>;

function withPermissionCodes(role: RoleWithPermissions) {
  const { rolePermissions, _count, ...rest } = role;
  return {
    ...rest,
    permissionCodes: rolePermissions.map((rolePermission) => rolePermission.permission.code),
    userCount: _count.userRoles,
  };
}

@Injectable()
export class RolesManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async create(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    dto: CreateRoleDto,
  ) {
    const permissionIds = await this.resolvePermissionIds(dto.permissionCodes);

    try {
      const created = await this.prisma.role.create({
        data: {
          companyId,
          name: dto.name,
          type: dto.type,
          description: dto.description,
          rolePermissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });

      await this.auditLogger.log({
        companyId,
        userId: actingUserId,
        action: 'CREATE',
        entityType: 'Role',
        entityId: created.id,
        ipAddress,
        changes: { name: dto.name, type: dto.type, permissionCodes: dto.permissionCodes },
      });

      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_NAME_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryRoleDto,
  ): Promise<PaginatedResult<ReturnType<typeof withPermissionCodes>>> {
    const { page, limit, search } = query;

    const where: Prisma.RoleWhereInput = {
      companyId,
      deletedAt: null,
      name: search ? { contains: search, mode: 'insensitive' } : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        ...includeArgs,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.role.count({ where }),
    ]);

    return paginate(data.map(withPermissionCodes), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
    });
    if (!role) {
      throw new NotFoundException('Perfil não encontrado.');
    }
    return withPermissionCodes(role);
  }

  async update(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    dto: UpdateRoleDto,
  ) {
    const existing = await this.assertExists(companyId, id);

    if (existing.isSystem && dto.name && dto.name !== existing.name) {
      throw new ConflictException('Papéis padrão do sistema não podem ser renomeados.');
    }

    const permissionIds = dto.permissionCodes
      ? await this.resolvePermissionIds(dto.permissionCodes)
      : undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id, companyId },
          data: { name: dto.name, type: dto.type, description: dto.description },
        });

        if (permissionIds) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }
      });

      await this.auditLogger.log({
        companyId,
        userId: actingUserId,
        action: 'UPDATE',
        entityType: 'Role',
        entityId: id,
        ipAddress,
        changes: dto as Prisma.InputJsonValue,
      });

      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_NAME_MESSAGE);
      }
      throw error;
    }
  }

  async remove(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
  ): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { _count: { select: { userRoles: true } } },
    });

    if (!role) {
      throw new NotFoundException('Perfil não encontrado.');
    }

    if (role.isSystem) {
      throw new ConflictException('Papéis padrão do sistema não podem ser excluídos.');
    }

    if (role._count.userRoles > 0) {
      throw new ConflictException('Não é possível excluir um perfil com usuários vinculados.');
    }

    await this.prisma.role.update({ where: { id, companyId }, data: { deletedAt: new Date() } });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'DELETE',
      entityType: 'Role',
      entityId: id,
      ipAddress,
    });
  }

  private async assertExists(companyId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!role) {
      throw new NotFoundException('Perfil não encontrado.');
    }
    return role;
  }

  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];

    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    if (permissions.length !== new Set(codes).size) {
      throw new BadRequestException('Uma ou mais permissões informadas não existem.');
    }

    return permissions.map((permission) => permission.id);
  }
}
