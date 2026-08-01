import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Input } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { useGlobalSearch } from '@/features/search/hooks/use-global-search';
import {
  SEARCH_GROUP_LABELS,
  type SearchResultItem,
  type SearchResults,
} from '@/features/search/types';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebouncedValue(query);
  const { data, isFetching } = useGlobalSearch(debouncedQuery);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function handleSelect(item: SearchResultItem) {
    setQuery('');
    setOpen(false);
    navigate(item.path);
  }

  const groups = useMemo(
    () =>
      data
        ? (Object.keys(SEARCH_GROUP_LABELS) as (keyof SearchResults)[]).filter(
            (key) => data[key].length > 0,
          )
        : [],
    [data],
  );
  const hasResults = groups.length > 0;
  const showPanel = open && debouncedQuery.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-[448px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Buscar em todo o sistema..."
        className="h-[38px] pl-9 placeholder:font-medium"
      />

      {showPanel && (
        <div className="absolute top-full right-0 z-50 mt-1.5 max-h-[420px] w-[360px] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
          {isFetching && !data && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Buscando...</p>
          )}

          {!isFetching && !hasResults && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{debouncedQuery}".
            </p>
          )}

          {data &&
            hasResults &&
            groups.map((group) => (
              <div key={group} className="border-b border-border py-1.5 last:border-b-0">
                <p className="px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {SEARCH_GROUP_LABELS[group]}
                </p>
                {data[group].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
