/// Situação do usuário, derivada pela API a partir de `isActive` +
/// `mustChangePassword` — não é um campo editável.
///  - `ACTIVE`: entrou e já definiu a própria senha.
///  - `PENDING_FIRST_ACCESS`: ainda está com a senha temporária que um admin
///    gerou; a API bloqueia tudo até ele trocá-la.
///  - `INACTIVE`: acesso desligado, tem precedência sobre os outros dois.
export type UserStatus = 'ACTIVE' | 'PENDING_FIRST_ACCESS' | 'INACTIVE';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface UserRef {
  id: string;
  name: string;
}

/// Usuário com acesso ao sistema. `lastAccessAt` e `createdBy` são derivados
/// pela API (sessões e auditoria) — não existem como campo editável.
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  /// Senha ainda é a temporária gerada por um admin.
  mustChangePassword: boolean;
  status: UserStatus;
  roles: UserRef[];
  lastAccessAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UserRef | null;
}

/// Resposta do cadastro e do reset administrativo: a senha é gerada pela API e
/// exibida uma única vez para o administrador repassar ao usuário. Não é
/// guardada em cache nem em estado persistente do app.
export interface SystemUserWithTemporaryPassword extends SystemUser {
  temporaryPassword: string;
}

export interface SystemUserInput {
  name: string;
  email: string;
  /// Sempre o ID do perfil — o nome nunca é enviado.
  roleId: string;
  isActive: boolean;
}

export interface SystemUserQuery {
  page?: number;
  limit?: number;
  name?: string;
  roleId?: string;
  status?: UserStatus;
}

/// Perfis existentes no sistema, administrados em Configurações > Perfis e
/// aqui apenas consumidos.
export interface RoleOption {
  id: string;
  name: string;
}
