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
