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
  /// Interruptor do Diário de Obras para esta pessoa. Sobrepõe o perfil apenas
  /// para menos: desligado, as permissões `diario.*` do papel não chegam nem
  /// ao token nem a esta interface.
  diarioEnabled: boolean;
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

// ---------------------------------------------------------------------------
// Dados bancários
// ---------------------------------------------------------------------------

/// A quem a conta pertence. Só `USER` tem tela hoje — os outros dois existem
/// no contrato da API porque o modelo já os sustenta (ver o schema).
export type BankAccountOwnerType = 'USER' | 'EMPLOYEE' | 'CONTRACTOR';

export type BankAccountType = 'CHECKING' | 'SAVINGS' | 'PAYMENT';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';

/// Titular da conta. `isOwner` distingue a conta do próprio (nome vem do
/// cadastro) da conta de terceiro (nome e documento foram digitados).
export interface BankAccountHolder {
  name: string | null;
  document: string | null;
  isOwner: boolean;
}

/// Conta bancária como a API devolve por padrão: MASCARADA.
///
/// Note que `accountNumber` e `pixKey` não existem neste tipo. Os valores
/// completos só chegam por `revealBankAccount`, que é outro endpoint, outra
/// permissão e vira linha de auditoria.
export interface BankAccount {
  id: string;
  ownerType: BankAccountOwnerType;
  ownerId: string;
  bankCode: string;
  bankName: string;
  branch: string;
  branchDigit: string | null;
  accountType: BankAccountType;
  accountNumberMasked: string;
  accountDigit: string | null;
  pixKeyType: PixKeyType | null;
  pixKeyMasked: string | null;
  holder: BankAccountHolder;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountListResult {
  data: BankAccount[];
  /// `false` quando falta `BANK_DATA_ENCRYPTION_KEY` no servidor. A tela avisa
  /// em vez de deixar o usuário descobrir com um erro ao salvar.
  encryptionConfigured: boolean;
}

export interface BankAccountInput {
  ownerType: BankAccountOwnerType;
  ownerId: string;
  bankCode: string;
  bankName: string;
  branch: string;
  branchDigit?: string;
  accountType: BankAccountType;
  accountNumber: string;
  accountDigit?: string;
  pixKeyType?: PixKeyType;
  pixKey?: string;
  holderName?: string;
  holderDocument?: string;
}

/// Os valores completos, devolvidos uma vez por chamada explícita. Vivem só no
/// estado da tela que pediu — nunca no cache do React Query.
export interface RevealedBankAccount {
  id: string;
  accountNumber: string;
  accountDigit: string | null;
  pixKey: string | null;
}

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  PAYMENT: 'Conta de pagamento',
};

export const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  RANDOM: 'Chave aleatória',
};
