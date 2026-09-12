import { normalizeForSearch } from '../../compras/purchase-requests/search-key';

/// A chave normalizada do insumo: o que a busca consulta e o que define
/// DUPLICIDADE.
///
/// Reaproveita `normalizeForSearch` de Compras — a mesma função que o
/// autocomplete de solicitação usa —, e acrescenta UMA coisa: colapsar espaços
/// internos.
///
/// O acréscimo existe porque aqui a chave tem um segundo papel. Em Compras ela
/// só busca; aqui ela também é a unique `(empresa, searchKey)`. "Cimento  CP
/// II" com dois espaços é o mesmo material que "Cimento CP II", e sem colapsar
/// os dois entrariam como cadastros distintos — que é exatamente o que a
/// constraint existe para impedir.
///
/// **O que NÃO é feito, de propósito:** pontuação não é removida. "Cimento
/// CP-II" e "Cimento CP II" continuam sendo chaves diferentes. Removê-la seria
/// um passo em direção a casamento por similaridade, e quem decide se dois
/// nomes parecidos são o mesmo material é o operador, não uma heurística.
export function normalizeCatalogKey(name: string): string {
  return normalizeForSearch(name).replace(/\s+/g, ' ');
}
