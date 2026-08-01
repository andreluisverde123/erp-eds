import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../lib/utils';

interface EmptyStateProps extends React.ComponentProps<'div'> {
  icon: LucideIcon;
  title: string;
  description?: string;
}

function EmptyState({ icon: Icon, title, description, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center',
        className,
      )}
      {...props}
    >
      <Icon className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

export { EmptyState };
