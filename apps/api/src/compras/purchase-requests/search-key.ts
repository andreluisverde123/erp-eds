/// A NORMALIZAÇÃO usada pela busca de insumos — e o único lugar em que ela
/// existe.
///
/// Duas pontas dependem de produzirem o MESMO texto:
///
///   - a gravação, que preenche `PurchaseRequestItem.searchKey` a cada item
///     de solicitação criado;
///   - a consulta, que normaliza o termo digitado antes de comparar.
///
/// E uma terceira, fora do TypeScript: o `UPDATE` de backfill da migration
/// `20260903120000`, escrito com `translate(lower(...))`. As três precisam
/// concordar, senão as linhas gravadas por uma ficam inalcançáveis pela outra
/// — um teste trava justamente isso.
///
/// **NFD + remoção de diacríticos** em vez de uma tabela de-para: cobre todo o
/// português (e o resto do latim) sem enumerar caractere por caractere, e é a
/// mesma técnica que a conciliação de notas já usa em
/// `normalizeDescription`.
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/// Escapa o que o `LIKE` do Postgres trataria como curinga.
///
/// Sem isto, digitar `%` sugeriria a base inteira e `_` casaria qualquer
/// caractere — não é injeção (o termo vai parametrizado), mas é resultado
/// errado, e do tipo que ninguém relaciona com o que digitou.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}
