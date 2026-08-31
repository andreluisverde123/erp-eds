import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api-client';

import { mediaApi } from '../api';
import { compressImage, readVideoDuration } from '../lib/image-compression';
import type { DiarioReportDetail, MediaType } from '../types';

export type UploadStage = 'processing' | 'uploading' | 'done' | 'error';

export interface UploadTask {
  id: string;
  /// Nome exibido enquanto o arquivo sobe.
  fileName: string;
  /// `blob:` local, para a miniatura aparecer ANTES de o upload terminar. É o
  /// que faz a tela responder na hora numa conexão que leva um minuto.
  previewUrl: string;
  stage: UploadStage;
  percent: number;
  error: string | null;
}

/// Fila de envio de fotos e vídeos.
///
/// Ela existe porque em campo o upload não é instantâneo: a pessoa toca em
/// "adicionar", a foto precisa aparecer imediatamente, e o envio acontece
/// atrás — com estado visível e com caminho de volta quando falha.
///
/// Quatro cuidados que a versão ingênua não tem:
///
/// 1. **Miniatura antes do upload.** Um `blob:` local entra na grade assim que
///    o arquivo é escolhido. Sem isso a tela fica igual por um minuto e a
///    pessoa toca de novo, gerando envio duplicado.
/// 2. **Um de cada vez.** Três uploads simultâneos num 4G ruim fazem os três
///    ficarem lentos e aumentam a chance de todos falharem. A fila envia em
///    sequência.
/// 3. **Retry não duplica.** A retentativa reaproveita a MESMA tarefa e o
///    MESMO arquivo; não existe caminho que crie uma segunda.
/// 4. **Falha não some.** A tarefa fica na tela em estado de erro, com o
///    arquivo ainda em memória, até a pessoa tentar de novo ou descartar.
export function useMediaUpload(reportId: string, type: MediaType) {
  const queryClient = useQueryClient();
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  // Os arquivos ficam fora do estado: são objetos grandes, não são
  // renderizados, e guardá-los em `useState` recriaria a lista a cada
  // atualização de progresso.
  const arquivos = useRef(new Map<string, File>());
  /// Miniatura preparada junto do arquivo. Guardada à parte para a
  /// retentativa reaproveitar as duas sem recomprimir nada.
  const miniaturas = useRef(new Map<string, File | null>());
  const enviando = useRef(false);
  const fila = useRef<string[]>([]);

  const atualizar = useCallback((id: string, mudanca: Partial<UploadTask>) => {
    setTasks((atual) =>
      atual.map((tarefa) => (tarefa.id === id ? { ...tarefa, ...mudanca } : tarefa)),
    );
  }, []);

  const descartar = useCallback((id: string) => {
    setTasks((atual) => {
      const alvo = atual.find((tarefa) => tarefa.id === id);
      if (alvo) URL.revokeObjectURL(alvo.previewUrl);
      return atual.filter((tarefa) => tarefa.id !== id);
    });
    arquivos.current.delete(id);
    miniaturas.current.delete(id);
  }, []);

  const processarFila = useCallback(async () => {
    if (enviando.current) return;
    enviando.current = true;

    try {
      while (fila.current.length > 0) {
        const id = fila.current.shift()!;
        const file = arquivos.current.get(id);
        if (!file) continue;

        atualizar(id, { stage: 'uploading', percent: 0, error: null });

        try {
          const durationSeconds = type === 'VIDEO' ? await readVideoDuration(file) : undefined;

          const relatorio = await mediaApi.upload(
            reportId,
            file,
            { durationSeconds, thumbnail: miniaturas.current.get(id) ?? null },
            (percent) => atualizar(id, { percent }),
          );

          // A resposta traz o relatório inteiro, já com a mídia registrada:
          // escrever no cache substitui a miniatura local pela definitiva.
          queryClient.setQueryData<DiarioReportDetail>(
            ['diario', 'relatorios', reportId],
            relatorio,
          );
          void queryClient.invalidateQueries({ queryKey: ['diario', 'home'] });

          atualizar(id, { stage: 'done', percent: 100 });
          // A tarefa some depois que a mídia definitiva já está na grade —
          // sem o intervalo, a miniatura piscaria entre as duas.
          setTimeout(() => descartar(id), 600);
        } catch (error) {
          atualizar(id, {
            stage: 'error',
            error:
              error instanceof ApiError
                ? error.message
                : 'Não foi possível enviar. Tente novamente.',
          });
        }
      }
    } finally {
      enviando.current = false;
    }
  }, [atualizar, descartar, queryClient, reportId, type]);

  /// Prepara o arquivo (comprime, se for foto) e o coloca na fila.
  const enqueue = useCallback(
    async (file: File) => {
      const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setTasks((atual) => [
        ...atual,
        {
          id,
          fileName: file.name,
          previewUrl: URL.createObjectURL(file),
          stage: 'processing',
          percent: 0,
          error: null,
        },
      ]);

      // A compressão acontece aqui, e não no envio, para o estado
      // "Processando" aparecer enquanto ela roda — numa foto de 12 MB isso
      // leva um instante perceptível. A miniatura sai do mesmo passo.
      if (type === 'PHOTO') {
        const { file: comprimido, thumbnail } = await compressImage(file);
        arquivos.current.set(id, comprimido);
        miniaturas.current.set(id, thumbnail);
      } else {
        arquivos.current.set(id, file);
        miniaturas.current.set(id, null);
      }

      fila.current.push(id);
      void processarFila();
    },
    [processarFila, type],
  );

  const retry = useCallback(
    (id: string) => {
      if (!arquivos.current.has(id)) return;
      atualizar(id, { stage: 'processing', percent: 0, error: null });
      fila.current.push(id);
      void processarFila();
    },
    [atualizar, processarFila],
  );

  return { tasks, enqueue, retry, discard: descartar };
}
