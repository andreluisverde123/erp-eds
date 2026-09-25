import { Fragment, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Hourglass,
  MoreHorizontal,
  Paperclip,
  Undo2,
  Wallet,
} from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { ApiError } from '@/lib/api-client';

import { PaymentFormDrawer } from '@/features/financeiro/components/payment-form-drawer';
import { PaymentScheduleAttachmentsSheet } from '@/features/financeiro/components/payment-schedule-attachments-sheet';
import {
  useApprovePayment,
  useDownloadPaymentSchedulePdf,
  usePaymentSchedule,
  useRevokePaymentApproval,
} from '@/features/financeiro/hooks/use-payment-schedule';
import type { PaymentScheduleRow } from '@/features/financeiro/types';

function formatCurrency(value: number | string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/// Datas puras chegam como meia-noite UTC: formatar em UTC, senão o fuso de
/// Brasília mostra o dia anterior.
function formatDay(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...options });
}

/// Hoje, no calendário de quem está usando (AAAA-MM-DD).
function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shiftWeek(iso: string, weeks: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

interface DayGroup {
  key: string;
  label: string;
  overdue: boolean;
  rows: PaymentScheduleRow[];
  subtotal: number;
}

/// Vencidas num grupo só, no topo; o resto, um grupo por dia de vencimento.
function groupByDay(rows: PaymentScheduleRow[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const row of rows) {
    const key = row.overdue ? 'vencidas' : row.dueDate.slice(0, 10);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: row.overdue
          ? 'Vencidas e ainda não pagas'
          : formatDay(row.dueDate, { weekday: 'long', day: '2-digit', month: '2-digit' }),
        overdue: row.overdue,
        rows: [],
        subtotal: 0,
      };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.subtotal += Number(row.remaining);
  }

  return [...groups.values()];
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: 'default' | 'destructive' | 'success' | 'pending';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    destructive: 'bg-destructive/10 text-destructive',
    success: 'bg-success/10 text-success',
    pending: 'bg-pending text-pending-foreground',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </span>
        </div>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </div>
      </CardContent>
    </Card>
  );
}

/// PROGRAMAÇÃO DE PAGAMENTOS — o "resumo de sexta" do cliente, dentro do
/// sistema.
///
/// Quem tem `financeiro.approve` (a diretoria) marca o que pode ser pago na
/// semana e libera; o Financeiro vê a mesma lista, anexa as notas fiscais e
/// os boletos e registra o pagamento. O PDF é o resumo para mandar ou
/// imprimir.
export function ProgramacaoPagamentosPage() {
  const [week, setWeek] = useState(todayIso);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [attachmentsRow, setAttachmentsRow] = useState<PaymentScheduleRow | null>(null);
  const [payingRow, setPayingRow] = useState<PaymentScheduleRow | null>(null);

  const { user } = useAuth();
  const canApprove = user?.permissions.includes('financeiro.approve') ?? false;
  const canManage = user?.permissions.includes('financeiro.manage') ?? false;

  const { data, isLoading, isError } = usePaymentSchedule(week);
  const approve = useApprovePayment();
  const revoke = useRevokePaymentApproval();
  const pdf = useDownloadPaymentSchedulePdf();

  const groups = useMemo(() => groupByDay(data?.rows ?? []), [data]);
  const pendentes = useMemo(
    () => (data?.rows ?? []).filter((row) => !row.approvedForPaymentAt),
    [data],
  );
  const selecionadas = pendentes.filter((row) => selected.has(row.id));
  const totalSelecionado = selecionadas.reduce((soma, row) => soma + Number(row.remaining), 0);

  function mudarSemana(novaSemana: string) {
    setWeek(novaSemana);
    setSelected(new Set());
    setActionError(null);
  }

  function alternar(id: string, marcado: boolean) {
    setSelected((atual) => {
      const proxima = new Set(atual);
      if (marcado) proxima.add(id);
      else proxima.delete(id);
      return proxima;
    });
  }

  function alternarTodas(marcado: boolean) {
    setSelected(marcado ? new Set(pendentes.map((row) => row.id)) : new Set());
  }

  function erro(error: unknown, padrao: string) {
    setActionError(error instanceof ApiError ? error.message : padrao);
  }

  function liberarSelecionadas() {
    setActionError(null);
    approve.mutate(
      selecionadas.map((row) => row.id),
      {
        onSuccess: () => setSelected(new Set()),
        onError: (error) => erro(error, 'Não foi possível liberar as contas. Tente novamente.'),
      },
    );
  }

  function desfazer(row: PaymentScheduleRow) {
    setActionError(null);
    revoke.mutate(row.id, {
      onError: (error) => erro(error, 'Não foi possível desfazer a liberação. Tente novamente.'),
    });
  }

  function baixarPdf() {
    setActionError(null);
    pdf.mutate(week, {
      onError: () => setActionError('Não foi possível gerar o PDF. Tente novamente.'),
    });
  }

  const todasMarcadas = pendentes.length > 0 && selecionadas.length === pendentes.length;
  const colunas = canApprove ? 8 : 7;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Programação de Pagamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            O resumo da semana: o que vence, o que já está liberado para pagar e as notas anexadas.
          </p>
        </div>
        <Button variant="outline" onClick={baixarPdf} disabled={pdf.isPending || !data}>
          <Download />
          {pdf.isPending ? 'Gerando...' : 'Baixar PDF'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => mudarSemana(shiftWeek(data?.weekStart ?? week, -1))}
          aria-label="Semana anterior"
        >
          <ChevronLeft />
        </Button>
        <div className="flex min-w-[200px] items-center justify-center gap-2 text-sm font-medium text-foreground">
          <CalendarRange className="size-4 text-muted-foreground" />
          {data
            ? `${formatDay(data.weekStart, { day: '2-digit', month: '2-digit' })} a ${formatDay(
                data.weekEnd,
                { day: '2-digit', month: '2-digit', year: 'numeric' },
              )}`
            : 'Carregando...'}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => mudarSemana(shiftWeek(data?.weekStart ?? week, 1))}
          aria-label="Próxima semana"
        >
          <ChevronRight />
        </Button>
        <Button variant="ghost" onClick={() => mudarSemana(todayIso())}>
          Esta semana
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Wallet}
            label="A pagar até domingo"
            value={formatCurrency(data.totals.total)}
          />
          <Stat
            icon={AlertCircle}
            label="Vencidas"
            value={formatCurrency(data.totals.overdue)}
            tone={data.totals.overdue > 0 ? 'destructive' : 'default'}
          />
          <Stat
            icon={CheckCircle2}
            label="Liberado para pagar"
            value={formatCurrency(data.totals.approved)}
            tone="success"
          />
          <Stat
            icon={Hourglass}
            label="Falta liberar"
            value={formatCurrency(data.totals.pendingApproval)}
            tone="pending"
          />
        </div>
      )}

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>{actionError}</AlertTitle>
        </Alert>
      )}

      {canApprove && selecionadas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <span className="text-sm text-foreground">
            {selecionadas.length}{' '}
            {selecionadas.length === 1 ? 'conta selecionada' : 'contas selecionadas'} ·{' '}
            <span className="font-medium tabular-nums">{formatCurrency(totalSelecionado)}</span>
          </span>
          <Button onClick={liberarSelecionadas} disabled={approve.isPending}>
            <CheckCircle2 />
            {approve.isPending ? 'Liberando...' : 'Liberar para pagamento'}
          </Button>
        </div>
      )}

      {isError && (
        <ErrorState message="Não foi possível carregar a programação. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={colunas} rows={8} message="Carregando a programação..." />
      )}

      {data && data.rows.length === 0 && (
        <EmptyState
          icon={CalendarRange}
          title="Nada a pagar nesta semana"
          description="Nenhuma conta em aberto vence até domingo, e não há contas vencidas."
        />
      )}

      {data && data.rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {canApprove && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={todasMarcadas}
                    disabled={pendentes.length === 0}
                    onCheckedChange={(valor) => alternarTodas(valor === true)}
                    aria-label="Selecionar todas as contas aguardando liberação"
                  />
                </TableHead>
              )}
              <TableHead>Fornecedor</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="text-right">A pagar</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Anexos</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.key}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell
                    colSpan={colunas}
                    className={`py-2 text-xs font-semibold tracking-wide uppercase ${
                      group.overdue ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span>{group.label}</span>
                      <span className="tabular-nums">{formatCurrency(group.subtotal)}</span>
                    </div>
                  </TableCell>
                </TableRow>

                {group.rows.map((row) => {
                  const anexos = row.attachmentsCount + row.invoiceAttachmentsCount;
                  const liberada = row.approvedForPaymentAt !== null;

                  return (
                    <TableRow key={row.id}>
                      {canApprove && (
                        <TableCell>
                          <Checkbox
                            checked={selected.has(row.id)}
                            disabled={liberada}
                            onCheckedChange={(valor) => alternar(row.id, valor === true)}
                            aria-label={`Selecionar ${row.supplier.tradeName ?? row.supplier.legalName}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-foreground">
                        {row.supplier.tradeName ?? row.supplier.legalName}
                        {group.overdue && (
                          <span className="block text-xs font-normal text-destructive">
                            venceu em {formatDay(row.dueDate, { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.constructionSite?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.invoice ? `NF ${row.invoice.number}` : (row.description ?? '—')}
                      </TableCell>
                      <TableCell className="text-right text-foreground tabular-nums">
                        {formatCurrency(row.remaining)}
                      </TableCell>
                      <TableCell>
                        {liberada ? (
                          <Badge variant="success">
                            Liberada
                            {row.approvedForPaymentBy
                              ? ` · ${row.approvedForPaymentBy.name.split(' ')[0]}`
                              : ''}
                          </Badge>
                        ) : (
                          <Badge variant="pending">Aguardando liberação</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={anexos === 0 ? 'text-muted-foreground' : ''}
                          onClick={() => setAttachmentsRow(row)}
                        >
                          <Paperclip />
                          {anexos === 0 ? 'Anexar' : anexos}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {(canManage || (canApprove && liberada)) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Ações</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canManage && (
                                <DropdownMenuItem onClick={() => setPayingRow(row)}>
                                  <Wallet />
                                  Registrar pagamento
                                </DropdownMenuItem>
                              )}
                              {canApprove && liberada && (
                                <DropdownMenuItem onClick={() => desfazer(row)}>
                                  <Undo2 />
                                  Desfazer liberação
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      <PaymentScheduleAttachmentsSheet
        row={attachmentsRow}
        onOpenChange={(open) => !open && setAttachmentsRow(null)}
        canManage={canManage}
      />

      <PaymentFormDrawer
        open={payingRow !== null}
        onOpenChange={(open) => !open && setPayingRow(null)}
        accountPayable={payingRow ?? undefined}
      />
    </div>
  );
}
