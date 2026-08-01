import * as React from 'react';

import { cn } from '../../lib/utils';

interface FileDropzoneProps extends React.ComponentProps<'div'> {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/// Wrapper puramente visual de drag-and-drop — não sabe nada sobre upload,
/// mutation ou validação de arquivo. `children` continua sendo o botão/input
/// já existente; isso só adiciona a superfície de arrastar-e-soltar por cima.
function FileDropzone({ onFiles, disabled, className, children, ...props }: FileDropzoneProps) {
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    setIsDraggingOver(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      data-slot="file-dropzone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'rounded-md transition-colors',
        isDraggingOver && 'bg-primary/5 outline-2 outline-dashed outline-primary/50',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { FileDropzone };
