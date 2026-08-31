import { Prisma } from '../../../generated/prisma/client';
import { isUniqueConstraintError, uniqueConstraintText } from './prisma-error.util';

/// Erro capturado de um Postgres de verdade (`@prisma/adapter-pg` 7.9), não
/// montado à mão. É a forma que a API realmente recebe em produção — e é
/// justamente por ela divergir do que se supunha que criar um RDO em data
/// repetida respondia 500 em vez de 409.
function erroRealDoAdapterPg(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.0',
    meta: {
      modelName: 'DailyReport',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          kind: 'UniqueConstraintViolation',
          originalCode: '23505',
          originalMessage:
            'duplicate key value violates unique constraint "DailyReport_constructionSiteId_reportDate_key"',
          constraint: { fields: ['"constructionSiteId"', '"reportDate"'] },
        },
      },
    },
  });
}

describe('uniqueConstraintText', () => {
  it('acha a coluna no erro do adapter pg, que NÃO preenche meta.target', () => {
    const erro = erroRealDoAdapterPg();

    // A garantia que faltava: sem ela, o código antigo lia `target` (undefined)
    // e concluía que a violação era de outra coisa.
    expect((erro.meta as { target?: unknown }).target).toBeUndefined();
    expect(uniqueConstraintText(erro)).toContain('reportDate');
  });

  it('distingue a violação de data da de número na MESMA tabela', () => {
    const porNumero = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.9.0',
      meta: {
        modelName: 'DailyReport',
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            kind: 'UniqueConstraintViolation',
            originalCode: '23505',
            originalMessage:
              'duplicate key value violates unique constraint "DailyReport_constructionSiteId_number_key"',
            constraint: { fields: ['"constructionSiteId"', '"number"'] },
          },
        },
      },
    });

    expect(uniqueConstraintText(porNumero)).not.toContain('reportDate');
  });

  it('continua lendo meta.target, para o dia em que o adapter mudar', () => {
    const engineBinario = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.9.0',
      meta: { target: ['constructionSiteId', 'reportDate'] },
    });

    expect(uniqueConstraintText(engineBinario)).toContain('reportDate');
  });

  it('devolve vazio para o que não é violação de unicidade', () => {
    const naoEncontrado = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '7.9.0',
    });

    expect(isUniqueConstraintError(naoEncontrado)).toBe(false);
    expect(uniqueConstraintText(naoEncontrado)).toBe('');
    expect(uniqueConstraintText(new Error('qualquer outra coisa'))).toBe('');
  });
});
