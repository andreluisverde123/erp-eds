/// Recarrega a página quando o pacote da aba ficou velho depois de um deploy.
///
/// **O problema.** Cada tela é um pedaço separado com hash no nome
/// (`solicitacao-detail-page-CDGXc8J3.js`), baixado só quando a pessoa navega
/// até ela. Um deploy substitui a pasta inteira: os arquivos antigos deixam de
/// existir. Uma aba aberta desde antes ficou com o `index.html` velho em
/// memória, que conhece apenas os nomes antigos — o primeiro clique num menu
/// pede um arquivo que responde 404, o React não tem o que renderizar, e a
/// pessoa recebe "Unexpected Application Error" com a tela em branco.
///
/// Não é defeito de tela nenhuma: acontece com a primeira que for aberta
/// depois da publicação. E ninguém adivinha que a saída é ⌘+Shift+R.
///
/// **A correção.** O Vite avisa por `vite:preloadError`. Recarregar busca o
/// `index.html` novo, com os nomes novos, e a navegação segue. A pessoa vê um
/// piscar em vez de um erro.
const CHAVE = 'eds:stale-bundle-reload';

/// Quanto tempo uma tentativa recente impede a próxima.
///
/// A trava é por IDADE, e não por presença da marca. A primeira versão disto
/// limpava a marca ao iniciar o app — e o recarregamento É um início, então a
/// trava se apagava a si mesma e o laço infinito voltava por outro caminho.
///
/// Trinta segundos separam os dois casos com folga: a falha que se repete logo
/// depois do recarregamento é a que ele não resolve (servidor fora, rede
/// caída, arquivo ausente de verdade) e precisa aparecer na tela. Um deploy
/// seguinte, minutos depois, encontra a marca velha e recomeça normalmente.
const JANELA_MS = 30_000;

export function registerStaleBundleReload(): void {
  window.addEventListener('vite:preloadError', (evento) => {
    if (tentouAgoraPouco()) return;
    if (!marcarTentativa()) return;

    // `preventDefault` impede o Vite de relançar o erro — sem ele, a tela de
    // erro pisca antes de a página sair.
    evento.preventDefault();
    window.location.reload();
  });
}

function tentouAgoraPouco(): boolean {
  try {
    const marca = sessionStorage.getItem(CHAVE);
    if (!marca) return false;
    return Date.now() - Number(marca) < JANELA_MS;
  } catch {
    // Sem acesso ao armazenamento não há como saber; tratar como "já tentou" é
    // o lado seguro — melhor mostrar o erro que arriscar o laço.
    return true;
  }
}

/// `sessionStorage` e não `localStorage`: a marca vale para ESTA aba e morre
/// com ela. Em `localStorage`, uma tentativa numa aba bloquearia a de outra.
function marcarTentativa(): boolean {
  try {
    sessionStorage.setItem(CHAVE, String(Date.now()));
    return true;
  } catch {
    // Aba anônima com armazenamento bloqueado: sem onde marcar, não recarrega.
    return false;
  }
}
