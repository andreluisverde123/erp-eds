import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ACCESS_TOKEN_TTL, DEFAULT_REFRESH_TOKEN_TTL } from './constants';
import { hashToken } from './hash-token.util';
import type { JwtPayload, RefreshTokenPayload } from './types/jwt-payload.type';

// `select` (não `include`) pra não trazer `passwordHash` em toda chamada de
// refresh/perfil — só `login()` precisa do hash, e só pra comparar com bcrypt
// uma vez, nunca devolvido em nenhuma resposta.
const userAccessArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    name: true,
    email: true,
    companyId: true,
    isActive: true,
    deletedAt: true,
    mustChangePassword: true,
    // O tenant também precisa estar de pé: um usuário ativo dentro de uma
    // empresa suspensa/cancelada não pode entrar (ver `assertCompanyActive`).
    // `tradeName`/`legalName`/`logoUrl` viajam junto porque a interface exibe
    // a marca de QUEM está logado — o produto não sabe o nome de nenhum
    // cliente em tempo de compilação (ver `tenant` em PublicUser).
    company: {
      select: {
        status: true,
        deletedAt: true,
        tradeName: true,
        legalName: true,
        logoUrl: true,
        systemSettings: { select: { erpName: true } },
      },
    },
    userRoles: {
      select: {
        role: {
          select: {
            name: true,
            rolePermissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    },
  },
});

const userWithPasswordArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: { ...userAccessArgs.select, passwordHash: true },
});

type UserWithAccess = Prisma.UserGetPayload<typeof userAccessArgs>;

/// Identidade do inquilino logado. Existe para a interface poder exibir a
/// marca de quem está usando o sistema, em vez de uma marca fixa no código —
/// é o que permite a mesma build servir qualquer cliente.
export interface PublicTenant {
  id: string;
  /// Nome comercial, com a razão social como reserva.
  name: string;
  /// Caminho do logo no storage, ou `null` para a interface usar o do produto.
  logoUrl: string | null;
  /// Como o cliente chama o sistema (Configurações → Sistema). `null` mantém
  /// o nome do produto.
  erpName: string | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  /// O front usa isto para empurrar a tela de troca de senha antes de
  /// qualquer outra coisa.
  mustChangePassword: boolean;
  tenant: PublicTenant;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: PublicUser;
}

/// Mesmo custo usado no seed e no cadastro de usuários.
const SALT_ROUNDS = 12;

const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.';
const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. Faça login novamente.';
const COMPANY_BLOCKED_MESSAGE =
  'O acesso desta empresa está suspenso. Fale com o responsável pela conta ou com o suporte.';

/// Situações de tenant que permitem usar o sistema. `TRIAL` entra aqui de
/// propósito: é o estado em que toda empresa nasce pelo cadastro
/// self-service. `SUSPENDED`/`CANCELLED` barram o login — é o que torna
/// possível cortar o acesso de um cliente inadimplente sem apagar dado nenhum.
const ACTIVE_TENANT_STATUSES = new Set(['ACTIVE', 'TRIAL']);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email }, ...userWithPasswordArgs });

    if (!user || !user.isActive || user.deletedAt) {
      this.logger.warn(`Login falhou (usuário inexistente ou inativo): ${email}`);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      this.logger.warn(`Login falhou (senha incorreta): ${email}`);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Depois da senha, de propósito: quem erra a senha não descobre o estado
    // da conta da empresa.
    this.assertCompanyActive(user);

    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      this.logger.warn('Refresh falhou: token JWT inválido ou expirado.');
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      stored.userId !== payload.sub
    ) {
      this.logger.warn(
        `Refresh falhou: token revogado/expirado/inconsistente (userId=${payload.sub}).`,
      );
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    // Rotação: o token usado é revogado imediatamente, mesmo que a emissão
    // do novo par falhe em seguida — reuso de um token já trocado nunca é válido.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      ...userAccessArgs,
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    // Revalidado a cada refresh (no máximo 15 min de latência): suspender uma
    // empresa derruba as sessões já abertas, não só os logins novos.
    this.assertCompanyActive(user);

    return this.issueSession(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /// Troca da própria senha. Devolve uma sessão nova porque o `mustChangePassword`
  /// vive dentro do access token: sem token novo, o usuário continuaria preso
  /// na tela de troca até o token velho expirar.
  ///
  /// Revoga todos os refresh tokens do usuário — se a senha temporária vazou
  /// (ela circula por WhatsApp, papel, e-mail pessoal), qualquer sessão aberta
  /// com ela morre aqui.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      ...userWithPasswordArgs,
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentMatches) {
      this.logger.warn(`Troca de senha negada (senha atual incorreta): ${user.email}`);
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log(`Senha alterada pelo próprio usuário: ${user.email}`);

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      ...userAccessArgs,
    });
    return this.issueSession(updated);
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...userAccessArgs });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    this.assertCompanyActive(user);

    return this.toPublicUser(user);
  }

  /// Barra o acesso quando o tenant não está mais ativo. Os campos
  /// `Company.status` e `Company.deletedAt` existiam desde o início do
  /// projeto, mas nenhum caminho de autenticação os consultava — na prática
  /// não havia como suspender um cliente.
  private assertCompanyActive(user: UserWithAccess): void {
    if (user.company.deletedAt || !ACTIVE_TENANT_STATUSES.has(user.company.status)) {
      this.logger.warn(
        `Acesso bloqueado: empresa ${user.companyId} está ${user.company.deletedAt ? 'excluída' : user.company.status} (usuário ${user.email}).`,
      );
      throw new ForbiddenException(COMPANY_BLOCKED_MESSAGE);
    }
  }

  private async issueSession(user: UserWithAccess): Promise<AuthResult> {
    const publicUser = this.toPublicUser(user);
    const accessToken = this.signAccessToken(publicUser, user.companyId);
    const { refreshToken, expiresAt } = await this.issueRefreshToken(user.id);

    return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt, user: publicUser };
  }

  private toPublicUser(user: UserWithAccess): PublicUser {
    const roles = user.userRoles.map((userRole) => userRole.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      permissions,
      mustChangePassword: user.mustChangePassword,
      tenant: {
        id: user.companyId,
        name: user.company.tradeName ?? user.company.legalName,
        logoUrl: user.company.logoUrl,
        erpName: user.company.systemSettings?.erpName ?? null,
      },
    };
  }

  private signAccessToken(publicUser: PublicUser, companyId: string): string {
    const payload: JwtPayload = {
      sub: publicUser.id,
      email: publicUser.email,
      name: publicUser.name,
      companyId,
      roles: publicUser.roles,
      permissions: publicUser.permissions,
      mustChangePassword: publicUser.mustChangePassword,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
        DEFAULT_ACCESS_TOKEN_TTL) as StringValue,
    });
  }

  private async issueRefreshToken(
    userId: string,
  ): Promise<{ refreshToken: string; expiresAt: Date }> {
    const payload: RefreshTokenPayload = { sub: userId, jti: randomUUID() };
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      algorithm: 'HS256',
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
        DEFAULT_REFRESH_TOKEN_TTL) as StringValue,
    });

    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
    });

    return { refreshToken, expiresAt };
  }
}
