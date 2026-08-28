import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { cn, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useHotkey } from '@/hooks/use-hotkey';
import { useFavorites } from '@/hooks/use-favorites';
import { useRecentItems } from '@/hooks/use-recent-items';

import { useGlobalSearch } from '@/features/search/hooks/use-global-search';
import {
  SEARCH_GROUP_LABELS,
  type SearchResultItem,
  type SearchResults,
} from '@/features/search/types';

interface PaletteGroup {
  label: string;
  items: SearchResultItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/// Segunda porta de entrada pros mesmos dados do GlobalSearch do header
/// (que continua intocado) — aberta via Cmd/Ctrl+K de qualquer página. Com
/// busca vazia mostra Favoritos + Recentes; com busca, os mesmos grupos de
/// resultado já usados no header.
///
/// O estado de abertura mora no SiteHeader porque no celular a palette é a
/// única busca que sobra (GlobalSearch e HeaderCta somem abaixo de 768px), e
/// lá o gatilho é um botão de lupa, não o atalho de teclado.
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  useHotkey('mod+k', () => onOpenChange(!open));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Busca rápida</DialogTitle>
        <DialogDescription className="sr-only">
          Busque registros em todo o sistema ou navegue por favoritos e itens recentes.
        </DialogDescription>

        {/* A key força um remount toda vez que a palette abre, então query e
            activeIndex sempre nascem zerados sem precisar de um useEffect
            resetando estado (mesmo padrão já usado nos drawers do app). */}
        <CommandPaletteBody key={open ? 'open' : 'closed'} onNavigate={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteBody({ onNavigate }: { onNavigate: () => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebouncedValue(query);
  const { data, isFetching } = useGlobalSearch(debouncedQuery);
  const { favorites } = useFavorites();
  const { recentItems, addRecent } = useRecentItems();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isSearching = debouncedQuery.trim().length >= 2;

  const groups: PaletteGroup[] = useMemo(() => {
    if (isSearching) {
      if (!data) return [];
      return (Object.keys(SEARCH_GROUP_LABELS) as (keyof SearchResults)[])
        .filter((key) => data[key].length > 0)
        .map((key) => ({ label: SEARCH_GROUP_LABELS[key], items: data[key] }));
    }

    const result: PaletteGroup[] = [];
    if (favorites.length > 0) {
      result.push({
        label: 'Favoritos',
        items: favorites.map((favorite) => ({
          id: favorite.id,
          title: favorite.label,
          subtitle: favorite.subtitle ?? '',
          path: favorite.path,
        })),
      });
    }
    if (recentItems.length > 0) {
      result.push({ label: 'Recentes', items: recentItems });
    }
    return result;
  }, [isSearching, data, favorites, recentItems]);

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const clampedActiveIndex =
    flatItems.length === 0 ? 0 : Math.min(activeIndex, flatItems.length - 1);

  function handleSelect(item: SearchResultItem) {
    addRecent(item);
    onNavigate();
    navigate(item.path);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = flatItems[clampedActiveIndex];
      if (item) handleSelect(item);
    }
  }

  let runningIndex = -1;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-[18px] shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar em todo o sistema..."
          className="h-12 border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground sm:inline-block">
          Esc
        </kbd>
      </div>

      <div className="max-h-[400px] overflow-y-auto p-2">
        {isSearching && isFetching && !data && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Buscando...</p>
        )}

        {isSearching && !isFetching && flatItems.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum resultado para &quot;{debouncedQuery}&quot;.
          </p>
        )}

        {!isSearching && flatItems.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Digite para buscar, ou favorite registros para vê-los aqui.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.label} className="py-1.5">
            <p className="px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
            {group.items.map((item) => {
              runningIndex += 1;
              const index = runningIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm',
                    index === clampedActiveIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.subtitle && (
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
