import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button, Input, cn } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

/// Autocomplete de uma opção: composição ou insumo, para incluir no orçamento.
///
/// Busca desde a primeira letra, com o mesmo debounce das outras telas.
/// Escolhida, a opção vira um rótulo com "Trocar".
export function OptionPicker<T extends { id: string }>({
  id,
  queryKey,
  search,
  value,
  onChange,
  renderOption,
  renderSelected,
  placeholder,
  emptyMessage,
}: {
  id: string;
  queryKey: string;
  search: (termo: string) => Promise<T[]>;
  value: T | null;
  onChange: (opcao: T | null) => void;
  renderOption: (opcao: T) => ReactNode;
  renderSelected: (opcao: T) => ReactNode;
  placeholder: string;
  emptyMessage: string;
}) {
  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const fechamento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termo = useDebouncedValue(texto, 200);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['budget-option-picker', queryKey, termo],
    queryFn: () => search(termo),
    enabled: aberta && termo.trim().length > 0,
    staleTime: 30_000,
  });

  if (value) {
    return (
      <div className="flex min-h-9 items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
        <div className="min-w-0 flex-1">{renderSelected(value)}</div>
        <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => onChange(null)}>
          <X className="size-3.5" />
          <span className="sr-only">Trocar</span>
        </Button>
      </div>
    );
  }

  const opcoes = data ?? [];
  const digitou = texto.trim().length > 0;
  const mostrando = aberta && digitou && (opcoes.length > 0 || isFetching || isError || data !== undefined);
  const emFoco = opcoes[Math.min(indice, opcoes.length - 1)];

  function escolher(opcao: T) {
    onChange(opcao);
    setTexto('');
    setAberta(false);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrando}
        onChange={(evento) => {
          setTexto(evento.target.value);
          setAberta(true);
          setIndice(0);
        }}
        onFocus={() => setAberta(true)}
        onBlur={() => {
          fechamento.current = setTimeout(() => setAberta(false), 120);
        }}
        onKeyDown={(evento) => {
          if (!mostrando || opcoes.length === 0) return;
          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            setIndice((i) => (i + 1) % opcoes.length);
          } else if (evento.key === 'ArrowUp') {
            evento.preventDefault();
            setIndice((i) => (i - 1 + opcoes.length) % opcoes.length);
          } else if (evento.key === 'Enter' && emFoco) {
            evento.preventDefault();
            escolher(emFoco);
          } else if (evento.key === 'Escape') {
            setAberta(false);
          }
        }}
      />

      {mostrando && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-0.5 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
          onMouseDown={() => {
            if (fechamento.current) clearTimeout(fechamento.current);
          }}
        >
          {isFetching && opcoes.length === 0 && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">Buscando…</li>
          )}
          {!isFetching && !isError && data !== undefined && opcoes.length === 0 && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">{emptyMessage}</li>
          )}
          {isError && <li className="px-3 py-1.5 text-sm text-muted-foreground">Não foi possível buscar.</li>}
          {opcoes.map((opcao, i) => (
            <li key={opcao.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === indice}
                tabIndex={-1}
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm',
                  i === indice ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setIndice(i)}
                onClick={() => escolher(opcao)}
              >
                {renderOption(opcao)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
