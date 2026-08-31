import { parseRange } from './byte-range';

const TAMANHO = 1000;

describe('parseRange — as formas que um player usa de verdade', () => {
  it('sem header, serve o arquivo inteiro', () => {
    expect(parseRange(undefined, TAMANHO)).toEqual({ kind: 'none' });
  });

  it('`bytes=0-` — o primeiro pedido do <video>', () => {
    expect(parseRange('bytes=0-', TAMANHO)).toEqual({
      kind: 'range',
      range: { start: 0, end: 999 },
    });
  });

  it('`bytes=500-999` — busca no meio do vídeo', () => {
    expect(parseRange('bytes=500-999', TAMANHO)).toEqual({
      kind: 'range',
      range: { start: 500, end: 999 },
    });
  });

  it('`bytes=-500` — os últimos bytes, onde o MP4 costuma guardar o índice', () => {
    expect(parseRange('bytes=-500', TAMANHO)).toEqual({
      kind: 'range',
      range: { start: 500, end: 999 },
    });
  });

  it('recorta o fim no último byte quando o pedido passa do arquivo', () => {
    // O HTTP manda recortar, não recusar: é o caso do player que pede um bloco
    // fixo e chega no fim do arquivo.
    expect(parseRange('bytes=900-99999', TAMANHO)).toEqual({
      kind: 'range',
      range: { start: 900, end: 999 },
    });
  });

  it('sufixo maior que o arquivo devolve o arquivo inteiro', () => {
    expect(parseRange('bytes=-99999', TAMANHO)).toEqual({
      kind: 'range',
      range: { start: 0, end: 999 },
    });
  });

  it('tolera espaço em volta do header', () => {
    expect(parseRange('  bytes=0-99  ', TAMANHO)).toMatchObject({ kind: 'range' });
  });
});

describe('parseRange — o que não é satisfazível', () => {
  it('início além do fim do arquivo', () => {
    expect(parseRange('bytes=2000-3000', TAMANHO)).toEqual({ kind: 'unsatisfiable' });
  });

  it('início exatamente no tamanho (o arquivo termina no byte anterior)', () => {
    expect(parseRange(`bytes=${TAMANHO}-`, TAMANHO)).toEqual({ kind: 'unsatisfiable' });
  });

  it('início depois do fim', () => {
    expect(parseRange('bytes=500-100', TAMANHO)).toEqual({ kind: 'unsatisfiable' });
  });

  it('sufixo de zero bytes', () => {
    expect(parseRange('bytes=-0', TAMANHO)).toEqual({ kind: 'unsatisfiable' });
  });

  it('arquivo vazio não satisfaz faixa nenhuma', () => {
    expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});

describe('parseRange — sintaxe que o servidor não compreende', () => {
  it.each([
    'bytes=abc-def',
    'items=0-99',
    'bytes=',
    'bytes=-',
    // Faixas múltiplas exigiriam `multipart/byteranges`; nenhum navegador as
    // pede para vídeo, e aceitá-las pela metade seria pior que ignorá-las.
    'bytes=0-99,200-299',
  ])('%p cai em "sem faixa" — o HTTP manda servir o arquivo inteiro', (header) => {
    expect(parseRange(header, TAMANHO)).toEqual({ kind: 'none' });
  });
});
