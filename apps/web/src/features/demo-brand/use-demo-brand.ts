import { useSyncExternalStore } from 'react';

import { inscrever, marcaAtiva, type MarcaDemo } from './demo-brand';

/// A marca de demonstração ativa, ou `null` quando o sistema está com a
/// identidade da EDS — que é sempre o caso fora de desenvolvimento.
///
/// Vive num `useSyncExternalStore` e não num contexto React porque quem aplica
/// a marca também é o `main.tsx`, antes de existir árvore de componentes. A
/// fonte da verdade precisa ser um módulo, não um provider.
///
/// A escolha entre ler o armazenamento e devolver `null` é feita UMA vez, ao
/// carregar o módulo, e não dentro da função. É o que faz o ternário virar
/// `() => null` ao compilar, e com isso `inscrever` e `marcaAtiva` deixarem de
/// ser referenciados — o módulo de armazenamento inteiro sai do bundle
/// publicado, em vez de ficar lá desligado.
export const useMarcaDemo: () => MarcaDemo | null = import.meta.env.DEV
  ? () => useSyncExternalStore(inscrever, marcaAtiva, () => null)
  : () => null;
