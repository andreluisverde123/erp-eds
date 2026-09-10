import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Desmonta o que ficou de pé entre um teste e outro. Sem isto, o efeito de
// saída do autosave de um teste continuaria escutando `visibilitychange`
// durante o próximo.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom não implementa `scrollTo`, e o React Router o chama ao navegar.
window.scrollTo = vi.fn();

// Nem `scrollIntoView`, que o Radix chama ao abrir um `Select` para trazer a
// opção marcada para a vista. Sem isto, qualquer teste que abra um select
// estoura dentro da biblioteca, num efeito, com um erro que não aponta para
// nada do nosso código.
Element.prototype.scrollIntoView = vi.fn();

// `localStorage` e `sessionStorage` de mentira.
//
// O Node 25 passou a trazer Web Storage nativo, e o global dele ganha do que o
// jsdom instala. Só que o nativo fica DESLIGADO sem `--localstorage-file`: o
// objeto existe, e `getItem` não é função. Quem persiste preferência do usuário
// — a barra lateral recolhida, a marca de demonstração — estoura no teste com
// um erro que não parece ter nada a ver com armazenamento.
//
// Só instala se o que está lá não funcionar. No dia em que o Node ligar o dele
// por padrão, ou o vitest voltar a deixar o do jsdom vencer, este bloco sai do
// caminho sozinho.
function instalarArmazenamento(nome: 'localStorage' | 'sessionStorage') {
  const existente = (globalThis as Record<string, unknown>)[nome] as Partial<Storage> | undefined;
  if (typeof existente?.getItem === 'function') return;

  const dados = new Map<string, string>();
  const falso: Storage = {
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, String(valor)),
    removeItem: (chave: string) => void dados.delete(chave),
    clear: () => dados.clear(),
  };

  Object.defineProperty(globalThis, nome, { value: falso, configurable: true, writable: true });
}

instalarArmazenamento('localStorage');
instalarArmazenamento('sessionStorage');
