import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@repo/ui';

/// Faixa fixa no rodapé com a PRÓXIMA ação da tela: criar, finalizar,
/// exportar o que foi selecionado.
///
/// **Por que fixa.** O botão no fim do formulário obrigava a rolar até o fim
/// para descobrir se dava para seguir — e, no RDO, a rolar por todas as
/// seções. Fixa, a ação está sempre a um polegar de distância, no celular e no
/// computador.
///
/// **Ela TOMA o lugar da navegação inferior**, em vez de empilhar em cima: duas
/// faixas fixas comeriam um quarto de uma tela de 6", e o botão central
/// elevado da navegação cairia por cima da ação. É o padrão de seleção de
/// qualquer app de fotos: enquanto há algo a fazer, a barra é da ação; quando
/// some, a navegação volta.
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  const registrar = useContext(ActionBarContext);
  const faixa = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(0);

  useLayoutEffect(() => registrar(), [registrar]);

  // O espaçador acompanha a altura REAL da faixa, que cresce quando aparece
  // uma mensagem de erro: com uma altura fixa, o fim da página ficaria atrás
  // dela justamente quando há algo para ler lá.
  useLayoutEffect(() => {
    const elemento = faixa.current;
    if (!elemento) return;
    setAltura(elemento.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => setAltura(elemento.offsetHeight));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden style={{ height: altura }} />
      <div
        ref={faixa}
        className={cn(
          // Opaca, e não translúcida como o cabeçalho: atrás dela passa a
          // lista, e texto de cartão vazando por trás do botão confunde o
          // que é ação e o que é conteúdo.
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background',
          'pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(0_0_0/0.15)]',
          'animate-in slide-in-from-bottom-4 fade-in-0 duration-200',
        )}
      >
        <div className={cn('mx-auto max-w-2xl px-4 py-3', className)}>{children}</div>
      </div>
    </>
  );
}

/// Quantas faixas estão montadas. Contador, e não booleano: na troca de uma
/// tela para outra que também tem faixa, a nova monta antes de a antiga
/// desmontar, e um booleano seria apagado pela que saiu.
const ActionBarContext = createContext<() => () => void>(() => () => {});

export function ActionBarProvider({ children }: { children: (faixaAtiva: boolean) => ReactNode }) {
  const [ativas, setAtivas] = useState(0);
  const [registrar] = useState(() => () => {
    setAtivas((n) => n + 1);
    return () => setAtivas((n) => n - 1);
  });

  return (
    <ActionBarContext.Provider value={registrar}>{children(ativas > 0)}</ActionBarContext.Provider>
  );
}
