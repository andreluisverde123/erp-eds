import { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { FileText, Upload, X } from 'lucide-react';
import { z } from 'zod';
import {
  Alert,
  AlertTitle,
  Button,
  FileDropzone,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Textarea,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useContractors } from '../hooks/use-contractors';
import { useCreateServiceInvoice, useServiceInvoiceCostCenters } from './hooks';

const schema = z.object({
  contractorId: z.string().min(1, 'Selecione o terceirizado.'),
  costCenterId: z.string().min(1, 'Selecione a obra ou o centro de custo.'),
  documentNumber: z.string().trim().min(1, 'Informe o número da nota.').max(50),
  description: z.string().trim().min(1, 'Descreva o serviço.').max(200),
  amount: z
    .string()
    .refine((v) => v.trim() !== '' && !Number.isNaN(Number(v)), 'Valor inválido.')
    .refine((v) => Number(v) > 0, 'Deve ser maior que zero.'),
  issueDate: z.string().optional(),
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  notes: z.string().max(1000).optional(),
});

type Values = z.infer<typeof schema>;

const DEFAULTS: Values = {
  contractorId: '',
  costCenterId: '',
  documentNumber: '',
  description: '',
  amount: '',
  issueDate: '',
  dueDate: '',
  notes: '',
};

interface ServiceInvoiceFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Avisos que a seção mostra depois de fechar (ex.: a nota entrou, o arquivo não).
  onWarning: (message: string) => void;
}

/// LANÇAR NOTA DE SERVIÇO — o serviço do terceirizado, com ou sem contrato
/// ("conserto da bomba da fazenda, R$ 1.000"). A nota vai para a liberação do
/// responsável e, liberada, para o pagamento pelo Financeiro.
export function ServiceInvoiceFormDrawer({
  open,
  onOpenChange,
  onWarning,
}: ServiceInvoiceFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Lançar nota de serviço</SheetTitle>
          <SheetDescription>
            A nota vai para a liberação do responsável e, liberada, para o pagamento pelo
            Financeiro. Não precisa de contrato.
          </SheetDescription>
        </div>
        <FormBody
          key={open ? 'open' : 'closed'}
          onDone={() => onOpenChange(false)}
          onWarning={onWarning}
        />
      </SheetContent>
    </Sheet>
  );
}

function FormBody({ onDone, onWarning }: { onDone: () => void; onWarning: (m: string) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: contractors } = useContractors({ limit: 100, status: 'ACTIVE' });
  const { data: centros } = useServiceInvoiceCostCenters();
  const criar = useCreateServiceInvoice();

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  async function onSubmit(values: Values) {
    setErro(null);
    try {
      const { nota, fileFailed } = await criar.mutateAsync({
        input: {
          contractorId: values.contractorId,
          costCenterId: values.costCenterId,
          documentNumber: values.documentNumber,
          description: values.description,
          amount: Number(values.amount),
          dueDate: values.dueDate,
          issueDate: values.issueDate || undefined,
          notes: values.notes?.trim() || undefined,
        },
        file: arquivo,
      });
      if (fileFailed) {
        onWarning(
          `A nota ${nota.documentNumber} foi lançada, mas o arquivo não subiu. Envie de novo pelo clipe na linha da nota.`,
        );
      }
      onDone();
    } catch (error) {
      setErro(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível lançar a nota. Tente de novo.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="service-invoice-form"
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
              name="contractorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Terceirizado</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Quem prestou o serviço" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contractors?.data.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.tradeName ?? c.legalName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Não está na lista? Cadastre na aba Empresas.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="costCenterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Obra ou centro de custo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Onde o serviço foi feito" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {centros?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.constructionSite ? `${c.constructionSite.name} · ${c.name}` : c.name}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Serviço</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: conserto da bomba da fazenda" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="documentNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Nº da nota</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: 4521" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Valor (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emissão</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Vencimento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Arquivo da nota</span>
              {arquivo ? (
                <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{arquivo.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setArquivo(null)}
                    aria-label="Remover arquivo"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <FileDropzone
                  onFiles={(files) => setArquivo(files[0] ?? null)}
                  className="rounded-md border border-dashed border-border p-4"
                >
                  <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    aria-label="Arquivo da nota"
                    onChange={(event) => {
                      setArquivo(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Upload className="size-5 text-muted-foreground" strokeWidth={1.75} />
                    <p className="text-sm text-muted-foreground">
                      Arraste o PDF ou a foto da nota, ou
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => inputRef.current?.click()}
                    >
                      Selecionar arquivo
                    </Button>
                  </div>
                </FileDropzone>
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
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
        <Button type="submit" form="service-invoice-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Lançando...' : 'Lançar nota'}
        </Button>
      </div>
    </>
  );
}
