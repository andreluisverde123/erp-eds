import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService, type AuthResult } from '../auth/auth.service';
import {
  ADMIN_ROLE_NAME,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
} from '../common/tenancy/default-roles';
import { PrismaService } from '../prisma/prisma.service';
import type { SignupDto } from './dto/signup.dto';

const SALT_ROUNDS = 12;

/// Versão do texto de termos aceito no cadastro. Trocou o texto, troca isto —
/// é o que permite saber depois QUAL versão cada usuário aceitou.
export const TERMS_VERSION = '2026-07-27';

const FALLBACK_SLUG = 'construtora';

function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove os acentos separados pelo NFD acima
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /// Cria empresa + os 6 papéis padrão + o primeiro usuário (Administrador) e
  /// já devolve a sessão — quem acabou de se cadastrar entra direto, sem
  /// passar pela tela de login.
  ///
  /// Tudo numa transação: uma empresa sem papéis, ou com papéis mas sem
  /// usuário, seria um tenant órfão impossível de acessar e invisível para
  /// qualquer tela de administração.
  async signup(dto: SignupDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const companyName = dto.companyName.trim();

    // `User.email` é único no banco INTEIRO (não por empresa), então este
    // conflito também acontece quando o e-mail já pertence a outro tenant.
    // A mensagem é deliberadamente vaga sobre isso.
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const slug = await this.buildUniqueSlug(companyName);

    await this.prisma.$transaction(async (tx) => {
      // O catálogo de permissões é global e normalmente vem do seed — mas um
      // banco de produção recém-migrado pode não ter rodado seed nenhum, e aí
      // a primeira empresa nasceria com papéis sem nenhuma permissão.
      for (const permission of DEFAULT_PERMISSIONS) {
        await tx.permission.upsert({
          where: { code: permission.code },
          update: {},
          create: permission,
        });
      }

      const permissions = await tx.permission.findMany({ select: { id: true, code: true } });
      const permissionIdByCode = new Map(
        permissions.map((permission) => [permission.code, permission.id]),
      );

      const company = await tx.company.create({
        data: {
          slug,
          // Sem CNPJ: entra como razão social provisória o nome informado, e o
          // usuário completa os dados fiscais depois em Configurações.
          legalName: companyName,
          tradeName: companyName,
          status: 'TRIAL',
          plan: 'STARTER',
        },
        select: { id: true },
      });

      let adminRoleId: string | null = null;
      for (const template of DEFAULT_ROLES) {
        const role = await tx.role.create({
          data: {
            companyId: company.id,
            name: template.name,
            type: template.type,
            description: template.description,
            // Mesma proteção dos papéis do seed: não podem ser excluídos nem
            // renomeados, pra ninguém deixar a empresa sem perfil admin.
            isSystem: true,
            rolePermissions: {
              create: template.permissionCodes
                .map((code) => permissionIdByCode.get(code))
                .filter((permissionId): permissionId is string => Boolean(permissionId))
                .map((permissionId) => ({ permissionId })),
            },
          },
          select: { id: true, name: true },
        });
        if (role.name === ADMIN_ROLE_NAME) adminRoleId = role.id;
      }

      if (!adminRoleId) {
        // Só acontece se DEFAULT_ROLES for editado errado — melhor derrubar a
        // transação do que criar um tenant sem administrador.
        throw new Error(`Papel "${ADMIN_ROLE_NAME}" não encontrado entre os papéis padrão.`);
      }

      await tx.user.create({
        data: {
          companyId: company.id,
          name: dto.name.trim(),
          email,
          passwordHash,
          acceptedTermsAt: new Date(),
          termsVersion: TERMS_VERSION,
          userRoles: { create: { roleId: adminRoleId } },
        },
      });
    });

    this.logger.log(`Nova empresa cadastrada: ${companyName} (slug=${slug})`);

    // Reaproveita o login em vez de duplicar a emissão de tokens: um caminho
    // só para criar sessão significa um caminho só para mudar (rotação de
    // refresh token, expiração, formato do payload).
    return this.authService.login(email, dto.password);
  }

  /// `Company.slug` é único no banco todo. Duas construtoras com o mesmo nome
  /// são absolutamente normais, então o slug ganha sufixo numérico.
  private async buildUniqueSlug(companyName: string): Promise<string> {
    const base = toSlug(companyName) || FALLBACK_SLUG;
    const taken = new Set(
      (
        await this.prisma.company.findMany({
          where: { slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((company) => company.slug),
    );

    if (!taken.has(base)) return base;

    for (let suffix = 2; suffix <= 999; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }

    throw new ConflictException(
      'Não foi possível gerar um identificador para esta empresa. Tente outro nome.',
    );
  }
}
