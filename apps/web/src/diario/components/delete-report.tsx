import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { Alert, AlertTitle, Button } from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ApiError } from '@/lib/api-client';

import { deleteReport } from '../api';
import type { DiarioReportDetail } from '../types';

/// Exclusão de rascunho.
///
/// **Discreta de propósito.** Fica abaixo do botão de finalizar, como link e
/// não como botão cheio, e num tom que não disputa atenção. A ação principal
/// do fim da tela é fechar o relatório; excluir é a saída para quem errou a
/// data ou criou sem querer — precisa existir, não precisa se oferecer.
///
/// Só aparece em rascunho. Relatório finalizado não mostra nem o link: o
/// backend recusaria, e um botão que sempre falha é pior que botão nenhum.
export function DeleteReport({ report }: { report: DiarioReportDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState(false);

  const excluir = useMutation({
    mutationFn: () => deleteReport(report.id),
    onSuccess: () => {
      // Sai da tela ANTES de mexer no cache. O relatório não existe mais, e um
      // refetch com a pessoa ainda nele responderia 404 — o erro apareceria
      // como falha, quando na verdade foi a operação dando certo.
      void navigate('/relatorios', { replace: true });
      queryClient.removeQueries({ queryKey: ['diario', 'relatorios', report.id] });
      void queryClient.invalidateQueries({ queryKey: ['diario', 'relatorios'] });
      void queryClient.invalidateQueries({ queryKey: ['diario', 'home'] });
      void queryClient.invalidateQueries({ queryKey: ['diario', 'obras'] });
    },
    onSettled: () => setConfirmando(false),
  });

  if (!report.editable) return null;

  const mensagem =
    excluir.error instanceof ApiError
      ? excluir.error.message
      : excluir.error
        ? 'Não foi possível excluir. Tente novamente.'
        : null;

  return (
    <div className="mt-4">
      {mensagem && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>{mensagem}</AlertTitle>
        </Alert>
      )}

      <Button
        variant="ghost"
        className="h-11 w-full text-sm text-muted-foreground hover:text-destructive"
        disabled={excluir.isPending}
        onClick={() => setConfirmando(true)}
      >
        <Trash2 className="size-4" />
        {excluir.isPending ? 'Excluindo…' : 'Excluir rascunho'}
      </Button>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={(aberto) => !aberto && setConfirmando(false)}
        title={`Excluir o RDO ${report.number}?`}
        // O texto diz o que NÃO volta. "Tem certeza?" não informa nada: quem
        // vai excluir já tem certeza — o que ele não sabe é o que perde junto.
        description={
          'O relatório e tudo que foi registrado nele — mão de obra, equipamentos, ' +
          'atividades, ocorrências, materiais, fotos e vídeos — serão apagados ' +
          'definitivamente. Não há como desfazer.'
        }
        confirmLabel="Excluir definitivamente"
        loadingLabel="Excluindo..."
        variant="destructive"
        isLoading={excluir.isPending}
        onConfirm={() => excluir.mutate()}
      />
    </div>
  );
}
