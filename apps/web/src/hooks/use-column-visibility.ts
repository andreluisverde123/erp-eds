import { useCallback } from 'react';

import { useLocalStorage } from './use-local-storage';

export interface ColumnDef {
  id: string;
  label: string;
}

export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const defaultVisibility = Object.fromEntries(columns.map((column) => [column.id, true]));
  const [visibility, setVisibility] = useLocalStorage<Record<string, boolean>>(
    storageKey,
    defaultVisibility,
  );

  // useCallback aqui porque este hook alimenta tabelas memoizadas (React.memo)
  // em várias telas — funções recriadas a cada render anulariam o memo.
  const isVisible = useCallback((id: string) => visibility[id] ?? true, [visibility]);

  const toggleColumn = useCallback(
    (id: string) => {
      setVisibility((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
    },
    [setVisibility],
  );

  return { columns, isVisible, toggleColumn };
}
