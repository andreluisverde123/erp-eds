/// Máscara TEMPORÁRIA de marca, para gravação de vídeo demo.
///
/// Substitui, no banco, tudo que identifica a empresa e seus clientes: nome da
/// empresa, nome do ERP, obras, contratantes, responsáveis e usuários. Guarda
/// os valores originais num arquivo ANTES de escrever, e os devolve com
/// `--restore`.
///
/// **Não é anonimização.** É maquiagem de exibição, reversível, para um vídeo.
/// Os dados continuam todos lá — nos relatórios já emitidos, nas auditorias e
/// nos PDFs gerados antes da máscara.
///
///   aplicar:  npm run demo:mask -w api
///   desfazer: npm run demo:mask:restore -w api
///
/// O arquivo de retorno (`demo-mask-backup.json`) é a ÚNICA cópia dos valores
/// originais. Perdê-lo com a máscara aplicada significa redigitar tudo à mão.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

const BACKUP = join(__dirname, 'demo-mask-backup.json');

const EMPRESA = { tradeName: 'Construtora Modelo', legalName: 'Construtora Modelo Ltda' };
const ERP_NAME = 'ERP';

/// Nomes de obra genéricos, atribuídos na ordem do código. Não descrevem nada
/// real — é exatamente esse o ponto.
const OBRAS = [
  { name: 'Edifício Residencial Aurora', clientName: 'Incorporadora Aurora' },
  { name: 'Centro Administrativo Norte', clientName: 'Cliente Institucional' },
  { name: 'Condomínio Parque das Águas', clientName: 'Parque Empreendimentos' },
  { name: 'Campus Universitário Leste', clientName: 'Instituição de Ensino' },
  { name: 'Galpão Logístico Sul', clientName: 'Operador Logístico' },
  { name: 'Reforma do Anexo Central', clientName: 'Cliente Corporativo' },
];

const PRIMEIROS = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael',
];
const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Gomes',
  'Henriques', 'Iglesias', 'Jardim', 'Lima', 'Martins', 'Nunes', 'Oliveira',
  'Pereira', 'Queiroz',
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface Snapshot {
  criadoEm: string;
  empresas: { id: string; tradeName: string | null; legalName: string }[];
  settings: { id: string; erpName: string | null }[];
  obras: { id: string; name: string; clientName: string | null; responsibleName: string | null }[];
  usuarios: { id: string; name: string; email: string }[];
}

function pessoa(indice: number): string {
  return `${PRIMEIROS[indice % PRIMEIROS.length]} ${SOBRENOMES[(indice * 7) % SOBRENOMES.length]}`;
}

/// E-mail derivado do nome mascarado, com o índice como sufixo.
///
/// O sufixo não é enfeite: dois nomes sorteados podem coincidir e `email` é
/// único no banco — sem ele a máscara falharia no meio, com metade dos
/// usuários já trocados e a outra metade não.
function emailDe(nome: string, indice: number): string {
  const base = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '.');

  return `${base}${indice}@demo.local`;
}

async function aplicar(): Promise<void> {
  if (existsSync(BACKUP)) {
    throw new Error(
      `Já existe ${BACKUP}. A máscara parece estar aplicada — rode --restore antes de aplicar de ` +
        'novo, ou o arquivo com os valores ORIGINAIS seria sobrescrito pelos mascarados.',
    );
  }

  const empresas = await prisma.company.findMany({
    select: { id: true, tradeName: true, legalName: true },
  });
  const settings = await prisma.systemSettings.findMany({ select: { id: true, erpName: true } });
  const obras = await prisma.constructionSite.findMany({
    select: { id: true, name: true, clientName: true, responsibleName: true },
    orderBy: { code: 'asc' },
  });
  const usuarios = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { email: 'asc' },
  });

  const snapshot: Snapshot = { criadoEm: new Date().toISOString(), empresas, settings, obras, usuarios };
  // Gravado ANTES de qualquer escrita: se o processo morrer no meio, o retorno
  // continua possível.
  writeFileSync(BACKUP, JSON.stringify(snapshot, null, 2));

  for (const empresa of empresas) {
    await prisma.company.update({ where: { id: empresa.id }, data: EMPRESA });
  }

  for (const config of settings) {
    await prisma.systemSettings.update({ where: { id: config.id }, data: { erpName: ERP_NAME } });
  }

  for (const [indice, obra] of obras.entries()) {
    const mascara = OBRAS[indice % OBRAS.length]!;
    await prisma.constructionSite.update({
      where: { id: obra.id },
      data: { name: mascara.name, clientName: mascara.clientName, responsibleName: pessoa(indice) },
    });
  }

  const credenciais: string[] = [];
  for (const [indice, usuario] of usuarios.entries()) {
    const nome = pessoa(indice);
    const email = emailDe(nome, indice);
    await prisma.user.update({ where: { id: usuario.id }, data: { name: nome, email } });
    credenciais.push(`  ${usuario.email.padEnd(34)} ->  ${email}`);
  }

  console.log(`\nMáscara aplicada. Valores originais guardados em:\n  ${BACKUP}\n`);
  console.log('ATENÇÃO: os e-mails de LOGIN mudaram enquanto a máscara está ativa.');
  console.log('As senhas continuam as mesmas. Entre com estes:\n');
  console.log(credenciais.join('\n'));
  console.log('\nPara voltar tudo:  npm run demo:mask:restore -w api\n');
}

async function restaurar(): Promise<void> {
  if (!existsSync(BACKUP)) {
    throw new Error(`Não achei ${BACKUP}. Sem ele não há como saber os valores originais.`);
  }

  const snapshot = JSON.parse(readFileSync(BACKUP, 'utf8')) as Snapshot;

  for (const empresa of snapshot.empresas) {
    await prisma.company.update({
      where: { id: empresa.id },
      data: { tradeName: empresa.tradeName, legalName: empresa.legalName },
    });
  }

  for (const config of snapshot.settings) {
    await prisma.systemSettings.update({
      where: { id: config.id },
      data: { erpName: config.erpName },
    });
  }

  for (const obra of snapshot.obras) {
    await prisma.constructionSite.update({
      where: { id: obra.id },
      data: {
        name: obra.name,
        clientName: obra.clientName,
        responsibleName: obra.responsibleName,
      },
    });
  }

  for (const usuario of snapshot.usuarios) {
    await prisma.user.update({
      where: { id: usuario.id },
      data: { name: usuario.name, email: usuario.email },
    });
  }

  console.log(
    `\nRestaurado: ${snapshot.empresas.length} empresa(s), ${snapshot.obras.length} obra(s), ` +
      `${snapshot.usuarios.length} usuário(s).`,
  );
  console.log(`Pode apagar ${BACKUP}.\n`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--restore')) await restaurar();
  else await aplicar();
}

main()
  .catch((erro: unknown) => {
    console.error('\nFALHOU:', erro instanceof Error ? erro.message : erro, '\n');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
