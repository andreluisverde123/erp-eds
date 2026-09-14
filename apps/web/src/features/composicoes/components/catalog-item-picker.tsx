import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button, Input, cn } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { CATALOG_ITEM_TYPE_LABELS } from '@/features/catalogo/catalog-item-type';

import { searchCompositionCatalogOptions } from '../api';
import type { CatalogOption } from '../types';

/// Escolha do insumo de uma linha nova da composição.
///
/// Busca no CADASTRO desde a primeira letra, por nome ou código, e só oferece
/// insumo ATIVO — desativado não entra em composição nova, e o servidor recusa
/// de novo se chegar. O que já está na composição não é oferecido: o mesmo
/// insumo não entra duas vezes.
///
/// Cada opção mostra código, unidade e NATUREZA. A unidade é a do coeficiente
/// que vai ser digitado ao lado, e a natureza separa "Pedreiro" mão de obra de
/// um material de nome parecido.
export function CatalogItemPicker({
  value,
  onChange,
  excludeIds = [],
  id,
}: {
  value: CatalogOption | null;
  onChange: (item: CatalogOption | null) => void;
  excludeIds?: string[];
  id?: string;
}) {
  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  // O blur dispara antes do clique na opção; o timer dá a janela para ele.
  const fechamento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termo = useDebouncedValue(texto, 200);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['compositions', 'catalog-options', termo],
    queryFn: () => searchCompositionCatalogOptions(termo),
    enabled: aberta && termo.trim().length > 0,
    staleTime: 30_000,
  });

  if (value) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{value.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          <span className="font-mono">
            {value.code} · {value.unit}
          </span>{' '}
          · {CATALOG_ITEM_TYPE_LABELS[value.type]}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => onChange(null)}
        >
          <X className="size-3.5" />
          <span className="sr-only">Trocar insumo</span>
        </Button>
      </div>
    );
  }

  const encontrados = data ?? [];
  const visiveis = encontrados.filter((opcao) => !excludeIds.includes(opcao.id));
  const digitou = texto.trim().length > 0;
  const buscando = digitou && isFetching && visiveis.length === 0;
  const semResultado = digitou && !isFetching && !isError && data !== undefined && visiveis.length === 0;
  const mostrando = aberta && digitou && (visiveis.length > 0 || buscando || semResultado || isError);
  const emFoco = visiveis[Math.min(indice, visiveis.length - 1)];

  function escolher(opcao: CatalogOption) {
    onChange(opcao);
    setTexto('');
    setAberta(false);
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (!mostrando || visiveis.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndice((i) => (i + 1) % visiveis.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndice((i) => (i - 1 + visiveis.length) % visiveis.length);
    } else if (evento.key === 'Enter' && emFoco) {
      evento.preventDefault();
      escolher(emFoco);
    } else if (evento.key === 'Escape') {
      setAberta(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={texto}
        placeholder="Buscar insumo por nome ou código"
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
        onKeyDown={aoTeclar}
      />

      {mostrando && (
        <ul
          role="listbox"
          className={cn(
            'absolute left-0 top-full z-50 mt-0.5 w-[min(32rem,85vw)] overflow-hidden',
            'rounded-md border border-border bg-popover shadow-md',
          )}
          onMouseDown={() => {
            if (fechamento.current) clearTimeout(fechamento.current);
          }}
        >
          {buscando && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">Buscando insumos…</li>
          )}
          {semResultado && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">
              {encontrados.length > 0
                ? 'Os insumos encontrados já estão nesta composição.'
                : 'Nenhum insumo ativo encontrado. Cadastre-o em Insumos.'}
            </li>
          )}
          {isError && !buscando && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">
              Não foi possível buscar insumos. Tente de novo.
            </li>
          )}
          {visiveis.map((opcao, i) => (
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
                <span className="min-w-0 flex-1 truncate">{opcao.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {opcao.code} · {opcao.unit}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {CATALOG_ITEM_TYPE_LABELS[opcao.type]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
