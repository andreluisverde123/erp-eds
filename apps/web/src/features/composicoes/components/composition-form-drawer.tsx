import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';
import { MEASUREMENT_UNITS } from '@/lib/measurement-units';

import {
  COMPOSITION_FORM_DEFAULTS,
  compositionFormSchema,
  type CompositionFormValues,
} from '../composition-form-schema';
import { useCreateComposition, useUpdateComposition } from '../hooks/use-compositions';
import type { Composition, CompositionSummary } from '../types';

/// Cabeçalho da composição: nome, unidade, descrição e situação.
///
/// Sem custo: ele é a soma dos itens, e os itens se editam na página da
/// composição. A lista de unidades é a cópia do front de `MEASUREMENT_UNITS`,
/// travada contra a da API por teste — e não a rota `/catalog-items/units`,
/// que exigiria `catalogo.view` de quem só mantém composição.
export function CompositionFormDrawer({
  open,
  onOpenChange,
  composition,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  composition?: CompositionSummary;
  onSaved?: (composition: Composition) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{composition ? 'Editar composição' : 'Nova composição'}</SheetTitle>
          <SheetDescription>
            {composition
              ? `Composição ${composition.code}. O código não muda.`
              : 'O código é gerado automaticamente (COMP-0001). Os insumos entram depois de salvar.'}
          </SheetDescription>
        </div>

        <Corpo
          key={open ? (composition?.id ?? 'nova') : 'fechado'}
          composition={composition}
          onDone={(salva) => {
            onOpenChange(false);
            if (salva) onSaved?.(salva);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function Corpo({
  composition,
  onDone,
}: {
  composition?: CompositionSummary;
  onDone: (salva?: Composition) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const createMutation = useCreateComposition();
  const updateMutation = useUpdateComposition();

  const form = useForm<CompositionFormValues>({
    resolver: zodResolver(compositionFormSchema),
    defaultValues: composition
      ? {
          name: composition.name,
          unit: composition.unit,
          description: composition.description ?? '',
          active: composition.active,
        }
      : COMPOSITION_FORM_DEFAULTS,
  });

  async function onSubmit(values: CompositionFormValues) {
    setErro(null);
    const input = {
      name: values.name,
      unit: values.unit,
      description: values.description?.trim() || undefined,
      active: values.active,
    };

    try {
      const salva = composition
        ? await updateMutation.mutateAsync({ id: composition.id, input })
        : await createMutation.mutateAsync(input);
      onDone(salva);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar a composição.');
    }
  }

  const salvando = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="composition-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {erro && (
              <Alert variant="destructive">
                <AlertTitle>{erro}</AlertTitle>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Alvenaria de vedação" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidade</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MEASUREMENT_UNITS.map((unidade) => (
                        <SelectItem key={unidade.code} value={unidade.code}>
                          {unidade.code} — {unidade.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A unidade do serviço produzido. Cada coeficiente é a quantidade do insumo para
                    uma unidade desta.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Traço, especificação, observação"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Situação</FormLabel>
                  <Select
                    value={field.value ? 'true' : 'false'}
                    onValueChange={(valor) => field.onChange(valor === 'true')}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">Ativa</SelectItem>
                      <SelectItem value="false">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancelar
        </Button>
        <Button type="submit" form="composition-form" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
