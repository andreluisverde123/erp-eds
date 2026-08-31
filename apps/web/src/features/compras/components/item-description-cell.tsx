import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, cn } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { searchItemSuggestions, type ItemSuggestion } from '../item-suggestions';

/// A célula de descrição do item, com sugestão do que já foi pedido.
///
/// **Por que existe.** Uma obra pede os mesmos materiais o tempo todo, e cada
/// solicitação era redigitada do zero. Além do trabalho, isso produz várias
/// grafias para o mesmo item ("Cimento CP-II", "cimento cp2", "CIMENTO CPII
/// 50KG") — e relatório por material deixa de somar, porque o banco vê três
/// materiais diferentes.
///
/// **Sugere, não obriga.** Não há catálogo de materiais no ERP e isto não cria
/// um: quem precisa de algo inédito digita e segue. A lista some ao sair do
/// campo, e ignorá-la não custa nada.
export function ItemDescriptionCell({
  value,
  onChange,
  onPick,
  className,
  ...inputProps
}: {
  value: string;
  onChange: (valor: string) => void;
  /// Chamado quando a pessoa ESCOLHE uma sugestão — traz a unidade junto, que
  /// é o outro campo que ela deixaria de digitar.
  onPick: (sugestao: ItemSuggestion) => void;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'className'>) {
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  // Fechar no `blur` direto engoliria o clique na sugestão: o blur dispara
  // ANTES do click. O timer dá a janela para o clique acontecer.
  const fechamento = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Uma consulta por tecla inundaria a API numa digitação normal. 250 ms é o
  // intervalo em que a pessoa ainda percebe a lista como imediata.
  const termo = useDebouncedValue(value, 250);

  const { data: sugestoes } = useQuery({
    queryKey: ['compras', 'item-suggestions', termo],
    queryFn: () => searchItemSuggestions(termo),
    enabled: aberta && termo.trim().length >= 2,
    staleTime: 60_000,
  });

  const lista = sugestoes ?? [];
  // Sugerir exatamente o que já está escrito é ruído: a pessoa já digitou.
  const visiveis = lista.filter(
    (s) => s.description.toLowerCase() !== value.trim().toLowerCase(),
  );
  const mostrando = aberta && visiveis.length > 0;

  function escolher(sugestao: ItemSuggestion) {
    onPick(sugestao);
    setAberta(false);
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (!mostrando) return;

    // Setas e Enter percorrem a lista sem tirar a mão do teclado — é uma grade
    // de digitação, e obrigar o mouse aqui custaria mais que redigitar.
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndice((i) => (i + 1) % visiveis.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndice((i) => (i - 1 + visiveis.length) % visiveis.length);
    } else if (evento.key === 'Enter') {
      // Só intercepta o Enter quando há uma sugestão em foco; do contrário o
      // Enter continua fazendo o que a grade espera dele.
      evento.preventDefault();
      escolher(visiveis[indice]!);
    } else if (evento.key === 'Escape') {
      setAberta(false);
    }
  }

  return (
    <div className="relative">
      <Input
        {...inputProps}
        value={value}
        className={className}
        autoComplete="off"
        onChange={(evento) => {
          onChange(evento.target.value);
          setAberta(true);
          setIndice(0);
        }}
        onFocus={() => setAberta(true)}
        onKeyDown={aoTeclar}
        onBlur={(evento) => {
          fechamento.current = setTimeout(() => setAberta(false), 120);
          inputProps.onBlur?.(evento);
        }}
      />

      {mostrando && (
        <ul
          // `data-grid-action` marca o elemento como parte da grade: o
          // `onBlur` da linha usa isso para não tratar o clique aqui como
          // saída da linha.
          data-grid-action
          className={cn(
            'absolute left-0 top-full z-50 mt-0.5 w-[min(28rem,80vw)] overflow-hidden',
            'rounded-md border border-border bg-popover shadow-md',
          )}
          onMouseDown={() => {
            if (fechamento.current) clearTimeout(fechamento.current);
          }}
        >
          {visiveis.map((sugestao, i) => (
            <li key={sugestao.description}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm',
                  i === indice ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setIndice(i)}
                onClick={() => escolher(sugestao)}
              >
                <span className="min-w-0 flex-1 truncate">{sugestao.description}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{sugestao.unit}</span>
                {sugestao.timesUsed > 1 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {sugestao.timesUsed}×
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
