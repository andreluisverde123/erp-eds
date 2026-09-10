import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  AlertTitle,
  Badge,
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

import { formatDate } from '@/features/conciliacao/format';
import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { ApiError } from '@/lib/api-client';

import { useTransferEmployee } from '../hooks/use-employee-allocation-mutations';
import { useEmployeeAllocations } from '../hooks/use-employee-allocations';
import type { Employee, EmployeeAllocation } from '../types';

/// Alocações de um colaborador: onde ele está, desde quando, e por onde passou.
///
/// Num painel só, e não em três telas, porque as três perguntas são feitas
/// juntas — "onde o André está?" quase sempre vem seguida de "e ele vai para
/// onde?". A transferência fica ao lado do histórico que ela vai alterar.

const transferSchema = z.object({
  constructionSiteId: z.string().min(1, 'Escolha a obra de destino.'),
  date: z.string().min(1, 'Informe a data da transferência.'),
});

type TransferValues = z.infer<typeof transferSchema>;

/// A alocação vigente é a de maior início, sem fim ou com fim de hoje em
/// diante. Mesma regra que o backend usa para a coluna "Obra Atual" — repetida
/// aqui só para marcar a linha, nunca para decidir nada.
function alocacaoAtual(historico: EmployeeAllocation[]): EmployeeAllocation | null {
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    historico.find((a) => a.startDate.slice(0, 10) <= hoje && (!a.endDate || a.endDate.slice(0, 10) >= hoje)) ??
    null
  );
}

export function EmployeeAllocationsDrawer({
  employee,
  open,
  onOpenChange,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Alocações {employee ? `— ${employee.name}` : ''}</SheetTitle>
          <SheetDescription>
            Obra atual, histórico de obras e transferência.
          </SheetDescription>
        </div>

        {employee && (
          <Corpo key={employee.id} employee={employee} onDone={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Corpo({ employee, onDone }: { employee: Employee; onDone: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const transferMutation = useTransferEmployee();

  // Histórico COMPLETO: sem filtro de data, o backend devolve todas as
  // alocações do colaborador, da mais recente para a mais antiga.
  const { data, isLoading } = useEmployeeAllocations({ employeeId: employee.id, limit: 100 });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const historico = data?.data ?? [];
  const atual = alocacaoAtual(historico);

  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { constructionSiteId: '', date: new Date().toISOString().slice(0, 10) },
  });

  async function transferir(values: TransferValues) {
    setErro(null);
    try {
      await transferMutation.mutateAsync({
        employeeId: employee.id,
        constructionSiteId: values.constructionSiteId,
        date: values.date,
      });
      form.reset({ constructionSiteId: '', date: values.date });
    } catch (error) {
      // A recusa por período sobreposto vem do backend com a obra e o período
      // em conflito no texto — é a mensagem que resolve o problema de quem
      // está na tela, então ela é exibida como veio.
      setErro(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível transferir. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Obra atual</h3>
          {atual ? (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{atual.constructionSite.name}</p>
              <p className="text-xs text-muted-foreground">
                Desde {formatDate(atual.startDate)}
                {atual.endDate ? ` · até ${formatDate(atual.endDate)}` : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem alocação vigente. A transferência abaixo cria a primeira.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Transferir de obra</h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(transferir)} className="flex flex-col gap-3" noValidate>
              {erro && (
                <Alert variant="destructive">
                  <AlertTitle>{erro}</AlertTitle>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="constructionSiteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nova obra</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Escolha a obra" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sitesData?.data
                            .filter((site) => site.id !== atual?.constructionSite.id)
                            .map((site) => (
                              <SelectItem key={site.id} value={site.id}>
                                {site.name}
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
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primeiro dia na obra nova</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dizer o efeito antes de ele acontecer: a alocação atual não
                  some, ela ganha uma data de fim. */}
              {atual && (
                <p className="text-xs text-muted-foreground">
                  A alocação em <strong className="font-medium">{atual.constructionSite.name}</strong>{' '}
                  será encerrada no dia anterior. O histórico é preservado.
                </p>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={transferMutation.isPending}>
                  {transferMutation.isPending ? 'Transferindo...' : 'Transferir'}
                </Button>
                <Button type="button" variant="outline" onClick={onDone}>
                  Fechar
                </Button>
              </div>
            </form>
          </Form>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Histórico de obras</h3>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && historico.length === 0 && (
            <p className="text-sm text-muted-foreground">Este colaborador ainda não foi alocado.</p>
          )}
          <ul className="flex flex-col gap-2">
            {historico.map((alocacao) => (
              <li
                key={alocacao.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {alocacao.constructionSite.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(alocacao.startDate)} →{' '}
                    {alocacao.endDate ? formatDate(alocacao.endDate) : 'em aberto'}
                  </p>
                </div>
                {alocacao.id === atual?.id && <Badge variant="success">Atual</Badge>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
