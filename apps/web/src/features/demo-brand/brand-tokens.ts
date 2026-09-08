/// Aritmética de cor da marca de demonstração.
///
/// Módulo puro de propósito: não conhece React, `localStorage` nem o DOM. É a
/// única parte desta pasta que tem regra de verdade — o resto é encanamento.
///
/// O problema que ele resolve: em `globals.css` a cor da marca não está em um
/// token, está em SETE, e dois deles não são a cor em si. `--pending` é um
/// lavado dela para fundo de etiqueta, e os `*-foreground` são o texto que vai
/// POR CIMA dela. Trocar só `--primary` deixa a etiqueta rosa-EDS ao lado do
/// botão da cor nova, e uma marca clara vira texto branco sobre fundo claro.

/// Tom de texto escuro do sistema (`--foreground`). Repetido aqui como valor
/// literal porque este módulo calcula contraste e precisa do número, não da
/// variável CSS.
const TEXTO_ESCURO = '#212121';
const BRANCO = '#ffffff';

/// Contraste mínimo da WCAG para texto normal. Vale para
/// `--pending-foreground`, que é texto pequeno sobre o lavado.
const CONTRASTE_MINIMO = 4.5;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/// Aceita o que uma pessoa digita numa demonstração: com ou sem `#`, três ou
/// seis dígitos, maiúsculo ou minúsculo, com espaço sobrando. Devolve sempre
/// `#rrggbb` minúsculo, ou `null` se não der para entender — quem chama decide
/// o que fazer, e ninguém aplica cor inválida por engano.
export function normalizarHex(entrada: string): string | null {
  const limpo = entrada.trim().replace(/^#/, '').toLowerCase();

  if (/^[0-9a-f]{3}$/.test(limpo)) {
    // #abc é o mesmo que #aabbcc.
    return `#${limpo[0]}${limpo[0]}${limpo[1]}${limpo[1]}${limpo[2]}${limpo[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(limpo)) return `#${limpo}`;

  return null;
}

function paraRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function paraHex({ r, g, b }: Rgb): string {
  const dois = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${dois(r)}${dois(g)}${dois(b)}`;
}

/// Luminância relativa da WCAG. Não é o brilho ingênuo `(r+g+b)/3`: o verde
/// pesa quase três vezes mais que o vermelho e dez vezes mais que o azul, que é
/// por que amarelo puro precisa de texto preto e azul puro de texto branco,
/// mesmo os dois sendo "cores fortes".
export function luminancia(hex: string): number {
  const { r, g, b } = paraRgb(hex);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/// Razão de contraste entre duas cores, de 1 (idênticas) a 21 (preto e branco).
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/// Texto que fica legível EM CIMA da cor dada. Escolhe entre os dois tons que o
/// sistema já usa, pelo contraste real de cada um — e não por um limiar de
/// brilho, que erra justamente nas cores saturadas que marcas costumam ter.
export function textoSobre(fundo: string): string {
  return contraste(fundo, BRANCO) >= contraste(fundo, TEXTO_ESCURO) ? BRANCO : TEXTO_ESCURO;
}

/// Interpola duas cores em sRGB. `proporcao` é o quanto de `outra` entra: 0
/// devolve `cor`, 1 devolve `outra`.
export function misturar(cor: string, outra: string, proporcao: number): string {
  const a = paraRgb(cor);
  const b = paraRgb(outra);
  const p = Math.min(1, Math.max(0, proporcao));
  return paraHex({
    r: a.r + (b.r - a.r) * p,
    g: a.g + (b.g - a.g) * p,
    b: a.b + (b.b - a.b) * p,
  });
}

/// Escurece a cor até ela ser legível sobre `fundo`.
///
/// Existe por causa de marcas claras — amarelo, laranja, verde-limão. A cor
/// exata do cliente continua no botão, onde ela é o FUNDO e o texto se adapta;
/// aqui ela seria o texto de uma etiqueta sobre um lavado quase branco, e a
/// cor exata simplesmente não se lê. Entre exibir a marca fielmente e exibir a
/// informação, a informação ganha — é uma demonstração do sistema, e uma
/// etiqueta ilegível é o que o cliente vai comentar.
export function escurecerAteLer(cor: string, fundo: string, alvo = CONTRASTE_MINIMO): string {
  let atual = cor;
  // Passos de 6% em direção ao preto. Vinte passos chegam a 71% de preto, o
  // suficiente para qualquer matiz atingir 4.5:1 sobre um fundo claro.
  for (let i = 0; i < 20 && contraste(atual, fundo) < alvo; i += 1) {
    atual = misturar(atual, '#000000', 0.06);
  }
  return atual;
}

/// Os tokens de `:root` que carregam a cor da marca, e só eles.
///
/// `--destructive` fica de fora deliberadamente: é o vermelho de excluir, e a
/// única razão de ele ser distinguível é não seguir a marca. (Na EDS os dois
/// já quase colidem, porque a marca é vermelha — herdar isso para toda marca
/// de demonstração seria multiplicar o defeito.)
export function tokensDaMarca(primary: string): Record<string, string> {
  const lavado = misturar(primary, BRANCO, 0.92);

  return {
    '--primary': primary,
    '--primary-foreground': textoSobre(primary),
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': textoSobre(primary),
    '--sidebar-ring': primary,
    '--pending': lavado,
    '--pending-foreground': escurecerAteLer(primary, lavado),
  };
}

/// Nomes dos tokens que esta camada mexe. Serve para desfazer: remover a
/// propriedade inline devolve o controle ao valor da folha de estilo, sem
/// precisar guardar em lugar nenhum qual era a cor da EDS.
///
/// Derivada, e não digitada à mão, para não poder ficar defasada de
/// `tokensDaMarca` — um token que fosse acrescentado lá e esquecido aqui
/// continuaria pintado depois de "Voltar para EDS".
///
/// A anotação `@__PURE__` é o que permite ao empacotador apagar esta linha
/// quando ninguém a usa. Sem ela, `Object.keys` de uma chamada é tratado como
/// possível efeito colateral, o módulo inteiro fica vivo por causa dela, e a
/// aritmética de cor da demonstração acaba viajando no bundle publicado.
export const TOKENS_DA_MARCA = /* @__PURE__ */ Object.keys(
  /* @__PURE__ */ tokensDaMarca('#000000'),
);
