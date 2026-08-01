import { useCallback, useMemo, useState } from 'react';

export function useRowSelection<T>(items: T[], getId: (item: T) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const ids = useMemo(() => items.map(getId), [items, getId]);

  // useCallback aqui porque este hook alimenta tabelas memoizadas (React.memo)
  // em várias telas — funções recriadas a cada render anulariam o memo.
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [ids]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const isAllSelected = ids.length > 0 && selectedIds.size === ids.length;
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    toggle,
    toggleAll,
    isAllSelected,
    isIndeterminate,
    clear,
  };
}
