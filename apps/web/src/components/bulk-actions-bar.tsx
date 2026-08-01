import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@repo/ui';

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  children: ReactNode;
}

export function BulkActionsBar({ selectedCount, onClearSelection, children }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-4 py-2.5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" onClick={onClearSelection}>
          <X className="size-4" />
          <span className="sr-only">Limpar seleção</span>
        </Button>
        <span className="text-sm font-medium text-foreground">
          {selectedCount} {selectedCount === 1 ? 'item selecionado' : 'itens selecionados'}
        </span>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
