import * as React from 'react';

import { cn } from '../../lib/utils';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

interface TableSkeletonProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /// Quantas colunas a tabela real tem. É o que faz o esqueleto ocupar a mesma
  /// largura do conteúdo que vai substituí-lo, em vez de o layout saltar
  /// quando os dados chegam.
  columns: number;
  rows?: number;
  /// Lido por leitor de tela enquanto carrega. Mantém a mesma frase que a
  /// tela usava no `LoadingState` — o esqueleto troca o visual, não a
  /// informação.
  message?: string;
}

/// Larguras fixas por posição, nunca aleatórias: um `Math.random()` aqui faria
/// as barras mudarem de tamanho a cada re-render, o que chama mais atenção que
/// o carregamento em si. A primeira coluna é a mais larga (costuma ser o nome)
/// e a última é estreita (costuma ser o menu de ações).
const MIDDLE_WIDTHS = ['w-24', 'w-20', 'w-28', 'w-16'];

function cellWidth(index: number, columns: number): string {
  if (index === 0) return 'w-32';
  if (index === columns - 1) return 'w-8';
  return MIDDLE_WIDTHS[(index - 1) % MIDDLE_WIDTHS.length] as string;
}

/// Esqueleto de uma listagem: mesma estrutura de tabela, mesmas colunas,
/// células substituídas por blocos pulsantes.
///
/// A tabela em si fica `aria-hidden`: para quem enxerga, ela comunica a forma
/// do que vem; para um leitor de tela seriam dezenas de células vazias. O
/// `role="status"` com a mensagem em `sr-only` é o que de fato é anunciado.
function TableSkeleton({
  columns,
  rows = 5,
  message = 'Carregando...',
  className,
  ...props
}: TableSkeletonProps) {
  return (
    <div
      data-slot="table-skeleton"
      role="status"
      aria-busy="true"
      className={cn('w-full', className)}
      {...props}
    >
      <span className="sr-only">{message}</span>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }, (_, column) => (
              <TableHead key={column}>
                <Skeleton className={cn('h-3', cellWidth(column, columns))} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, row) => (
            <TableRow key={row}>
              {Array.from({ length: columns }, (_, column) => (
                <TableCell key={column}>
                  <Skeleton className={cn('h-4', cellWidth(column, columns))} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { TableSkeleton };
