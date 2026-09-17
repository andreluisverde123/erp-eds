import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Input,
  Label,
} from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { ApiError } from '@/lib/api-client';

import { renumberReport } from '../api';
import type { DiarioReportDetail } from '../types';
import { DIARIO_ADMIN_PERMISSION } from './delete-report';

/// Correção da numeração, para quem tem `diario.report.admin` (Administrador e
/// Engenharia).
///
/// Discreta como a exclusão: é conserto, não rotina. O número novo vale para
/// este RDO, e os de datas seguintes da obra acompanham em sequência.
export function RenumberReport({ report }: { report: DiarioReportDetail }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(String(report.number));

  const renumerar = useMutation({
    mutationFn: (numero: number) => renumberReport(report.id, numero),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(['diario', 'relatorios', report.id], atualizado);
      // Os outros RDOs da obra também mudaram de número.
      void queryClient.invalidateQueries({ queryKey: ['diario', 'relatorios'] });
      void queryClient.invalidateQueries({ queryKey: ['diario', 'home'] });
      void queryClient.invalidateQueries({ queryKey: ['diario', 'obras'] });
      setAberto(false);
    },
  });

  if (!user?.permissions.includes(DIARIO_ADMIN_PERMISSION)) return null;

  const numero = Number(valor);
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 99999;
  const mensagem =
    renumerar.error instanceof ApiError
      ? renumerar.error.message
      : renumerar.error
        ? 'Não foi possível alterar o número. Tente novamente.'
        : null;

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        className="h-11 w-full text-sm text-muted-foreground"
        onClick={() => {
          setValor(String(report.number));
          renumerar.reset();
          setAberto(true);
        }}
      >
        <Hash className="size-4" />
        Alterar número do RDO
      </Button>

      <AlertDialog open={aberto} onOpenChange={(v) => !renumerar.isPending && setAberto(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar o número do RDO {report.number}</AlertDialogTitle>
            <AlertDialogDescription>
              Os RDOs desta obra com data posterior seguem em sequência (número + 1, + 2…). Os de
              datas anteriores não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form
            id="form-renumerar"
            className="flex flex-col gap-1.5"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (valido) renumerar.mutate(numero);
            }}
          >
            <Label htmlFor="rdo-numero">Novo número</Label>
            <Input
              id="rdo-numero"
              inputMode="numeric"
              value={valor}
              onChange={(evento) => setValor(evento.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </form>

          {mensagem && (
            <Alert variant="destructive">
              <AlertTitle>{mensagem}</AlertTitle>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={renumerar.isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="submit"
              form="form-renumerar"
              disabled={!valido || numero === report.number || renumerar.isPending}
            >
              {renumerar.isPending ? 'Alterando…' : 'Alterar número'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
