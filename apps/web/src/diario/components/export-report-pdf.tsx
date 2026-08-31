import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { exportReportPdf } from '../api';
import type { DiarioReportDetail } from '../types';

/// Exportação do RDO em PDF.
///
/// **No cabeçalho, e não no fim da tela.** Finalizar é o encerramento do dia e
/// por isso mora embaixo, depois de todas as seções; exportar é uma consulta —
/// alguém que precisa levar o relatório para uma reunião não deveria rolar a
/// página inteira, nem passar perto do botão que fecha o documento.
///
/// Vale em rascunho e em finalizado. O PDF carimba a situação na primeira
/// página, então um rascunho impresso se identifica como tal.
export function ExportReportPdf({ report }: { report: DiarioReportDetail }) {
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar() {
    setErro(null);
    setExportando(true);
    try {
      await exportReportPdf(report);
    } catch (falha) {
      // A mensagem do servidor quando houver: é ela que distingue "o
      // armazenamento está fora" de uma falha genérica.
      setErro(
        falha instanceof ApiError
          ? falha.message
          : 'Não foi possível gerar o PDF. Tentar novamente.',
      );
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        // Só o botão fica indisponível durante a geração. Bloquear o resto do
        // relatório faria uma espera de segundos parecer travamento — e não há
        // motivo: exportar não altera nada que a pessoa possa editar enquanto
        // espera.
        disabled={exportando}
        onClick={() => void exportar()}
      >
        {exportando ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileDown className="size-4" />
        )}
        {exportando ? 'Exportando…' : 'Exportar PDF'}
      </Button>

      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
