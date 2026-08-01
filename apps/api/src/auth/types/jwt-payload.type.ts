/// Claims do access token. Papéis e permissões são um snapshot tirado no
/// momento do login/refresh — não são recarregados do banco a cada request
/// (mantém os guards O(1) e sem round-trip). Uma mudança de papel só reflete
/// no próximo refresh, o que é aceitável dado o TTL curto do access token.
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  companyId: string;
  roles: string[];
  permissions: string[];
  /// Enquanto `true`, o `PasswordChangeGuard` deixa passar só as rotas de
  /// trocar a própria senha, ver o perfil e sair. Vive no token (e não numa
  /// consulta por request) pelo mesmo motivo dos papéis: manter o guard O(1).
  mustChangePassword: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}
