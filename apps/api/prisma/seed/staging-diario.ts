import { randomBytes } from 'node:crypto';

import * as bcrypt from 'bcrypt';

import type { PrismaClient } from '../../generated/prisma/client';
import { DEFAULT_ROLES } from '../../src/common/tenancy/default-roles';

/// Preparação do Diário de Obras num ambiente que JÁ TEM DADO REAL.
///
/// Existe porque `seed/demo.ts` não serve aqui, e não por preferência: ele
/// cria uma empresa-vitrine com obras fictícias e, ao sincronizar os papéis,
/// executa `rolePermission.deleteMany({ notIn: ... })` — o que **removeria**
/// de papéis reais toda permissão fora do template. Num ambiente com usuários
/// de verdade isso é perda de acesso, não preparação de teste.
///
/// Este arquivo, por contraste, é **estritamente aditivo**: só faz `upsert` e
/// `create`, nunca `delete` nem `deleteMany`. Rodar duas vezes produz o mesmo
/// resultado que rodar uma.
///
/// O que ele NÃO faz, de propósito:
///   - não cria empresa, obra ou centro de custo;
///   - não altera usuário existente;
///   - não remove permissão de papel nenhum;
///   - não mexe em RDO.
///
/// Uso (o ambiente é escolhido pelo arquivo de env, como no resto do projeto):
///   DOTENV_CONFIG_PATH=.env.staging npx ts-node --transpile-only \
///     prisma/seed/staging-diario.ts

const SALT_ROUNDS = 12;

/// Sufixo que separa a massa de teste de qualquer usuário real. O domínio
/// `eds.app` não é o da empresa (`eds.com.br`), então uma busca por ele
/// encontra exatamente o que este script criou — e nada além.
const DOMINIO_DE_TESTE = '@eds.app';

/// Papéis que ganham acesso ao Diário, com as permissões que o catálogo padrão
/// já define para cada um. A fonte é `DEFAULT_ROLES`, a mesma que o onboarding
/// usa — nada é inventado aqui.
const PAPEIS_COM_DIARIO = ['Administrador', 'Engenharia', 'Diretoria', 'Fiscal de Obra'];

interface UsuarioDeTeste {
  email: string;
  name: string;
  roleName: string;
  /// Códigos de obra a vincular. Vazio é intencional em um dos casos.
  siteCodes: string[];
  role: 'ENGINEER' | 'INSPECTOR';
}

/// A massa cobre exatamente os cinco casos que o teste manual precisa
/// distinguir. As obras são as REAIS do ambiente — o objetivo é exercitar o
/// isolamento sobre o dado que existe, não sobre um cenário inventado.
const USUARIOS: UsuarioDeTeste[] = [
  {
    email: `diario.engenharia1${DOMINIO_DE_TESTE}`,
    name: '[TESTE] Engenharia 1',
    roleName: 'Engenharia',
    siteCodes: ['OBR-001', 'OBR-003'],
    role: 'ENGINEER',
  },
  {
    email: `diario.engenharia2${DOMINIO_DE_TESTE}`,
    name: '[TESTE] Engenharia 2',
    roleName: 'Engenharia',
    siteCodes: ['OBR-002'],
    role: 'ENGINEER',
  },
  {
    email: `diario.fiscal${DOMINIO_DE_TESTE}`,
    name: '[TESTE] Fiscal de Obra',
    roleName: 'Fiscal de Obra',
    siteCodes: ['OBR-001'],
    role: 'INSPECTOR',
  },
  {
    // Tem a permissão do Diário e NENHUM vínculo: é o caso que prova que
    // cargo não dá acesso a obra.
    email: `diario.admin${DOMINIO_DE_TESTE}`,
    name: '[TESTE] Admin sem obra',
    roleName: 'Administrador',
    siteCodes: [],
    role: 'ENGINEER',
  },
  {
    // Papel sem nenhuma permissão de Diário: não entra.
    email: `diario.sem.acesso${DOMINIO_DE_TESTE}`,
    name: '[TESTE] Sem acesso ao Diário',
    roleName: 'Compras',
    siteCodes: [],
    role: 'ENGINEER',
  },
];

export async function prepararDiarioParaTeste(prisma: PrismaClient, senha: string): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    select: { id: true, legalName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!company) throw new Error('Nenhuma empresa encontrada neste banco.');
  console.log(`Empresa: ${company.legalName}`);

  // 1. Papel "Fiscal de Obra", se ainda não existir. Vem do mesmo template do
  //    onboarding — nome, tipo e descrição idênticos aos de uma empresa nova.
  const templateFiscal = DEFAULT_ROLES.find((papel) => papel.name === 'Fiscal de Obra');
  if (!templateFiscal) throw new Error('Template do papel "Fiscal de Obra" não encontrado.');

  await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: templateFiscal.name } },
    update: {},
    create: {
      companyId: company.id,
      name: templateFiscal.name,
      type: templateFiscal.type,
      description: templateFiscal.description,
      isSystem: true,
    },
  });

  // 2. Permissões do Diário nos papéis que o template já contempla.
  //    ADITIVO: nenhuma permissão existente é removida de nenhum papel.
  const permissoesDoDiario = await prisma.permission.findMany({
    where: { code: { startsWith: 'diario.' } },
    select: { id: true, code: true },
  });
  if (permissoesDoDiario.length === 0) {
    throw new Error('Catálogo sem permissões do Diário — rode o seed do catálogo antes.');
  }
  const idPorCodigo = new Map(permissoesDoDiario.map((p) => [p.code, p.id]));

  for (const nomeDoPapel of PAPEIS_COM_DIARIO) {
    const template = DEFAULT_ROLES.find((papel) => papel.name === nomeDoPapel);
    const papel = await prisma.role.findUnique({
      where: { companyId_name: { companyId: company.id, name: nomeDoPapel } },
      select: { id: true },
    });
    if (!template || !papel) {
      console.log(`  papel "${nomeDoPapel}" não existe neste banco — ignorado`);
      continue;
    }

    const codigos = template.permissionCodes.filter((codigo) => codigo.startsWith('diario.'));
    for (const codigo of codigos) {
      const permissionId = idPorCodigo.get(codigo);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: papel.id, permissionId } },
        update: {},
        create: { roleId: papel.id, permissionId },
      });
    }
    console.log(`  ${nomeDoPapel}: ${codigos.join(', ') || '(nenhuma)'}`);
  }

  // 3. Usuários de teste e vínculos com obras REAIS já cadastradas.
  const passwordHash = await bcrypt.hash(senha, SALT_ROUNDS);

  for (const seed of USUARIOS) {
    const papel = await prisma.role.findUnique({
      where: { companyId_name: { companyId: company.id, name: seed.roleName } },
      select: { id: true },
    });
    if (!papel) {
      console.log(`  ${seed.email}: papel "${seed.roleName}" não existe — ignorado`);
      continue;
    }

    const usuario = await prisma.user.upsert({
      where: { email: seed.email },
      // O `update` só toca o que é do teste. Se alguém já usa este e-mail (não
      // deveria — o domínio é exclusivo da massa), nada de real se perde.
      update: { name: seed.name, passwordHash, isActive: true, mustChangePassword: false },
      create: {
        companyId: company.id,
        name: seed.name,
        email: seed.email,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: usuario.id, roleId: papel.id } },
      update: {},
      create: { userId: usuario.id, roleId: papel.id },
    });

    const obras: string[] = [];
    for (const code of seed.siteCodes) {
      const obra = await prisma.constructionSite.findUnique({
        where: { companyId_code: { companyId: company.id, code } },
        select: { id: true, name: true },
      });
      if (!obra) {
        console.log(`    obra ${code} não existe — vínculo ignorado`);
        continue;
      }
      await prisma.userConstructionSite.upsert({
        where: { userId_constructionSiteId: { userId: usuario.id, constructionSiteId: obra.id } },
        update: { role: seed.role },
        create: { userId: usuario.id, constructionSiteId: obra.id, role: seed.role },
      });
      obras.push(`${code} (${obra.name.slice(0, 28)})`);
    }

    console.log(`  ${seed.email} [${seed.roleName}] -> ${obras.join(', ') || 'nenhuma obra'}`);
  }
}

/// Senha forte gerada na hora. O ambiente é acessível pela internet e tem dado
/// real: uma senha conhecida e fixa (como a `Eds@12345` do seed de
/// demonstração) não pode entrar aqui.
export function gerarSenha(): string {
  return `Diario!${randomBytes(9).toString('base64url')}`;
}
