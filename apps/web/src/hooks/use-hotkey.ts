import { useEffect } from 'react';

/// Atalho de teclado a nível de documento. `combo` no formato "mod+k", onde
/// "mod" vira Cmd no Mac e Ctrl nos demais SOs (checa metaKey OU ctrlKey).
export function useHotkey(combo: string, handler: () => void) {
  useEffect(() => {
    const [modifier, key] = combo.split('+');
    if (!key) return;
    const normalizedKey = key.toLowerCase();

    function handleKeyDown(event: KeyboardEvent) {
      const hasModifier = modifier === 'mod' ? event.metaKey || event.ctrlKey : false;
      if (hasModifier && event.key.toLowerCase() === normalizedKey) {
        event.preventDefault();
        handler();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [combo, handler]);
}
