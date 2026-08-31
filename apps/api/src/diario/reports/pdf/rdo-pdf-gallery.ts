/// Fotos por página da galeria: 2 colunas × 2 linhas.
///
/// Fixo de propósito. A tentação é "aproveitar o espaço" espremendo uma quinta
/// foto quando sobra margem, e o resultado é uma grade que muda de tamanho
/// entre páginas — o leitor percebe como descuido antes de perceber como
/// economia. O template de referência mantém 2×2 do começo ao fim, inclusive
/// na página final com uma foto só.
export const COLUNAS = 2;
export const LINHAS = 2;
export const FOTOS_POR_PAGINA = COLUNAS * LINHAS;

/// Divide as fotos em páginas de no máximo quatro, preservando a ordem.
///
/// A última página fica incompleta e é assim mesmo: cinco fotos são quatro numa
/// página e UMA na seguinte, ocupando uma célula do mesmo tamanho das outras.
/// Redimensionar a grade para "encaixar" as cinco quebraria a regra acima.
export function paginarFotos<T>(fotos: readonly T[]): T[][] {
  const paginas: T[][] = [];

  for (let i = 0; i < fotos.length; i += FOTOS_POR_PAGINA) {
    paginas.push(fotos.slice(i, i + FOTOS_POR_PAGINA));
  }

  return paginas;
}

/// Posição de uma célula dentro da grade da página.
export function posicaoNaGrade(indice: number): { coluna: number; linha: number } {
  return { coluna: indice % COLUNAS, linha: Math.floor(indice / COLUNAS) };
}
