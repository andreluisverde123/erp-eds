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
