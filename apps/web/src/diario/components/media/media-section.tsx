import { useRef, useState } from 'react';
import { AlertCircle, Camera, ImageIcon, Loader2, Plus, Trash2, Video } from 'lucide-react';
import { Button, cn } from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { mediaApi } from '../../api';
import { useMediaUpload, type UploadTask } from '../../hooks/use-media-upload';
import { useReportMutation } from '../../hooks/use-report-mutation';
import type { DiarioReportDetail, MediaItem, MediaType } from '../../types';
import { ReportSectionCard } from '../report-section-card';
import { AuthenticatedMedia } from './authenticated-media';
import { MediaViewer } from './media-viewer';

/// `capture="environment"` faz o celular abrir direto a câmera TRASEIRA, que é
/// a que registra obra. Sem o atributo, o mesmo `<input>` abre o seletor de
/// arquivos — daí os dois campos: um para "tirar" e outro para "escolher".
const ACEITA: Record<MediaType, string> = {
  PHOTO: 'image/jpeg,image/png,image/webp',
  VIDEO: 'video/mp4,video/webm',
};

const TEXTOS: Record<
  MediaType,
  { titulo: string; descricao: string; vazio: string; capturar: string; escolher: string }
> = {
  PHOTO: {
    titulo: 'Fotos',
    descricao: 'Registro fotográfico das frentes.',
    vazio: 'Nenhuma foto neste relatório.',
    capturar: 'Tirar foto',
    escolher: 'Escolher da galeria',
  },
  VIDEO: {
    titulo: 'Vídeos',
    descricao: 'Vídeos curtos de apoio ao relatório.',
    vazio: 'Nenhum vídeo neste relatório.',
    capturar: 'Gravar vídeo',
    escolher: 'Escolher da galeria',
  },
};

/// Seção de mídia — a mesma para fotos e vídeos.
///
/// As duas se comportam igual: grade, upload com progresso, galeria em tela
/// cheia e exclusão com confirmação. Duas cópias divergiriam na terceira
/// alteração, e a de acessibilidade passaria só numa delas.
export function MediaSection({
  report,
  disabled,
  type,
}: {
  report: DiarioReportDetail;
  disabled: boolean;
  type: MediaType;
}) {
  const textos = TEXTOS[type];
  const itens = type === 'PHOTO' ? report.photos : report.videos;
  const total = type === 'PHOTO' ? report.summary.photos : report.summary.videos;

  const { tasks, enqueue, retry, discard } = useMediaUpload(report.id, type);
  const [visualizando, setVisualizando] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<MediaItem | null>(null);

  const capturarRef = useRef<HTMLInputElement>(null);
  const escolherRef = useRef<HTMLInputElement>(null);

  const excluir = useReportMutation(report.id, (mediaId: string) =>
    mediaApi.remove(report.id, mediaId),
  );

  function aoEscolher(event: React.ChangeEvent<HTMLInputElement>) {
    // `Array.from` porque o input pode aceitar múltiplos: quando o aparelho
    // permite, a fila cuida de enviar um de cada vez.
    Array.from(event.target.files ?? []).forEach((file) => void enqueue(file));
    // Zerar permite reescolher o MESMO arquivo em seguida — sem isto o
    // `change` não dispara na segunda vez e a tela parece travada.
    event.target.value = '';
  }

  return (
    <ReportSectionCard
      titulo={textos.titulo}
      icone={type === 'PHOTO' ? ImageIcon : Video}
      descricao={textos.descricao}
      resumo={resumo(type, total)}
      concluida={total > 0}
    >
      {itens.length === 0 && tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {textos.vazio}
        </p>
      ) : (
        // Grade de três colunas: numa tela de 375px cada miniatura fica com
        // ~105px, grande o bastante para reconhecer a frente de serviço e
        // pequena o bastante para caber seis fotos sem rolagem.
        <ul className="grid grid-cols-3 gap-2">
          {itens.map((media, indice) => (
            <li key={media.id} className="relative">
              <button
                type="button"
                onClick={() => setVisualizando(indice)}
                aria-label={`Abrir ${type === 'PHOTO' ? 'foto' : 'vídeo'} ${indice + 1}`}
                className="block aspect-square w-full overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* `AuthenticatedMedia` decide sozinho: foto baixa o arquivo,
                    vídeo mostra a capa sem baixar nada. A escolha ficava aqui
                    e no componente ao mesmo tempo — duas regras para a mesma
                    decisão, e a do componente estava quebrada. */}
                <AuthenticatedMedia
                  reportId={report.id}
                  media={media}
                  variant="thumb"
                  className="size-full object-cover"
                />
              </button>

              {!disabled && (
                <button
                  type="button"
                  onClick={() => setConfirmando(media)}
                  aria-label={`Excluir ${media.fileName}`}
                  className={cn(
                    // 44px: o mínimo que um dedo acerta com confiança. Era
                    // 36px — pequeno demais para o único botão destrutivo que
                    // fica sobreposto ao conteúdo.
                    'absolute right-1 top-1 flex size-11 items-center justify-center rounded-full',
                    'bg-black/60 text-white transition-colors active:bg-black/80',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                  )}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}

          {tasks.map((task) => (
            <li key={task.id}>
              <CartaoDeEnvio
                task={task}
                onRetry={() => retry(task.id)}
                onDiscard={() => discard(task.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <>
          {/* Dois inputs, escondidos, acionados pelos botões abaixo. O
              `capture` só existe no primeiro — é o que faz o celular abrir a
              câmera em vez do seletor de arquivos. */}
          <input
            ref={capturarRef}
            type="file"
            accept={ACEITA[type]}
            capture="environment"
            onChange={aoEscolher}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={escolherRef}
            type="file"
            accept={ACEITA[type]}
            multiple={type === 'PHOTO'}
            onChange={aoEscolher}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => capturarRef.current?.click()}
              className="h-12 text-sm"
            >
              {type === 'PHOTO' ? <Camera className="size-5" /> : <Video className="size-5" />}
              {textos.capturar}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => escolherRef.current?.click()}
              className="h-12 text-sm"
            >
              <Plus className="size-5" />
              {textos.escolher}
            </Button>
          </div>
        </>
      )}

      {visualizando !== null && (
        <MediaViewer
          reportId={report.id}
          items={itens}
          startIndex={visualizando}
          onClose={() => setVisualizando(null)}
        />
      )}

      <ConfirmDialog
        open={confirmando !== null}
        onOpenChange={(aberto) => !aberto && setConfirmando(null)}
        title={type === 'PHOTO' ? 'Excluir esta foto?' : 'Excluir este vídeo?'}
        description="O arquivo será removido do relatório e do armazenamento. Não é possível desfazer."
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={excluir.isPending}
        onConfirm={() => {
          if (confirmando) excluir.mutate(confirmando.id);
          setConfirmando(null);
        }}
      />
    </ReportSectionCard>
  );
}

/// Miniatura de um arquivo ainda em envio.
///
/// A imagem local aparece na hora, esmaecida, com o estado por cima. É o que
/// faz a tela responder ao toque numa conexão que leva um minuto — sem isso a
/// pessoa toca de novo e envia duas vezes.
function CartaoDeEnvio({
  task,
  onRetry,
  onDiscard,
}: {
  task: UploadTask;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const falhou = task.stage === 'error';

  return (
    <div
      className="relative aspect-square overflow-hidden rounded-lg border border-border"
      // `aria-live`: quem usa leitor de tela precisa saber que o envio
      // terminou — a barra de progresso sozinha é invisível para ele.
      aria-live="polite"
    >
      <img src={task.previewUrl} alt="" className="size-full object-cover opacity-40" />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 p-2 text-center">
        {falhou ? (
          <>
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-[10px] font-medium text-destructive">Falha no envio</p>
            <button
              type="button"
              onClick={onRetry}
              className="text-[11px] font-semibold text-primary underline"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="text-[10px] text-muted-foreground underline"
            >
              Descartar
            </button>
          </>
        ) : (
          <>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-[10px] font-medium text-muted-foreground">
              {task.stage === 'processing' ? 'Processando…' : `Enviando ${task.percent}%`}
            </p>
            {task.stage === 'uploading' && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${task.percent}%` }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function resumo(type: MediaType, total: number): string | null {
  if (total === 0) return null;
  if (type === 'PHOTO') return `${total} ${total === 1 ? 'foto' : 'fotos'}`;
  return `${total} ${total === 1 ? 'vídeo' : 'vídeos'}`;
}
