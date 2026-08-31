import { FOTOS_POR_PAGINA, paginarFotos, posicaoNaGrade } from './rdo-pdf-gallery';

const fotos = (n: number) => Array.from({ length: n }, (_, i) => `f${i + 1}`);

describe('paginarFotos', () => {
  it('sem fotos, não cria página de galeria', () => {
    // Página de galeria vazia é seção órfã: um título "Fotos (0)" sozinho.
    expect(paginarFotos([])).toEqual([]);
  });

  it.each([
    [1, [['f1']]],
    [2, [['f1', 'f2']]],
    [3, [['f1', 'f2', 'f3']]],
    [4, [['f1', 'f2', 'f3', 'f4']]],
  ])('%i foto(s) cabem numa página só', (quantidade, esperado) => {
    expect(paginarFotos(fotos(quantidade))).toEqual(esperado);
  });

  it('a quinta foto vai para a página seguinte, sozinha', () => {
    // A regra que o prompt do template pede explicitamente: NÃO espremer cinco
    // numa página redimensionando a grade.
    expect(paginarFotos(fotos(5))).toEqual([['f1', 'f2', 'f3', 'f4'], ['f5']]);
  });

  it('preserva a ordem em muitas páginas', () => {
    const paginas = paginarFotos(fotos(50));

    expect(paginas).toHaveLength(13);
    expect(paginas.at(-1)).toEqual(['f49', 'f50']);
    expect(paginas.flat()).toEqual(fotos(50));
  });

  it('nenhuma página passa de quatro', () => {
    for (const total of [1, 4, 5, 7, 20, 50]) {
      for (const pagina of paginarFotos(fotos(total))) {
        expect(pagina.length).toBeLessThanOrEqual(FOTOS_POR_PAGINA);
        expect(pagina.length).toBeGreaterThan(0);
      }
    }
  });

  it('percorre a grade da esquerda para a direita, de cima para baixo', () => {
    expect([0, 1, 2, 3].map(posicaoNaGrade)).toEqual([
      { coluna: 0, linha: 0 },
      { coluna: 1, linha: 0 },
      { coluna: 0, linha: 1 },
      { coluna: 1, linha: 1 },
    ]);
  });
});
