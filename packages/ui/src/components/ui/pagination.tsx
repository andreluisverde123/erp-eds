import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from './button';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn('flex w-full items-center justify-between gap-4', className)}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Página anterior"
      className={cn('gap-1', className)}
      {...props}
    >
      <ChevronLeftIcon />
      Anterior
    </Button>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Próxima página"
      className={cn('gap-1', className)}
      {...props}
    >
      Próxima
      <ChevronRightIcon />
    </Button>
  );
}

export { Pagination, PaginationPrevious, PaginationNext };
