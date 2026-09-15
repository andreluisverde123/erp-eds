/**
 * Carga das bases oficiais gratuitas (SINAPI e SICRO, 27 UFs) pela linha de
 * comando. É o caminho da carga inicial; depois o job semanal mantém.
 *
 * Uso (dentro de apps/api):
 *   npm run bases:carregar:local
 *   npm run bases:carregar:staging -- --meses 12
 *
 * Opções:
 *   --meses N          competências para trás (padrão 12)
 *   --fontes A,B       SINAPI, SICRO (padrão as duas)
 *   --ufs SP,RJ        padrão as 27
 *   --empresa <slug>   empresa registrada como importadora (padrão a mais antiga)
 *   --sem-limpeza      não remove as bases automáticas fora da janela
 *
 * Pode ser interrompido e rodado de novo: continua de onde parou.
 */
import { AuditLoggerService } from '../../../common/services/audit-logger.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReferenceDatasetsService } from '../reference-datasets.service';
import { OfficialSource, ReferenceBasesLoaderService } from './reference-bases-loader.service';

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function lista(nome: string): string[] | undefined {
  return argumento(nome)
    ?.split(',')
    .map((valor) => valor.trim().toUpperCase())
    .filter(Boolean);
}

async function main() {
  const meses = Number(argumento('meses') ?? 12);
  if (!Number.isInteger(meses) || meses < 1 || meses > 36) throw new Error('--meses precisa ser um inteiro entre 1 e 36.');
  const fontes = lista('fontes');
  if (fontes?.some((fonte) => fonte !== 'SINAPI' && fonte !== 'SICRO')) throw new Error('--fontes aceita SINAPI e SICRO.');

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    let companyId: string | undefined;
    const slug = argumento('empresa');
    if (slug) {
      const empresa = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
      if (!empresa) throw new Error(`Empresa "${slug}" não encontrada.`);
      companyId = empresa.id;
    }

    const loader = new ReferenceBasesLoaderService(
      prisma,
      new ReferenceDatasetsService(prisma, new AuditLoggerService(prisma)),
    );
    const inicio = Date.now();
    const relatorio = await loader.load({
      months: meses,
      sources: fontes as OfficialSource[] | undefined,
      ufs: lista('ufs'),
      companyId,
      purge: !process.argv.includes('--sem-limpeza'),
    });

    console.log(`\nJanela: ${relatorio.window.from} a ${relatorio.window.to} (${Math.round((Date.now() - inicio) / 1000)} s)`);
    console.log(`Importadas: ${relatorio.imported.length}`);
    console.log(`Já existiam: ${relatorio.alreadyLoaded}`);
    console.log(`Não publicadas pela fonte: ${relatorio.unavailable.length ? relatorio.unavailable.join('; ') : 'nenhuma'}`);
    console.log(`Removidas (fora da janela): ${relatorio.purgedDatasets} base(s), ${relatorio.purgedEditions} edição(ões)`);
    if (relatorio.failed.length > 0) {
      console.log(`\nFALHAS (${relatorio.failed.length}) — rode de novo para tentar só estas:`);
      for (const falha of relatorio.failed) console.log(`  ${falha.base}: ${falha.message}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
