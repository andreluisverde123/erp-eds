import * as React from 'react';

import { cn } from '../../lib/utils';

interface LoadingStateProps extends React.ComponentProps<'div'> {
  message?: string;
}

function LoadingState({ message = 'Carregando...', className, ...props }: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      className={cn(
        'flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      {message}
    </div>
  );
}

export { LoadingState };
