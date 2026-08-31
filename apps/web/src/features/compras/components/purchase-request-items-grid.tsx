import { useRef, type KeyboardEvent } from 'react';
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@repo/ui';

import { unitOptionsFor } from '@/lib/measurement-units';

import { ItemDescriptionCell } from './item-description-cell';

import {
  EMPTY_ITEM_ROW,
  isBlankItemRow,
  type PurchaseRequestFormValues,
  type PurchaseRequestItemFormValues,
} from '../purchase-request-form-schema';

/// Quantidade aceita fração (1,5 m³), mas não é dinheiro: `mode="decimal"`
/// deixa digitar "10" e ler dez — no modo caixa registradora isso virava 0,10.
const QUANTITY_DECIMAL_SCALE = 3;

const cellInputClass =
  'h-9 rounded-none border-0 bg-transparent px-2 shadow-none placeholder:text-muted-foreground/50 ' +
  'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ' +
  'aria-invalid:bg-destructive/10';

interface PurchaseRequestItemsGridProps {
  control: Control<PurchaseRequestFormValues>;
  register: UseFormRegister<PurchaseRequestFormValues>;
  errors: FieldErrors<PurchaseRequestFormValues>;
  /// Necessário porque escolher uma sugestão preenche a UNIDADE, que é outro
  /// campo da mesma linha — o `Controller` da descrição não a alcança.
  setValue: UseFormSetValue<PurchaseRequestFormValues>;
}

export function PurchaseRequestItemsGrid({
  control,
  register,
  errors,
  setValue,
}: PurchaseRequestItemsGridProps) {
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' }) as PurchaseRequestItemFormValues[] | undefined;

  /// Enquanto o select de unidade está aberto o foco vai pro portal do Radix,
  /// FORA da linha — o que o `handleRowBlur` leria como "o usuário saiu da
  /// última linha" e faria nascer uma linha em branco só por abrir a lista.
  const unitSelectOpenRef = useRef(false);

  function isRowBlank(index: number): boolean {
    const item = items?.[index];
    if (!item) return true;
    return isBlankItemRow(item);
  }

  function appendRow() {
    append({ ...EMPTY_ITEM_ROW });
  }

  // Estilo planilha: quando o usuário SAI da última linha já preenchida, uma
  // nova linha em branco nasce embaixo. Três detalhes que já custaram bug:
  //
  // 1. Não pode rodar no onChange — os campos de texto são não controlados
  //    (via `register`) e o `append()` re-renderiza o field array inteiro;
  //    a cada tecla o input voltaria ao defaultValue.
  // 2. O blur é checado na LINHA, não no campo: trocar de célula com Tab
  //    dispara o blur do input mas continua na mesma linha (`relatedTarget`
  //    diz pra onde o foco foi).
  // 3. Só cresce se a última linha tiver algo digitado, e nunca quando o foco
  //    está indo pra um botão da própria grade — senão "Adicionar item"
  //    criava DUAS linhas (o blur nascia uma antes do clique nascer a outra)
  //    e passar de Tab pela grade vazia enchia a tela de linhas em branco.
  function handleRowBlur(index: number, event: React.FocusEvent<HTMLTableRowElement>) {
    if (index !== fields.length - 1) return;
    if (isRowBlank(index)) return;
    if (unitSelectOpenRef.current) return;

    const nextFocusTarget = event.relatedTarget as HTMLElement | null;
    if (nextFocusTarget) {
      if (event.currentTarget.contains(nextFocusTarget)) return;
      if (nextFocusTarget.closest('[data-grid-action]')) return;
    }

    appendRow();
  }

  /// Navegação por teclado dentro da grade: nenhuma. Nem Enter (que enviava a
  /// solicitação no meio do preenchimento), nem setas — a pedido do usuário,
  /// a grade se comporta como um formulário comum, onde só o Tab anda.
  ///
  /// O bloqueio é restrito aos INPUTS de propósito: no botão de excluir e no
  /// select de unidade o Enter precisa continuar funcionando (ativar o botão,
  /// abrir a lista).
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.column) {
      event.preventDefault();
    }
  }

  const itemsError = typeof errors.items?.message === 'string' ? errors.items.message : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border" onKeyDown={handleKeyDown}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[220px] !pl-4">Item</TableHead>
              <TableHead className="w-24">Unidade</TableHead>
              <TableHead className="w-28 text-right">Quantidade</TableHead>
              {/* Sem colunas de valor: quem solicita não conhece o preço. Ele é
                  informado pelo setor de Compras na cotação. */}
              <TableHead className="min-w-[180px]">Observação</TableHead>
              <TableHead className="w-10 !pr-4">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const rowError = errors.items?.[index];
              const rowNumber = index + 1;

              // `Controller` no lugar de `register` para a descrição: o campo
              // deixou de ser um `<input>` simples e passa a ter sugestão, que
              // escreve no formulário sem passar por um evento de digitação.
              const descriptionName = `items.${index}.description` as const;
              const notes = register(`items.${index}.notes`);

              return (
                <TableRow
                  key={field.id}
                  className="hover:bg-transparent"
                  onBlur={(event) => handleRowBlur(index, event)}
                >
                  <TableCell className="border-r border-border/60 p-0">
                    <Controller
                      control={control}
                      name={descriptionName}
                      render={({ field: descField }) => (
                        <ItemDescriptionCell
                          value={descField.value ?? ''}
                          onChange={descField.onChange}
                          onBlur={descField.onBlur}
                          // Escolher a sugestão preenche a UNIDADE também: quem
                          // digita "cimento" quase nunca quer trocar de saco
                          // para quilo, e é o segundo campo que ela deixaria
                          // de digitar.
                          onPick={(sugestao) => {
                            descField.onChange(sugestao.description);
                            setValue(`items.${index}.unit`, sugestao.unit, {
                              shouldDirty: true,
                            });
                          }}
                          data-row={index}
                          data-column="description"
                          aria-label={`Item da linha ${rowNumber}`}
                          placeholder="Cimento CPII 50kg"
                          aria-invalid={Boolean(rowError?.description)}
                          className={cellInputClass}
                        />
                      )}
                    />
                    <CellError message={rowError?.description?.message} />
                  </TableCell>
                  <TableCell className="border-r border-border/60 p-0">
                    <Controller
                      control={control}
                      name={`items.${index}.unit`}
                      render={({ field: unitField }) => (
                        <Select
                          value={unitField.value || undefined}
                          onValueChange={unitField.onChange}
                          onOpenChange={(open) => {
                            unitSelectOpenRef.current = open;
                          }}
                        >
                          <SelectTrigger
                            aria-label={`Unidade da linha ${rowNumber}`}
                            aria-invalid={Boolean(rowError?.unit)}
                            className={cn(cellInputClass, 'gap-1 px-2')}
                          >
                            {/* Filho explícito de propósito: sem ele o Radix
                                espelha na célula o conteúdo inteiro da opção
                                ("SC Saco"), e a coluna é estreita demais.
                                Aqui a célula mostra só o código; o nome por
                                extenso fica na lista aberta. */}
                            <SelectValue placeholder="UN">{unitField.value}</SelectValue>
                          </SelectTrigger>
                          <SelectContent data-grid-action>
                            {unitOptionsFor(unitField.value).map((option) => (
                              <SelectItem key={option.code} value={option.code}>
                                <span className="font-medium">{option.code}</span>
                                <span className="text-muted-foreground">{option.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <CellError message={rowError?.unit?.message} />
                  </TableCell>
                  <TableCell className="border-r border-border/60 p-0">
                    <Controller
                      control={control}
                      name={`items.${index}.quantity`}
                      render={({ field: quantityField }) => (
                        <NumberInput
                          {...quantityField}
                          value={quantityField.value ?? ''}
                          mode="decimal"
                          decimalScale={QUANTITY_DECIMAL_SCALE}
                          data-row={index}
                          data-column="quantity"
                          aria-label={`Quantidade da linha ${rowNumber}`}
                          placeholder="0"
                          aria-invalid={Boolean(rowError?.quantity)}
                          className={cn(cellInputClass, 'text-right')}
                        />
                      )}
                    />
                    <CellError message={rowError?.quantity?.message} align="right" />
                  </TableCell>
                  <TableCell className="border-r border-border/60 p-0">
                    <Input
                      {...notes}
                      data-row={index}
                      data-column="notes"
                      aria-label={`Observação da linha ${rowNumber}`}
                      placeholder="Opcional"
                      className={cellInputClass}
                    />
                  </TableCell>
                  <TableCell className="p-0 text-center">
                    <span
                      title={
                        fields.length === 1
                          ? 'A solicitação precisa de pelo menos uma linha'
                          : `Remover a linha ${rowNumber}`
                      }
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-grid-action
                        className="size-8 text-muted-foreground hover:text-destructive"
                        disabled={fields.length === 1}
                        // Sem isso, o clique tira o foco da linha ANTES de
                        // remover: o blur criava uma linha nova em branco no
                        // lugar da que o usuário acabou de excluir.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Remover linha {rowNumber}</span>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        data-grid-action
        className="self-start"
        // Mesmo motivo do botão de excluir: evita que o blur da última linha
        // crie uma linha e o clique crie outra.
        onMouseDown={(event) => event.preventDefault()}
        onClick={appendRow}
      >
        <Plus />
        Adicionar item
      </Button>

      {itemsError && <p className="text-sm text-destructive">{itemsError}</p>}
    </div>
  );
}

/// Mensagem de validação da célula. Antes o erro só existia como
/// `aria-invalid` — e como as células não têm borda, o usuário via o envio
/// travar sem nenhuma pista do motivo.
function CellError({ message, align = 'left' }: { message?: string; align?: 'left' | 'right' }) {
  if (!message) return null;
  return (
    <p className={cn('px-2 pb-1 text-xs text-destructive', align === 'right' && 'text-right')}>
      {message}
    </p>
  );
}
