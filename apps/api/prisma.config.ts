import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/// Comandos do Prisma CLI que realmente abrem conexão com o banco. `generate`
/// (o único que roda durante o build da imagem/CI) não está aqui de propósito:
/// ele só lê o schema e escreve o Client em `generated/`.
const DATASOURCE_COMMANDS = ['migrate', 'db', 'studio'];

const needsDatasource = process.argv.some((arg) => DATASOURCE_COMMANDS.includes(arg));
const directUrl = process.env.DIRECT_URL;

if (needsDatasource && !directUrl) {
  throw new Error(
    'DIRECT_URL não definida — comandos de migration/seed/studio precisam da conexão direta com o Postgres (porta 5432, sem pooler).',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    // Migrate precisa de conexão direta (sem pooler em transaction mode).
    // O placeholder nunca é usado de verdade: qualquer comando que toque o
    // banco já morreu na checagem acima. Ele existe só para `prisma generate`
    // conseguir rodar em ambientes sem DATABASE_URL/DIRECT_URL — build da
    // imagem Docker e CI — em vez de derrubar o build inteiro
    // (`env('DIRECT_URL')` resolvia a variável de forma ansiosa e explodia lá).
    url: directUrl ?? 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder',
  },
});
