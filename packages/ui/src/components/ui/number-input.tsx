import * as React from 'react';

import { cn } from '../../lib/utils';

/// Formata um valor numérico pro padrão brasileiro (milhar com ponto, decimal
/// com vírgula) — ex.: "12000" -> "12.000,00", "120000000" -> "120.000.000,00".
function formatDisplay(
  numericValue: number,
  decimalScale: number,
  minimumFractionDigits = decimalScale,
): string {
  return numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits,
    maximumFractionDigits: decimalScale,
  });
}

/// Converte o valor "cru" do form (string tipo "1050.5", vindo de
/// `z.string()` + `Number(value)` no submit) pra uma string só de dígitos
/// representando centavos — a mesma unidade que o usuário digita no modo
/// `currency`.
function toDigits(rawValue: string, decimalScale: number): string {
  const numeric = Number(rawValue);
  if (!rawValue || Number.isNaN(numeric)) return '';
  return Math.round(numeric * 10 ** decimalScale).toString();
}

function digitsToRawValue(digits: string, decimalScale: number): string {
  if (!digits) return '';
  return (Number(digits) / 10 ** decimalScale).toFixed(decimalScale);
}

/// Deixa passar dígitos e um único separador decimal (vírgula ou ponto), e
/// devolve a string numérica crua com ponto — o formato que os schemas zod
/// desses formulários esperam. "1.250,75" e "1250,75" viram ambos "1250.75".
function decimalDraftToRawValue(draft: string, decimalScale: number): string {
  const cleaned = draft.replace(/[^\d.,]/g, '');
  if (!cleaned) return '';

  const lastSeparator = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  const integerPart = (lastSeparator >= 0 ? cleaned.slice(0, lastSeparator) : cleaned).replace(
    /[.,]/g,
    '',
  );
  const fractionPart =
    lastSeparator >= 0
      ? cleaned
          .slice(lastSeparator + 1)
          .replace(/[.,]/g, '')
          .slice(0, decimalScale)
      : '';

  if (!integerPart && !fractionPart) return '';
  return fractionPart ? `${integerPart || '0'}.${fractionPart}` : integerPart;
}

export interface NumberInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> {
  /// String numérica "crua" (ex.: "1050.5"), igual ao valor que os schemas
  /// zod desses formulários já esperam — nunca a string formatada.
  value: string | null | undefined;
  onChange: (value: string) => void;
  /// Casas decimais. No modo `currency` é também a escala fixa exibida.
  decimalScale?: number;
  /// `currency` (padrão): máscara de caixa registradora, os dígitos entram
  /// pela direita como centavos — certo pra dinheiro, onde "1050" significa
  /// R$ 10,50.
  ///
  /// `decimal`: digitação livre pra QUANTIDADE. No modo currency, digitar "10"
  /// numa quantidade virava 0,10 e era preciso digitar "1000" pra lançar 10
  /// sacos de cimento — aqui "10" é dez, e "1,5" é um e meio.
  mode?: 'currency' | 'decimal';
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    { value, onChange, decimalScale = 2, mode = 'currency', className, onFocus, onBlur, ...props },
    forwardedRef,
  ) => {
    const rawValue = value ?? '';
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // Só depois de DIGITAR o cursor vai pro fim. Antes isso era feito num
    // `onKeyUp`, que rodava também em seta, Shift+seta e Ctrl+A — ou seja,
    // era impossível selecionar ou corrigir o meio do texto.
    const moveCaretToEndRef = React.useRef(false);

    const [digits, setDigits] = React.useState(() => toDigits(rawValue, decimalScale));
    const [draft, setDraft] = React.useState(() => formatRawForDisplay(rawValue, decimalScale));
    const [prevValue, setPrevValue] = React.useState(rawValue);

    // Sincroniza com o valor externo (ex.: form.reset() ao editar um registro
    // existente) sem usar efeito — compara contra o valor anterior durante o
    // próprio render, padrão recomendado pelo React pra "resetar estado quando
    // uma prop muda".
    if (rawValue !== prevValue) {
      setPrevValue(rawValue);
      setDigits(toDigits(rawValue, decimalScale));
      setDraft(formatRawForDisplay(rawValue, decimalScale));
    }

    React.useLayoutEffect(() => {
      if (!moveCaretToEndRef.current) return;
      moveCaretToEndRef.current = false;
      const element = inputRef.current;
      if (!element) return;
      const end = element.value.length;
      element.setSelectionRange(end, end);
    });

    function setRefs(element: HTMLInputElement | null) {
      inputRef.current = element;
      if (typeof forwardedRef === 'function') forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    }

    const currencyDisplay = digits
      ? formatDisplay(Number(digits) / 10 ** decimalScale, decimalScale)
      : '';
    const displayValue = mode === 'currency' ? currencyDisplay : draft;

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      if (mode === 'currency') {
        const nextDigits = event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        const nextRawValue = digitsToRawValue(nextDigits, decimalScale);
        moveCaretToEndRef.current = true;
        setDigits(nextDigits);
        setPrevValue(nextRawValue);
        onChange(nextRawValue);
        return;
      }

      // Modo decimal: o usuário vê exatamente o que digitou enquanto edita
      // (sem separador de milhar entrando no meio da digitação); a formatação
      // acontece no blur.
      const nextDraft = event.target.value.replace(/[^\d.,]/g, '');
      const nextRawValue = decimalDraftToRawValue(nextDraft, decimalScale);
      setDraft(nextDraft);
      setPrevValue(nextRawValue);
      onChange(nextRawValue);
    }

    function handleFocus(event: React.FocusEvent<HTMLInputElement>) {
      onFocus?.(event);
      if (mode !== 'currency') return;
      // Caixa registradora: o próximo dígito entra pela direita.
      const length = event.currentTarget.value.length;
      event.currentTarget.setSelectionRange(length, length);
    }

    function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
      if (mode === 'decimal')
        setDraft(formatRawForDisplay(decimalDraftToRawValue(draft, decimalScale), decimalScale));
      onBlur?.(event);
    }

    return (
      <input
        {...props}
        ref={setRefs}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        data-slot="input"
        className={cn(
          'flex h-9 w-full min-w-0 rounded-md border border-transparent bg-muted px-3 py-1 text-sm transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
      />
    );
  },
);
NumberInput.displayName = 'NumberInput';

/// Exibição do modo `decimal` fora de edição: sem casas decimais forçadas
/// (quantidade "10" é "10", não "10,00"), mas com separador de milhar.
function formatRawForDisplay(rawValue: string, decimalScale: number): string {
  if (!rawValue) return '';
  const numeric = Number(rawValue);
  if (Number.isNaN(numeric)) return '';
  return formatDisplay(numeric, decimalScale, 0);
}
