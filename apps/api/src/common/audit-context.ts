import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditContextStore {
  userId: string;
  companyId: string;
}

/// Carrega quem está fazendo a requisição atual até dentro da extensão do
/// Prisma (`common/prisma/audit-extension.ts`), que não tem acesso à request
/// HTTP. Populado por `AuditContextInterceptor` a cada requisição.
export const auditContextStorage = new AsyncLocalStorage<AuditContextStore>();
