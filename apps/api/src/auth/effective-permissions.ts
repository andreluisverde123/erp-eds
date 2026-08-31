/// Prefixo das permissões que o interruptor por usuário governa.
const PREFIXO_DIARIO = 'diario.';

/// Conjunto EFETIVO de permissões de uma pessoa.
///
/// As permissões nascem do papel (`RolePermission`), que é coletivo. O
/// interruptor `diarioEnabled` existe porque "Engenharia" é um papel de time:
/// todo mundo precisa das permissões do ERP, mas nem todo engenheiro vai a
/// campo preencher RDO. Sem ele, liberar o Diário para uma pessoa significa
/// liberar para todas, e o único ajuste seria tirar a permissão do papel —
/// derrubando quem depende dela.
///
/// **Só retira, nunca concede.** Interruptor ligado não dá `diario.access` a
/// quem o papel não deu; ele apenas deixa de tirar. A direção única é o que
/// mantém o papel como fonte da verdade e impede que este campo vire uma
/// segunda tabela de permissões, invisível na tela de perfis.
///
/// Aplicado num ponto só — `AuthService.toPublicUser` —, que é onde o conjunto
/// vira token E objeto da interface. Por isso o `PermissionsGuard` e o
/// frontend não sabem que este campo existe: para eles a permissão
/// simplesmente não está lá.
export function effectivePermissions(
  doPapel: Iterable<string>,
  usuario: { diarioEnabled: boolean },
): string[] {
  const codigos = Array.from(new Set(doPapel));

  if (usuario.diarioEnabled) return codigos;

  return codigos.filter((codigo) => !codigo.startsWith(PREFIXO_DIARIO));
}
