import { describe, expect, it } from 'vitest';

import {
  contraste,
  escurecerAteLer,
  misturar,
  normalizarHex,
  textoSobre,
  TOKENS_DA_MARCA,
  tokensDaMarca,
} from './brand-tokens';

const EDS = '#ed2124';
const LETS = '#545454';
/// Marca clara de verdade. É o caso que quebra o atalho ingênuo de "cor forte,
/// texto branco" — e marcas de construção civil são amarelas com frequência.
const AMARELO = '#ffd400';

describe('Leitura do hex digitado', () => {
  it('aceita as formas que uma pessoa realmente digita', () => {
    expect(normalizarHex('#545454')).toBe('#545454');
    expect(normalizarHex('545454')).toBe('#545454');
    expect(normalizarHex('  #545454  ')).toBe('#545454');
    expect(normalizarHex('#ED2124')).toBe('#ed2124');
  });

  it('expande a forma de três dígitos', () => {
    expect(normalizarHex('#abc')).toBe('#aabbcc');
  });

  it('recusa o que não é cor, em vez de chutar', () => {
    // Um valor pela metade não pode virar cor: o painel aplica a cada tecla, e
    // "#5" precisa ser um passo silencioso no caminho até "#545454".
    expect(normalizarHex('#5')).toBeNull();
    expect(normalizarHex('#54545')).toBeNull();
    expect(normalizarHex('vermelho')).toBeNull();
    expect(normalizarHex('')).toBeNull();
  });
});

describe('Texto legível sobre a cor da marca', () => {
  it('marca escura pede texto branco', () => {
    expect(textoSobre(EDS)).toBe('#ffffff');
    expect(textoSobre(LETS)).toBe('#ffffff');
  });

  it('marca clara pede texto escuro', () => {
    // Aqui está o motivo de o cálculo ser luminância da WCAG e não média dos
    // canais: amarelo é "cor viva", e média o classificaria junto do vermelho.
    expect(textoSobre(AMARELO)).toBe('#212121');
  });

  it('a escolha é sempre a de maior contraste', () => {
    for (const cor of [EDS, LETS, AMARELO, '#ffffff', '#000000', '#7d7e80']) {
      const escolhido = textoSobre(cor);
      const outro = escolhido === '#ffffff' ? '#212121' : '#ffffff';
      expect(contraste(cor, escolhido)).toBeGreaterThanOrEqual(contraste(cor, outro));
    }
  });
});

describe('Tokens derivados da cor da marca', () => {
  it('a cor do cliente entra EXATA onde ela é o fundo', () => {
    // Fidelidade da marca: o botão principal precisa ser o hex que o cliente
    // mandou, sem correção nenhuma.
    const tokens = tokensDaMarca(LETS);

    expect(tokens['--primary']).toBe(LETS);
    expect(tokens['--ring']).toBe(LETS);
    expect(tokens['--sidebar-primary']).toBe(LETS);
  });

  it('o vermelho de excluir NÃO segue a marca', () => {
    // `--destructive` só é reconhecível porque é independente. Se ele herdasse
    // a marca, "Excluir" ficaria da mesma cor de "Salvar" em qualquer cliente
    // de marca vermelha — e a EDS é exatamente esse caso.
    expect(TOKENS_DA_MARCA).not.toContain('--destructive');
    expect(TOKENS_DA_MARCA).not.toContain('--success');
  });

  it('a etiqueta continua legível mesmo com marca clara', () => {
    // `--pending` é lavado da marca e `--pending-foreground` é o texto por
    // cima. Com marca amarela, usar a cor crua nos dois dá amarelo sobre
    // creme — que é ilegível e é o que a plateia comenta.
    const tokens = tokensDaMarca(AMARELO);

    expect(contraste(tokens['--pending-foreground']!, tokens['--pending']!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('toda marca produz etiqueta e botão legíveis', () => {
    // Os dois pisos são diferentes de propósito, porque os dois papéis são
    // diferentes:
    //
    // - `--primary-foreground` é rótulo de botão sobre a cor CRUA do cliente.
    //   Ela não pode ser mexida sem trair a marca, então o melhor possível é
    //   escolher entre branco e o tom escuro do sistema — e para algumas cores
    //   de meio-tom nenhum dos dois chega a 4.5. O próprio vermelho da EDS é
    //   um deles: branco sobre `#ed2124` dá 4.34 hoje, no produto. Exigir 4.5
    //   aqui seria reprovar a marca da casa. O piso real é 3.0, que é o que a
    //   WCAG pede para texto grande ou em negrito — que é o caso de um botão.
    //
    // - `--pending-foreground` é texto pequeno sobre um lavado que NÓS
    //   geramos. Aí não há marca a trair, e 4.5 é obrigatório.
    for (const cor of [EDS, LETS, AMARELO, '#00b894', '#0a1f44', '#f5f5f5']) {
      const t = tokensDaMarca(cor);
      expect(contraste(t['--primary-foreground']!, t['--primary']!)).toBeGreaterThanOrEqual(3);
      expect(contraste(t['--pending-foreground']!, t['--pending']!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o lavado é quase branco, não a cor cheia', () => {
    // Fundo de etiqueta. Se saísse na cor cheia, a lista de pendências viraria
    // um bloco sólido da cor da marca.
    const tokens = tokensDaMarca(EDS);
    expect(contraste(tokens['--pending']!, '#ffffff')).toBeLessThan(1.2);
  });

  it('a lista de tokens acompanha o que é gerado', () => {
    // `TOKENS_DA_MARCA` é o que o desfazer remove do `style` inline. Se ela
    // ficasse para trás de uma adição, sobraria token pintado depois de
    // "Voltar para EDS".
    expect(new Set(TOKENS_DA_MARCA)).toEqual(new Set(Object.keys(tokensDaMarca(LETS))));
  });
});

describe('Mistura e escurecimento', () => {
  it('as pontas da mistura são as próprias cores', () => {
    expect(misturar(EDS, '#ffffff', 0)).toBe(EDS);
    expect(misturar(EDS, '#ffffff', 1)).toBe('#ffffff');
  });

  it('não escurece o que já está legível', () => {
    // Escurecer sem necessidade seria distorcer a marca de graça.
    expect(escurecerAteLer('#0a1f44', '#ffffff')).toBe('#0a1f44');
  });

  it('escurece até atingir o alvo, e para', () => {
    const resultado = escurecerAteLer(AMARELO, '#ffffff');

    expect(contraste(resultado, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    // Um passo a menos ainda estaria abaixo do alvo: prova de que ele parou no
    // primeiro ponto legível em vez de escurecer até o preto.
    expect(contraste(misturar(resultado, '#ffffff', 0.08), '#ffffff')).toBeLessThan(4.5);
  });
});
