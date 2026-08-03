import * as bcrypt from 'bcrypt';

import type { PrismaClient } from '../../generated/prisma/client';
import { ADMIN_ROLE_NAME, DEFAULT_ROLES } from '../../src/common/tenancy/default-roles';

/// Bootstrap de uma instalação nova: cria a EDS, os papéis padrão e o primeiro
/// administrador.
///
/// Existe porque um banco recém-migrado NÃO tinha caminho de entrada. O seed de
/// produção (`SEED_DEMO=false`) popula só a tabela `Permission` — global e sem
/// dono —, e o único caminho que criava empresa + papéis + usuário era o
/// `POST /onboarding/signup`, fechado por `PUBLIC_SIGNUP_ENABLED` na API e por
/// `VITE_PUBLIC_SIGNUP_ENABLED` no bundle do front (variável de BUILD: abrir a
/// tela `/cadastro` custaria um rebuild da imagem web). O resultado era um
/// sistema de pé, saudável no healthcheck, em que ninguém conseguia entrar.
///
/// Aqui não há rota HTTP nem tela: roda no mesmo job de pré-deploy que já
/// aplica as migrations, com as credenciais passadas por ambiente.
///
/// Os papéis vêm de `DEFAULT_ROLES` — a MESMA fonte do onboarding self-service
/// e do seed de demonstração. Uma empresa criada por aqui é indistinguível de
/// uma criada por qualquer outro caminho; era esse o ponto do arquivo.
const SALT_ROUNDS = 12;

/// Espelha `SignupDto`/`CreateUserDto` (8–72, ao menos uma letra e um número).
/// Sem isto, o bootstrap seria a única porta do sistema capaz de gravar uma
/// senha mais fraca do que a própria aplicação aceita.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const PASSWORD_PATTERN = /(?=.*[A-Za-z])(?=.*\d)/;

const DEFAULT_ADMIN_NAME = 'Administrador';
const COMPANY_SLUG = 'eds';

/// Razão social PROVISÓRIA, igual ao que o onboarding self-service faz. Os
/// dados fiscais de verdade (razão social, CNPJ, inscrição estadual, endereço)
/// são preenchidos em Configurações → Empresa, que é a fonte operacional deles.
///
/// Deliberadamente NÃO lê `EDS_COMPANY` de `@repo/types`: aquele objeto é a
/// identidade da APLICAÇÃO (aba do navegador, splash, tela de login — o que
/// aparece antes de existir sessão), e o próprio arquivo pede para não
/// confundi-lo com o registro `Company` do banco. Copiar um no outro criaria
/// duas fontes para o mesmo dado, divergindo no primeiro `PATCH /company`.
const DEFAULT_COMPANY_NAME = 'EDS Construtora';

export interface BootstrapConfig {
  email: string;
  password: string;
  name: string;
  companyName: string;
}

/// Lê a configuração do ambiente. Devolve `null` quando o bootstrap não foi
/// pedido — é o caso normal de todo deploy depois do primeiro.
export function readBootstrapConfig(env: NodeJS.ProcessEnv): BootstrapConfig | null {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email && !password) return null;

  // Uma das duas presente e a outra não é quase sempre erro de digitação no
  // `--env-file`. Falhar aqui é melhor que ignorar em silêncio e deixar o
  // operador achando que criou o admin.
  if (!email || !password) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD precisam ser definidas juntas.',
    );
  }

  if (!email.includes('@')) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL não é um e-mail válido.');
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PASSWORD deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`,
    );
  }

  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD deve conter ao menos uma letra e um número.');
  }

  return {
    email,
    password,
    name: env.BOOTSTRAP_ADMIN_NAME?.trim() || DEFAULT_ADMIN_NAME,
    companyName: env.BOOTSTRAP_COMPANY_NAME?.trim() || DEFAULT_COMPANY_NAME,
  };
}

/// Idempotente por desenho: se já existe QUALQUER usuário no banco, não faz
/// nada. Rodar o seed de novo num sistema em uso não pode ressuscitar um admin
/// com senha de ambiente — que estaria num arquivo `.env` antigo, fora do
/// controle de quem opera hoje.
export async function seedBootstrap(
  prisma: PrismaClient,
  permissionByCode: Map<string, { id: string }>,
  config: BootstrapConfig,
): Promise<void> {
  const existingUser = await prisma.user.findFirst({ select: { id: true } });
  if (existingUser) {
    console.log('Bootstrap ignorado: o banco já tem usuário cadastrado.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // `upsert` em vez de `create` para o caso de uma tentativa anterior ter
    // criado a empresa e falhado depois (transação abortada por senha inválida,
    // conexão caída). O bootstrap tem que poder ser repetido.
    const company = await tx.company.upsert({
      where: { slug: COMPANY_SLUG },
      update: {},
      create: {
        slug: COMPANY_SLUG,
        // Sem CNPJ, igual ao onboarding: entra a razão social provisória e os
        // dados fiscais são completados em Configurações → Empresa.
        legalName: config.companyName,
        tradeName: config.companyName,
        status: 'ACTIVE',
        plan: 'ENTERPRISE',
      },
      select: { id: true },
    });

    let adminRoleId: string | null = null;
    for (const template of DEFAULT_ROLES) {
      const permissionIds = template.permissionCodes
        .map((code) => permissionByCode.get(code)?.id)
        .filter((id): id is string => Boolean(id));

      const role = await tx.role.upsert({
        where: { companyId_name: { companyId: company.id, name: template.name } },
        update: {},
        create: {
          companyId: company.id,
          name: template.name,
          type: template.type,
          description: template.description,
          // Mesma proteção dos papéis do onboarding: não podem ser excluídos
          // nem renomeados, pra ninguém deixar a empresa sem perfil admin.
          isSystem: true,
          rolePermissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        select: { id: true, name: true },
      });

      if (role.name === ADMIN_ROLE_NAME) adminRoleId = role.id;
    }

    if (!adminRoleId) {
      // Só acontece se DEFAULT_ROLES for editado errado — melhor derrubar a
      // transação do que criar uma empresa sem administrador.
      throw new Error(`Papel "${ADMIN_ROLE_NAME}" não encontrado entre os papéis padrão.`);
    }

    const passwordHash = await bcrypt.hash(config.password, SALT_ROUNDS);

    await tx.user.create({
      data: {
        companyId: company.id,
        name: config.name,
        email: config.email,
        passwordHash,
        // A senha veio por ambiente e passou por um arquivo `.env` — trata-se
        // de senha temporária, exatamente como a que um admin define para outro
        // usuário. O `PasswordChangeGuard` bloqueia tudo até a troca.
        mustChangePassword: true,
        userRoles: { create: { roleId: adminRoleId } },
      },
    });
  });

  console.log(`Empresa criada: ${config.companyName} (slug=${COMPANY_SLUG})`);
  console.log(`Papéis: ${DEFAULT_ROLES.map((role) => role.name).join(', ')}`);
  console.log(`Administrador: ${config.email}`);
  console.log('A senha informada é temporária — o sistema exige a troca no primeiro acesso.');
}
