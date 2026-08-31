import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { generateTemporaryPassword, hashPassword } from '../../common/utils/password.util';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const DUPLICATE_EMAIL_MESSAGE = 'Já existe um usuário com este e-mail.';
const SELF_DEACTIVATE_MESSAGE = 'Você não pode desativar a própria conta.';

// `select` explícito (nunca `include`) para garantir que `passwordHash`
// jamais seja lido do banco por este service — não dá pra vazar em uma
// resposta um campo que nunca chegou a sair do Postgres.
const selectArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    companyId: true,
    name: true,
    email: true,
    phone: true,
    position: true,
    isActive: true,
    diarioEnabled: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    userRoles: { select: { role: { select: { id: true, name: true } } } },
  },
});

type UserWithRoles = Prisma.UserGetPayload<typeof selectArgs>;

function withRoles(user: UserWithRoles) {
  const { userRoles, ...rest } = user;
  return { ...rest, roles: userRoles.map((userRole) => userRole.role) };
}

@Injectable()
export class UsersManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async create(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    dto: CreateUserDto,
  ) {
    await this.assertRole(companyId, dto.roleId);

    try {
      const passwordHash = await hashPassword(dto.password);
      const created = await this.prisma.user.create({
        data: {
          companyId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          position: dto.position,
          passwordHash,
          // A senha definida aqui é do admin, não do dono da conta: ela é
          // repassada por fora do sistema e precisa ser trocada no primeiro
          // acesso (ver PasswordChangeGuard).
          mustChangePassword: true,
          userRoles: { create: { roleId: dto.roleId } },
        },
      });

      await this.auditLogger.log({
        companyId,
        userId: actingUserId,
        action: 'CREATE',
        entityType: 'User',
        entityId: created.id,
        ipAddress,
        changes: { name: dto.name, email: dto.email, roleId: dto.roleId },
      });

      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryUserDto,
  ): Promise<PaginatedResult<ReturnType<typeof withRoles>>> {
    const { page, limit, search, status, roleId } = query;

    const where: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      isActive: status === 'ACTIVE' ? true : status === 'INACTIVE' ? false : undefined,
      userRoles: roleId ? { some: { roleId } } : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        ...selectArgs,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data.map(withRoles), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      ...selectArgs,
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return withRoles(user);
  }

  async update(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    dto: UpdateUserDto,
  ) {
    await this.assertExists(companyId, id);
    if (dto.roleId) {
      await this.assertRole(companyId, dto.roleId);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id, companyId },
          data: { name: dto.name, email: dto.email, phone: dto.phone, position: dto.position },
        });

        if (dto.roleId) {
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.create({ data: { userId: id, roleId: dto.roleId } });
        }
      });

      await this.auditLogger.log({
        companyId,
        userId: actingUserId,
        action: 'UPDATE',
        entityType: 'User',
        entityId: id,
        ipAddress,
        changes: dto as Prisma.InputJsonValue,
      });

      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }
  }

  async updateStatus(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    isActive: boolean,
  ) {
    await this.assertExists(companyId, id);

    if (id === actingUserId && !isActive) {
      throw new BadRequestException(SELF_DEACTIVATE_MESSAGE);
    }

    await this.prisma.user.update({ where: { id, companyId }, data: { isActive } });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      ipAddress,
      changes: { isActive },
    });

    return this.findOne(companyId, id);
  }

  async resetPassword(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
  ): Promise<{ temporaryPassword: string }> {
    await this.assertExists(companyId, id);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    // Senha temporária serve só para entrar uma vez: o PasswordChangeGuard
    // bloqueia o resto do sistema até o usuário definir a dele.
    await this.prisma.user.update({
      where: { id, companyId },
      data: { passwordHash, mustChangePassword: true },
    });

    // Nunca logar a senha em si — só o fato de que foi resetada.
    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      ipAddress,
      changes: { action: 'password_reset' },
    });

    return { temporaryPassword };
  }

  private async assertExists(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  private async assertRole(companyId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId, deletedAt: null },
    });
    if (!role) {
      throw new BadRequestException('Perfil informado não existe.');
    }
  }
}
