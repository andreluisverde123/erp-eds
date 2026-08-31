import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock } from 'lucide-react';
import { Alert, AlertTitle, Button } from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ApiError } from '@/lib/api-client';

import { submitReport } from '../api';
import type { DiarioReportDetail } from '../types';

/// Finalização do RDO.
///
/// O botão fica no FIM da tela, depois de todas as seções, e não no cabeçalho:
/// finalizar é a última coisa que se faz no dia, e um botão de fechar
/// permanente à vista, ao lado do título, é tocado por engano em quem só
/// queria rolar a página.
export function FinalizeReport({ report }: { report: DiarioReportDetail }) {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  const finalizar = useMutation({
    mutationFn: () => submitReport(report.id),
    onSuccess: (atualizado) => {
      // A resposta já traz o relatório fechado: escrever no cache troca a tela
      // para somente leitura na hora, sem recarregar nada.
      queryClient.setQueryData(['diario', 'relatorios', report.id], atualizado);
      void queryClient.invalidateQueries({ queryKey: ['diario', 'home'] });
      // A LISTA precisa recarregar para mostrar "Finalizado" — mas o DETALHE
      // não: ele acabou de ser escrito acima. Sem o `predicate`, o prefixo
      // `['diario', 'relatorios']` pegaria os dois, e o refetch do detalhe
      // sobrescreveria o que a resposta trouxe: a tela voltaria a "Rascunho".
      void queryClient.invalidateQueries({
        queryKey: ['diario', 'relatorios'],
        predicate: (consulta) => consulta.queryKey[2] !== report.id,
      });
    },
    // Fecha a confirmação nos dois desfechos. No erro isso é o que importa: a
    // mensagem lista o que falta preencher NAS SEÇÕES, e um diálogo por cima
    // delas esconderia justamente o que a pessoa precisa alcançar.
    onSettled: () => setConfirmando(false),
  });

  if (!report.editable) {
    return <RelatorioFechado report={report} />;
  }

  const mensagem =
    finalizar.error instanceof ApiError
      ? finalizar.error.message
      : finalizar.error
        ? 'Não foi possível finalizar. Tente novamente.'
        : null;

  return (
    <div className="mt-6">
      {mensagem && (
        <Alert variant="destructive" className="mb-3">
          {/* A mensagem do backend lista TODAS as pendências de uma vez — é
              ela que diz o que falta preencher. */}
          <AlertTitle>{mensagem}</AlertTitle>
        </Alert>
      )}

      <Button
        size="lg"
        className="h-12 w-full text-base"
        disabled={finalizar.isPending}
        onClick={() => setConfirmando(true)}
      >
        <CheckCircle2 className="size-5" />
        {finalizar.isPending ? 'Finalizando…' : 'Finalizar RDO'}
      </Button>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        Depois de finalizado, o relatório não poderá mais ser alterado.
      </p>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={(aberto) => !aberto && setConfirmando(false)}
        title="Finalizar relatório?"
        description="Depois de finalizado, este relatório não poderá mais ser alterado."
        confirmLabel="Finalizar relatório"
        loadingLabel="Finalizando..."
        isLoading={finalizar.isPending}
        onConfirm={() => finalizar.mutate()}
      />
    </div>
  );
}

/// O que aparece no lugar do botão depois que o relatório fecha.
///
/// Diz QUANDO e POR QUEM — é a informação que alguém procura ao abrir um RDO
/// antigo, e o que transforma "não dá para editar" numa explicação em vez de
/// um bloqueio sem motivo aparente.
function RelatorioFechado({ report }: { report: DiarioReportDetail }) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">Relatório finalizado</p>
        {report.submittedAt && (
          <p className="text-muted-foreground">
            Em {formatarDataHora(report.submittedAt)}
            {report.submittedBy ? ` por ${report.submittedBy.name}` : ''}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          O conteúdo é histórico e não pode mais ser alterado. Para registrar o dia seguinte, use
          “Copiar relatório” a partir da lista.
        </p>
      </div>
    </div>
  );
}

/// `submittedAt` é um instante de verdade (com hora), ao contrário de
/// `reportDate` — então aqui o fuso do aparelho é o certo: quem lê quer saber
/// que horas eram para ele.
function formatarDataHora(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(valor));
}
