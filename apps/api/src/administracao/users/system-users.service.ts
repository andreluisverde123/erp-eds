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
import { CreateSystemUserDto } from './dto/create-system-user.dto';
import { QuerySystemUserDto } from './dto/query-system-user.dto';
import { UpdateSystemUserDto } from './dto/update-system-user.dto';

const DUPLICATE_EMAIL_MESSAGE = 'Já existe um usuário com este e-mail.';
const UNKNOWN_ROLE_MESSAGE = 'Perfil informado não existe.';
const NOT_FOUND_MESSAGE = 'Usuário não encontrado.';
const SELF_DEACTIVATE_MESSAGE = 'Você não pode desativar a própria conta.';
const SELF_RESET_MESSAGE =
  'Você não pode gerar uma senha temporária para a própria conta. Use "Trocar senha".';

// `select` explícito (nunca `include`) para garantir que `passwordHash` jamais
// seja lido do banco por este service — não dá pra vazar em uma resposta um
// campo que nunca chegou a sair do Postgres.
const selectArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    name: true,
    email: true,
    isActive: true,
    mustChangePassword: true,
    createdAt: true,
    updatedAt: true,
    userRoles: { select: { role: { select: { id: true, name: true } } } },
  },
});

type UserRow = Prisma.UserGetPayload<typeof selectArgs>;

interface UserRef {
  id: string;
  name: string;
}

/// Situação do usuário na listagem. É derivada de dois booleanos que já
/// existem no `User` (`isActive` + `mustChangePassword`), não de uma coluna
/// nova: um estado armazenado poderia divergir deles no primeiro `update`
/// que esquecesse de mantê-lo em dia.
///
/// `INACTIVE` tem precedência sobre `PENDING_FIRST_ACCESS`: quem foi
/// desativado antes de entrar pela primeira vez não tem acesso nenhum, e é
/// isso que o admin precisa ver.
export type SystemUserStatus = 'ACTIVE' | 'PENDING_FIRST_ACCESS' | 'INACTIVE';

function toStatus(user: { isActive: boolean; mustChangePassword: boolean }): SystemUserStatus {
  if (!user.isActive) return 'INACTIVE';
  return user.mustChangePassword ? 'PENDING_FIRST_ACCESS' : 'ACTIVE';
}

/// Espelho de `toStatus` no lado do banco — o filtro da listagem precisa
/// resultar exatamente nas linhas que exibiriam aquele badge.
function statusFilter(status: SystemUserStatus | undefined): Prisma.UserWhereInput {
  switch (status) {
    case 'ACTIVE':
      return { isActive: true, mustChangePassword: false };
    case 'PENDING_FIRST_ACCESS':
      return { isActive: true, mustChangePassword: true };
    case 'INACTIVE':
      return { isActive: false };
    default:
      return {};
  }
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  /// Senha ainda é a temporária gerada por um admin: o usuário nunca entrou,
  /// ou entrou e não concluiu a troca obrigatória.
  mustChangePassword: boolean;
  status: SystemUserStatus;
  roles: UserRef[];
  /// Último login/refresh de sessão do usuário, `null` se ele nunca entrou.
  lastAccessAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /// Quem cadastrou o usuário. `null` para as contas que não nasceram dentro
  /// do sistema (seed de implantação, auto-cadastro da empresa).
  createdBy: UserRef | null;
}

/// Gestão dos usuários com acesso ao sistema (identidade + perfil + status).
/// Não tem relação com o cadastro de colaboradores do RH: aqui só existe quem
/// entra no ERP.
///
/// Dois campos da listagem são derivados em vez de armazenados no `User`, para
/// não duplicar informação que o banco já tem:
///  - `lastAccessAt` = data do refresh token mais recente do usuário. O login
///    emite um token e cada refresh rotaciona (revoga o antigo e cria outro),
///    então o `createdAt` mais alto é a última vez que aquela sessão teve vida.
///  - `createdBy` = autor do registro `AuditLog` de CREATE sobre o próprio
///    usuário, escrito no cadastro (ver `create` abaixo).
@Injectable()
export class SystemUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async findAll(
    companyId: string,
    query: QuerySystemUserDto,
  ): Promise<PaginatedResult<SystemUser>> {
    const { page, limit, name, roleId, status } = query;

    const where: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      name: name ? { contains: name, mode: 'insensitive' } : undefined,
      userRoles: roleId ? { some: { roleId } } : undefined,
      ...statusFilter(status),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        ...selectArgs,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(await this.withDerivedFields(companyId, rows), total, page, limit);
  }

  async findOne(companyId: string, id: string): Promise<SystemUser> {
    const row = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      ...selectArgs,
    });
    if (!row) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    // `withDerivedFields` devolve uma linha por linha recebida.
    const [user] = await this.withDerivedFields(companyId, [row]);
    if (!user) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    return user;
  }

  /// Cadastro sem senha: quem cria o usuário informa só identidade, perfil e
  /// status. A senha inicial é gerada aqui e devolvida UMA única vez para o
  /// admin repassar por fora do sistema — o `mustChangePassword` obriga a
  /// troca no primeiro acesso (ver PasswordChangeGuard), então ela serve
  /// apenas para entrar.
  async create(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    dto: CreateSystemUserDto,
  ): Promise<SystemUser & { temporaryPassword: string }> {
    await this.assertRoleExists(companyId, dto.roleId);
    await this.assertEmailAvailable(dto.email);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    let createdId: string;
    try {
      const created = await this.prisma.user.create({
        data: {
          companyId,
          name: dto.name,
          email: dto.email,
          passwordHash,
          mustChangePassword: true,
          isActive: dto.isActive ?? true,
          userRoles: { create: { roleId: dto.roleId } },
        },
        select: { id: true },
      });
      createdId = created.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }

    // Nunca logar a senha em si — só o que o admin decidiu sobre o usuário.
    // Este registro é também a origem do "Criado por" da listagem.
    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'CREATE',
      entityType: 'User',
      entityId: createdId,
      ipAddress,
      changes: {
        name: dto.name,
        email: dto.email,
        roleId: dto.roleId,
        isActive: dto.isActive ?? true,
      },
    });

    return { ...(await this.findOne(companyId, createdId)), temporaryPassword };
  }

  async update(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    dto: UpdateSystemUserDto,
  ): Promise<SystemUser> {
    await this.assertExists(companyId, id);

    if (dto.roleId) {
      await this.assertRoleExists(companyId, dto.roleId);
    }
    if (dto.email) {
      await this.assertEmailAvailable(dto.email, id);
    }
    if (dto.isActive === false) {
      this.assertNotSelfDeactivation(actingUserId, id);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id, companyId },
          data: { name: dto.name, email: dto.email, isActive: dto.isActive },
        });

        // Um usuário tem exatamente um perfil nesta tela: troca substitui o
        // vínculo em vez de acumular.
        if (dto.roleId) {
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.create({ data: { userId: id, roleId: dto.roleId } });
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
      }
      throw error;
    }

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
  }

  async updateStatus(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    isActive: boolean,
  ): Promise<SystemUser> {
    await this.assertExists(companyId, id);

    if (!isActive) {
      this.assertNotSelfDeactivation(actingUserId, id);
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

  /// Gera uma nova senha temporária para um usuário que perdeu a dele (ou que
  /// nunca chegou a receber a primeira). Devolve a senha em texto puro UMA
  /// única vez, no corpo da resposta — não existe envio de e-mail nesta etapa,
  /// então é o admin quem repassa por um canal seguro. No banco fica só o hash.
  ///
  /// Volta a marcar `mustChangePassword`, o que devolve o usuário ao fluxo de
  /// primeiro acesso, e revoga as sessões abertas dele: se a senha antiga
  /// estava comprometida (o motivo mais comum de um reset), deixar um refresh
  /// token vivo manteria o invasor dentro do sistema mesmo depois da troca.
  async resetPassword(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
  ): Promise<SystemUser & { temporaryPassword: string }> {
    await this.assertExists(companyId, id);
    this.assertNotSelfReset(actingUserId, id);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id, companyId },
        data: { passwordHash, mustChangePassword: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Nunca logar a senha em si — só o fato de que houve um reset, e por quem.
    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      ipAddress,
      changes: { action: 'password_reset' },
    });

    return { ...(await this.findOne(companyId, id)), temporaryPassword };
  }

  /// Duas consultas agregadas por página (não uma por linha) para montar
  /// "Último acesso" e "Criado por".
  private async withDerivedFields(companyId: string, rows: UserRow[]): Promise<SystemUser[]> {
    const ids = rows.map((row) => row.id);
    const [lastAccessByUser, creatorByUser] = await Promise.all([
      this.lastAccessByUser(ids),
      this.creatorByUser(companyId, ids),
    ]);

    return rows.map(({ userRoles, ...user }) => ({
      ...user,
      status: toStatus(user),
      roles: userRoles.map((userRole) => userRole.role),
      lastAccessAt: lastAccessByUser.get(user.id) ?? null,
      createdBy: creatorByUser.get(user.id) ?? null,
    }));
  }

  private async lastAccessByUser(userIds: string[]): Promise<Map<string, Date | null>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.prisma.refreshToken.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { createdAt: true },
    });

    return new Map(rows.map((row) => [row.userId, row._max.createdAt]));
  }

  private async creatorByUser(
    companyId: string,
    userIds: string[],
  ): Promise<Map<string, UserRef | null>> {
    if (userIds.length === 0) return new Map();

    const logs = await this.prisma.auditLog.findMany({
      where: { companyId, entityType: 'User', action: 'CREATE', entityId: { in: userIds } },
      orderBy: { createdAt: 'asc' },
      select: { entityId: true, user: { select: { id: true, name: true } } },
    });

    const creators = new Map<string, UserRef | null>();
    // O primeiro CREATE é o cadastro; qualquer log posterior sobre o mesmo id
    // (improvável, mas possível) não muda quem criou.
    for (const log of logs) {
      if (!creators.has(log.entityId)) {
        creators.set(log.entityId, log.user);
      }
    }
    return creators;
  }

  private async assertExists(companyId: string, id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
  }

  private async assertRoleExists(companyId: string, roleId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException(UNKNOWN_ROLE_MESSAGE);
    }
  }

  /// A constraint única do banco é a garantia final, mas ela diferencia
  /// maiúsculas — e "Joao@eds.com" e "joao@eds.com" são a mesma caixa de
  /// e-mail para quem usa o sistema. A checagem aqui é insensível a caixa e
  /// vale para toda a base (o e-mail é único globalmente, não por empresa).
  private async assertEmailAvailable(email: string, ignoreUserId?: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        id: ignoreUserId ? { not: ignoreUserId } : undefined,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(DUPLICATE_EMAIL_MESSAGE);
    }
  }

  private assertNotSelfDeactivation(actingUserId: string, targetUserId: string): void {
    if (actingUserId === targetUserId) {
      throw new BadRequestException(SELF_DEACTIVATE_MESSAGE);
    }
  }

  /// Resetar a própria senha aqui derrubaria a sessão do admin no mesmo
  /// instante (as sessões são revogadas) e o prenderia na tela de troca de
  /// senha. Quem quer trocar a própria senha tem o fluxo normal para isso.
  private assertNotSelfReset(actingUserId: string, targetUserId: string): void {
    if (actingUserId === targetUserId) {
      throw new BadRequestException(SELF_RESET_MESSAGE);
    }
  }
}
