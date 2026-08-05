import * as React from 'react';

import { cn } from '../../lib/utils';

/// Bloco cinza pulsante que ocupa o lugar de um conteúdo que ainda não chegou.
/// Só a forma — quem define largura/altura é quem usa, via `className`.
///
/// `motion-reduce:animate-none` porque a pulsação é decorativa: para quem
/// pediu menos movimento no sistema operacional ela vira um bloco estático,
/// que informa a mesma coisa sem o efeito.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
