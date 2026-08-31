import { Prisma } from '../../../generated/prisma/client';

/// Código de violação de unique constraint (ex.: código de obra duplicado).
export function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/// Código de "registro não encontrado" que o Prisma lança em update/delete
/// quando o `where` não casa com nenhuma linha (ex.: já foi soft-deletado).
export function isRecordNotFoundError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/// Colunas/constraint citadas por uma violação de unicidade, como texto único.
///
/// Existe porque o Prisma 7 entrega essa informação em lugares DIFERENTES
/// conforme quem executou a query, e apostar num só falha exatamente onde dói:
/// em produção, não no teste.
///
///   engine binário      `meta.target` — array de colunas, ou string
///   `@prisma/adapter-pg`  `meta.target` NÃO EXISTE; o que chega é
///                       `meta.driverAdapterError.cause.constraint.fields`
///                       (colunas entre aspas) e `originalMessage`, que traz o
///                       nome da constraint por extenso
///
/// Esta API roda com o adapter `pg` (`PrismaService`), então a segunda forma é
/// a real; a primeira fica coberta para o dia em que o adapter mudar. Quem
/// chama procura um nome de coluna no texto devolvido — daí ele juntar tudo em
/// vez de tentar normalizar formatos que não têm um formato comum.
export function uniqueConstraintText(error: unknown): string {
  if (!isUniqueConstraintError(error)) return '';

  const meta = error.meta as
    | {
        target?: string | string[];
        driverAdapterError?: {
          cause?: {
            originalMessage?: string;
            constraint?: { fields?: string[]; index?: string };
          };
        };
      }
    | undefined;

  const causa = meta?.driverAdapterError?.cause;

  return [
    Array.isArray(meta?.target) ? meta.target.join(',') : (meta?.target ?? ''),
    causa?.constraint?.fields?.join(',') ?? '',
    causa?.constraint?.index ?? '',
    causa?.originalMessage ?? '',
  ].join(' ');
}
