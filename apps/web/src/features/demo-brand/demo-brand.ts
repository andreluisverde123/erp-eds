import { TOKENS_DA_MARCA, normalizarHex, tokensDaMarca } from './brand-tokens';

/// Marca de demonstração: trocar logo, cor e nomes do sistema em tempo de
/// execução, para mostrar o ERP rodando com a identidade de quem está do outro
/// lado da mesa.
///
/// **Só existe em desenvolvimento.** Todo caminho daqui passa por
/// `import.meta.env.DEV`, que o Vite substitui por `false` ao compilar — o que
/// transforma cada leitura abaixo em código morto e faz o empacotador removê-lo
/// do bundle publicado. Não é uma trava que alguém possa contornar por engano
/// numa variável de ambiente: em staging e produção o código não está lá.
///
/// Nada disto encosta no banco. É uma camada de tinta sobre a sessão local: os
/// dados continuam sendo os do seed de demonstração (`SEED_DEMO=true`), e os
/// documentos em PDF continuam saindo com o que estiver gravado em
/// Configurações → Empresa, que é outra história e é persistida de verdade.

export interface MarcaDemo {
  /// Identidade interna, estável entre recarregamentos. Só a biblioteca usa.
  id: string;
  /// Como a marca aparece no seletor do painel.
  rotulo: string;
  /// Nome do sistema: topo da barra lateral, login, aba do navegador.
  erpName: string;
  /// Nome da construtora: rodapé da barra lateral.
  companyName: string;
  /// Cor da marca, sempre `#rrggbb`.
  primary: string;
  /// Logo como data URL. `null` mantém a assinatura da EDS.
  ///
  /// Data URL e não caminho de arquivo porque o logo do cliente NÃO entra no
  /// repositório: ele é escolhido do disco na hora, vive no `localStorage`
  /// desta máquina e vai embora com ele. Versionar arte de prospecto é dívida
  /// que já existe neste projeto; esta pasta não aumenta a conta.
  logo: string | null;
}

const CHAVE_ATIVA = 'eds.demo-brand.ativa';
const CHAVE_BIBLIOTECA = 'eds.demo-brand.biblioteca';

/// Teto do logo guardado, já em base64. O `localStorage` costuma parar em torno
/// de 5 MB por origem, e estourar esse limite lança no meio de um `setItem` —
/// durante uma demonstração, na frente do cliente. Recusar cedo, com aviso, é
/// melhor que descobrir tarde.
export const LIMITE_LOGO_BYTES = 1_500_000;

const ligado = (): boolean => import.meta.env.DEV;

/// `localStorage` lança em aba anônima de alguns navegadores e quando o site
/// está com armazenamento bloqueado. Nada aqui vale uma tela branca.
function comArmazenamento<T>(acao: () => T, padrao: T): T {
  try {
    return acao();
  } catch {
    return padrao;
  }
}

function ehMarca(valor: unknown): valor is MarcaDemo {
  if (typeof valor !== 'object' || valor === null) return false;
  const m = valor as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.rotulo === 'string' &&
    typeof m.erpName === 'string' &&
    typeof m.companyName === 'string' &&
    typeof m.primary === 'string' &&
    normalizarHex(m.primary) !== null &&
    (m.logo === null || typeof m.logo === 'string')
  );
}

export function lerMarcaAtiva(): MarcaDemo | null {
  if (!ligado()) return null;
  return comArmazenamento(() => {
    const cru = window.localStorage.getItem(CHAVE_ATIVA);
    if (!cru) return null;
    const valor: unknown = JSON.parse(cru);
    // Formato antigo ou lixo digitado à mão no console: ignora em silêncio e
    // volta para a EDS, em vez de aplicar meia marca.
    return ehMarca(valor) ? valor : null;
  }, null);
}

export function lerBiblioteca(): MarcaDemo[] {
  if (!ligado()) return [];
  return comArmazenamento(() => {
    const cru = window.localStorage.getItem(CHAVE_BIBLIOTECA);
    if (!cru) return [];
    const valor: unknown = JSON.parse(cru);
    return Array.isArray(valor) ? valor.filter(ehMarca) : [];
  }, []);
}

function gravarBiblioteca(marcas: MarcaDemo[]): void {
  comArmazenamento(() => window.localStorage.setItem(CHAVE_BIBLIOTECA, JSON.stringify(marcas)), undefined);
}

/// Guarda a marca na biblioteca desta máquina, substituindo a de mesmo `id`.
export function guardarNaBiblioteca(marca: MarcaDemo): MarcaDemo[] {
  const restantes = lerBiblioteca().filter((m) => m.id !== marca.id);
  const atualizada = [...restantes, marca].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  gravarBiblioteca(atualizada);
  return atualizada;
}

export function esquecerDaBiblioteca(id: string): MarcaDemo[] {
  const atualizada = lerBiblioteca().filter((m) => m.id !== id);
  gravarBiblioteca(atualizada);
  return atualizada;
}

/// Pinta o documento. Separada de `aplicarMarca` porque roda também antes do
/// React montar, direto do `main.tsx`: sem isso a página abre vermelho-EDS e
/// vira a cor do cliente no primeiro render — uma piscada que, numa
/// demonstração, é exatamente a coisa que a plateia repara.
export function aplicarNoDocumento(marca: MarcaDemo | null): void {
  if (!ligado()) return;

  const raiz = document.documentElement;

  if (!marca) {
    // Remover a propriedade inline devolve o token ao valor da folha de estilo.
    // É por isso que a cor da EDS não precisa ser guardada em lugar nenhum
    // para poder voltar: ela nunca saiu de `globals.css`.
    for (const token of TOKENS_DA_MARCA) raiz.style.removeProperty(token);
  } else {
    for (const [token, valor] of Object.entries(tokensDaMarca(marca.primary))) {
      raiz.style.setProperty(token, valor);
    }
  }

  // O splash do `index.html` já está pintado na tela quando isto roda, com a
  // assinatura da EDS embutida no HTML. Trocar aqui alcança o instante entre
  // abrir a aba e o React montar.
  const splash = document.querySelector<HTMLImageElement>('#app-splash img');
  if (splash) splash.src = marca?.logo ?? '/logo-eds.svg';

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (favicon) favicon.href = marca?.logo ?? '/favicon.svg';
}

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
let ativa: MarcaDemo | null = null;
let carregada = false;

/// Estado corrente. Lê do armazenamento na primeira chamada e depois vive em
/// memória — `useSyncExternalStore` chama isto a cada render e exige que a
/// resposta seja a MESMA referência enquanto nada mudou, senão o React entra
/// em laço de re-render.
export function marcaAtiva(): MarcaDemo | null {
  if (!carregada) {
    ativa = lerMarcaAtiva();
    carregada = true;
  }
  return ativa;
}

/// Aplica, persiste e avisa quem estiver ouvindo. `null` volta para a EDS.
export function aplicarMarca(marca: MarcaDemo | null): void {
  if (!ligado()) return;

  ativa = marca;
  carregada = true;

  comArmazenamento(() => {
    if (marca) window.localStorage.setItem(CHAVE_ATIVA, JSON.stringify(marca));
    else window.localStorage.removeItem(CHAVE_ATIVA);
  }, undefined);

  aplicarNoDocumento(marca);
  for (const ouvinte of ouvintes) ouvinte();
}

export function inscrever(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/// Só para teste: devolve o módulo ao estado de partida.
export function reiniciarParaTeste(): void {
  ativa = null;
  carregada = false;
  ouvintes.clear();
}
