import * as React from 'react';

import { cn } from '../../lib/utils';

interface ErrorStateProps extends React.ComponentProps<'div'> {
  message: string;
}

function ErrorState({ message, className, ...props }: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        'rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive',
        className,
      )}
      {...props}
    >
      {message}
    </div>
  );
}

export { ErrorState };
