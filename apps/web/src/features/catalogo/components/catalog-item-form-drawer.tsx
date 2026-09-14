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

import {
  CATALOG_ITEM_FORM_DEFAULTS,
  catalogItemFormSchema,
  type CatalogItemFormValues,
} from '../catalog-item-form-schema';
import { CATALOG_ITEM_TYPE_LABELS, CATALOG_ITEM_TYPES } from '../catalog-item-type';
import {
  useCreateCatalogItem,
  useMeasurementUnits,
  useUpdateCatalogItem,
} from '../hooks/use-catalog-items';
import type { CatalogItem } from '../types';

/// Cadastro de insumo.
///
/// **Não há campo de preço, e isso é a regra do módulo**: o catálogo responde
/// "o que é este insumo", nunca "quanto custa". Um preço aqui viraria um quinto
/// número — ao lado do cotado, do comprado, do faturado e do referencial — sem
/// data e sem fornecedor, e pareceria a resposta certa. O preço usado numa
/// composição é informado na própria composição.
export function CatalogItemFormDrawer({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: CatalogItem;
}) {
  const editando = Boolean(item);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{editando ? 'Editar insumo' : 'Novo insumo'}</SheetTitle>
          <SheetDescription>
            {editando
              ? `Insumo ${item!.code}. O código não muda.`
              : 'O código é gerado automaticamente conforme a natureza (MAT-0001, MO-0001, EQP-0001).'}
          </SheetDescription>
        </div>

        <Corpo
          key={open ? (item?.id ?? 'novo') : 'fechado'}
          item={item}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function itemToValues(item: CatalogItem): CatalogItemFormValues {
  return {
    name: item.name,
    unit: item.unit,
    category: item.category ?? '',
    description: item.description ?? '',
    type: item.type,
    active: item.active,
  };
}

function Corpo({ item, onDone }: { item?: CatalogItem; onDone: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const createMutation = useCreateCatalogItem();
  const updateMutation = useUpdateCatalogItem(item?.id ?? '');
  const { data: unidades } = useMeasurementUnits();

  const form = useForm<CatalogItemFormValues>({
    resolver: zodResolver(catalogItemFormSchema),
    defaultValues: item ? itemToValues(item) : CATALOG_ITEM_FORM_DEFAULTS,
  });

  async function onSubmit(values: CatalogItemFormValues) {
    setErro(null);
    const input = {
      name: values.name,
      unit: values.unit,
      category: values.category?.trim() || undefined,
      description: values.description?.trim() || undefined,
      active: values.active,
    };

    try {
      // A natureza vai só na criação. Na edição a API a recusa: ela escolheu o
      // prefixo do código, e "MAT-0007" virando mão de obra passaria a mentir.
      if (item) await updateMutation.mutateAsync(input);
      else await createMutation.mutateAsync({ ...input, type: values.type });
      onDone();
    } catch (error) {
      // A recusa por nome duplicado vem do backend com o texto que resolve o
      // problema de quem está na tela — é exibida como veio.
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar o insumo.');
    }
  }

  const salvando = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="catalog-item-form"
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
                    <Input placeholder="Ex.: Cimento CP II 50kg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Natureza</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(item)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATALOG_ITEM_TYPES.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {CATALOG_ITEM_TYPE_LABELS[tipo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {item
                      ? 'A natureza não muda depois do cadastro.'
                      : 'Mão de obra e equipamento são recursos de composição de custo — não são colaboradores nem patrimônio.'}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
                        {/* A lista vem da API — a MESMA que o validador usa.
                            Digitada aqui, a tela poderia oferecer um código que
                            o servidor recusa. */}
                        {unidades?.map((unidade) => (
                          <SelectItem key={unidade.code} value={unidade.code}>
                            {unidade.code} — {unidade.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Cimento" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Especificação, marca, observação"
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
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
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
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="catalog-item-form" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
