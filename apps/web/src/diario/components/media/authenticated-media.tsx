import { useEffect, useState } from 'react';
import { ImageOff, Loader2, Video } from 'lucide-react';
import { cn } from '@repo/ui';

import { apiClient } from '@/lib/api-client';

import { mediaFileUrl, mediaThumbnailUrl } from '../../api';
import type { MediaItem } from '../../types';

/// Renderiza uma foto ou vídeo do RDO.
///
/// **Por que não um `<img src="/api/...">` direto.** O arquivo é servido por
/// uma rota autenticada, e o token desta aplicação vive em MEMÓRIA (nunca em
/// cookie ou localStorage) — um `src` comum não o envia, e a imagem viria 401.
/// Buscar como blob é o mesmo caminho que o ERP já usa para o logo da empresa.
///
/// O custo é que cada arquivo passa por JavaScript antes de aparecer. Em troca,
/// não existe URL pública: quem não tem acesso ao relatório não busca o arquivo
/// nem sabendo o endereço, porque o servidor confere o vínculo com a obra a
/// cada requisição — inclusive o da miniatura.
export function AuthenticatedMedia({
  reportId,
  media,
  variant,
  className,
}: {
  reportId: string;
  media: MediaItem;
  /// `thumb` na grade, `full` na galeria.
  ///
  /// A diferença é o que trafega: a grade busca a MINIATURA (~20 KB), e só
  /// abrir a foto baixa o original (1–2 MB). Num RDO com vinte fotos, isso é a
  /// diferença entre ~400 KB e ~30 MB para abrir a tela.
  ///
  /// Vídeo em `thumb` não baixa nada — mostra a capa com o ícone.
  variant: 'thumb' | 'full';
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  /// Progresso do download, para o vídeo em tela cheia. Um spinner mudo por um
  /// minuto faz a pessoa achar que travou.
  const [percentual, setPercentual] = useState<number | null>(null);

  const ehCapaDeVideo = variant === 'thumb' && media.type === 'VIDEO';
  const endereco =
    variant === 'thumb' ? mediaThumbnailUrl(reportId, media.id) : mediaFileUrl(reportId, media.id);

  useEffect(() => {
    if (ehCapaDeVideo) return;

    let objectUrl: string | null = null;
    let cancelado = false;

    const baixar = async () => {
      try {
        // Vídeo em tela cheia mostra progresso: o arquivo é grande e a espera
        // precisa ser explicada. Foto vai direto — a miniatura é pequena e o
        // original é rápido o bastante para o spinner bastar.
        const blob =
          media.type === 'VIDEO'
            ? await baixarComProgresso(endereco, media.sizeBytes, (valor) => {
                if (!cancelado) setPercentual(valor);
              })
            : await apiClient.getBlob(endereco);

        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelado) setErro(true);
      }
    };

    void baixar();

    return () => {
      cancelado = true;
      // Sem isto cada abertura da galeria vaza um blob na memória do
      // navegador — em campo, com dezenas de fotos, isso derruba a aba.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endereco, ehCapaDeVideo, media.type, media.sizeBytes]);

  if (ehCapaDeVideo) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
      >
        <Video className="size-6" aria-label={`Vídeo ${media.fileName}`} />
      </div>
    );
  }

  if (erro) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
      >
        <ImageOff className="size-5" aria-label="Não foi possível carregar o arquivo" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 bg-muted', className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        {percentual !== null && (
          <span className="text-xs tabular-nums text-muted-foreground">{percentual}%</span>
        )}
        <span className="sr-only" role="status">
          {media.type === 'VIDEO' ? 'Carregando vídeo…' : 'Carregando foto…'}
        </span>
      </div>
    );
  }

  if (media.type === 'VIDEO') {
    return <video src={url} controls playsInline className={className} />;
  }

  return <img src={url} alt={media.fileName} className={className} />;
}

/// Baixa o arquivo relatando o quanto já chegou.
///
/// `apiClient.getBlob` resolve de uma vez só; aqui o corpo é lido em pedaços
/// para o progresso existir. O total vem do `Content-Length` da resposta e, na
/// falta dele, do tamanho que o banco já conhece.
async function baixarComProgresso(
  endereco: string,
  tamanhoConhecido: number,
  onProgress: (percentual: number) => void,
): Promise<Blob> {
  const resposta = await apiClient.getResponse(endereco);
  const total = Number(resposta.headers.get('Content-Length')) || tamanhoConhecido;

  if (!resposta.body || total <= 0) return resposta.blob();

  const leitor = resposta.body.getReader();
  const pedacos: Uint8Array[] = [];
  let recebido = 0;

  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    recebido += value.length;
    onProgress(Math.min(100, Math.round((recebido / total) * 100)));
  }

  return new Blob(pedacos as BlobPart[], {
    type: resposta.headers.get('Content-Type') ?? 'application/octet-stream',
  });
}
