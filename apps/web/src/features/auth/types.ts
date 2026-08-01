/// Identidade do inquilino logado. A interface exibe a marca DELE — nenhum
/// nome de cliente existe no código do produto.
export interface AuthTenant {
  id: string;
  name: string;
  /// Caminho do logo no storage, ou `null` para cair no logo do produto.
  logoUrl: string | null;
  /// Como o cliente chama o sistema. `null` mantém o nome do produto.
  erpName: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenant: AuthTenant;
  /// Senha definida por um admin (criação de usuário ou reset). Enquanto for
  /// `true` a API bloqueia todo o resto — o app precisa levar o usuário para
  /// a tela de troca antes de qualquer coisa.
  mustChangePassword: boolean;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}
