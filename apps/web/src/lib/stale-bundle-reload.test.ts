import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerStaleBundleReload } from './stale-bundle-reload';

const CHAVE = 'eds:stale-bundle-reload';

function dispararFalhaDeCarregamento(): Event {
  // O evento real do Vite. `cancelable` importa: é o `preventDefault` que
  // impede a tela de erro de piscar antes de a página sair.
  const evento = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(evento);
  return evento;
}

let recarregou: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  recarregou = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: recarregou },
  });
  registerStaleBundleReload();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('recarregamento por pacote velho', () => {
  it('recarrega quando um pedaço do app não carrega', () => {
    const evento = dispararFalhaDeCarregamento();

    expect(recarregou).toHaveBeenCalledTimes(1);
    // Sem o preventDefault, o Vite relança o erro e a tela branca aparece por
    // um instante antes de a página sair.
    expect(evento.defaultPrevented).toBe(true);
  });

  it('NÃO recarrega de novo quando a falha se repete logo em seguida', () => {
    dispararFalhaDeCarregamento();
    recarregou.mockClear();

    const segundo = dispararFalhaDeCarregamento();

    // A falha que volta logo depois do recarregamento é a que ele não resolve
    // — servidor fora, rede caída, arquivo ausente de verdade. Insistir seria
    // laço infinito; deixar o erro aparecer é o certo.
    expect(recarregou).not.toHaveBeenCalled();
    expect(segundo.defaultPrevented).toBe(false);
  });

  it('volta a recarregar quando a falha acontece muito depois', () => {
    vi.useFakeTimers();
    dispararFalhaDeCarregamento();
    recarregou.mockClear();

    // Um deploy seguinte, minutos depois, na mesma aba: encontra a marca velha
    // e recomeça normalmente.
    vi.advanceTimersByTime(31_000);
    dispararFalhaDeCarregamento();

    expect(recarregou).toHaveBeenCalledTimes(1);
  });

  it('a marca fica no armazenamento da ABA', () => {
    dispararFalhaDeCarregamento();

    // `sessionStorage`, e não `localStorage`: a marca morre com a aba. Em
    // `localStorage`, uma tentativa numa aba bloquearia a de outra.
    expect(sessionStorage.getItem(CHAVE)).not.toBeNull();
  });

  it('sem armazenamento disponível, não recarrega em vez de arriscar o laço', () => {
    // Troca o objeto inteiro em vez de espionar o método: no jsdom o
    // `sessionStorage` é um getter de `window` e nem `vi.spyOn` no objeto nem
    // em `Storage.prototype` chega a ser chamado — o teste passava sem
    // exercitar nada.
    const bloqueado = {
      getItem: () => {
        throw new Error('storage bloqueado');
      },
      setItem: () => {
        throw new Error('storage bloqueado');
      },
    };
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: bloqueado });

    dispararFalhaDeCarregamento();

    // Aba anônima com armazenamento bloqueado: sem onde marcar a tentativa,
    // não há como impedir a repetição — melhor mostrar o erro.
    expect(recarregou).not.toHaveBeenCalled();
  });
});
