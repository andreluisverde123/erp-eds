/// Ao soft-deletar um registro com código único (obra, centro de custo...),
/// o `deletedAt` sozinho não libera o código pra reuso — a unique constraint
/// em (companyId, code) não sabe distinguir "deletado" de "ativo". Mangling
/// o código no delete resolve isso sem precisar de índice parcial no banco.
/// Usa o próprio id (já único) como sufixo, então nunca colide mesmo em
/// deleções em lote na mesma transação.
export function mangleDeletedCode(code: string, id: string): string {
  return `${code}__deleted__${id}`;
}

const DELETED_SUFFIX = '__deleted__';

/// Inverso de `mangleDeletedCode`, usado ao restaurar da lixeira: sem isto o
/// registro voltaria com o código sujo ("OBRA-1__deleted__<uuid>") e o
/// usuário teria que editar na mão o que nunca deveria ter mudado.
export function unmangleDeletedCode(code: string): string {
  const index = code.indexOf(DELETED_SUFFIX);
  return index === -1 ? code : code.slice(0, index);
}
