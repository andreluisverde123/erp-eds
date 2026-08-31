import { cn } from '@repo/ui';

/// Classe dos campos do painel. `h-12` e `text-base` não são estética: abaixo
/// de 16px o Safari do iOS dá zoom ao focar o campo e a tela sai do lugar no
/// meio da digitação; abaixo de 44px de altura o alvo fica menor que um dedo.
export const CAMPO_CLASS = cn(
  'w-full rounded-lg border border-input bg-background px-3 text-base',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

export const CAMPO_ALTURA = 'h-12';
