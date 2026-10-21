/// Rascunho local de formulário: o que a pessoa digitou sobrevive a uma queda
/// de sessão, a um reload ou a uma aba fechada sem querer.
///
/// Fica no `localStorage` do navegador, nunca na API — é cópia de trabalho,
/// não registro. A chave leva o id do usuário: num computador compartilhado
/// da obra, quem entra depois não abre o rascunho de outra pessoa.
///
/// Toda leitura e escrita é protegida: navegador em modo privado ou com
/// armazenamento cheio só fica sem rascunho, nunca quebra o formulário.

interface StoredDraft<T> {
  savedAt: string;
  values: T;
}

const PREFIX = 'eds:rascunho:';

/// Rascunho esquecido há mais de uma semana é descartado: a essa altura a
/// solicitação já foi feita de outro jeito, e reabrir com ele confundiria.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredDraft<T>;
    if (Date.now() - new Date(draft.savedAt).getTime() > MAX_AGE_MS) {
      clearDraft(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, values: T) {
  try {
    const draft: StoredDraft<T> = { savedAt: new Date().toISOString(), values };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(draft));
  } catch {
    // Sem espaço ou sem permissão: segue sem rascunho.
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Idem.
  }
}
