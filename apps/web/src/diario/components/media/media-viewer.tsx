import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@repo/ui';

import type { MediaItem } from '../../types';
import { AuthenticatedMedia } from './authenticated-media';

/// Visualização ampliada de uma foto ou vídeo.
///
/// Não usa o `Dialog` do design system: aqui o conteúdo ocupa a tela inteira
/// sobre fundo escuro, sem cartão nem margem — é o que se espera de uma
/// galeria, e o cartão do diálogo brigaria com isso.
///
/// Sem edição de imagem e sem zoom por gesto: o navegador já dá o duplo toque
/// para ampliar num `<img>` em tela cheia, e reimplementar isso em JavaScript
/// costuma sair pior que o nativo.
export function MediaViewer({
  reportId,
  items,
  startIndex,
  onClose,
}: {
  reportId: string;
  items: MediaItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const [indice, setIndice] = useState(startIndex);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const total = items.length;

  // Foco no botão de fechar ao abrir. Sem isso o foco fica no cartão atrás da
  // galeria: quem navega por teclado abre a foto e continua tabulando a página
  // que não está mais vendo.
  useEffect(() => {
    fecharRef.current?.focus();
  }, []);

  const anterior = useCallback(() => setIndice((valor) => (valor - 1 + total) % total), [total]);
  const proximo = useCallback(() => setIndice((valor) => (valor + 1) % total), [total]);

  // Setas e Esc: quem abre o RDO no desktop para conferir as fotos navega pelo
  // teclado, e `Escape` é o gesto universal de fechar.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onClose();
      if (evento.key === 'ArrowLeft') anterior();
      if (evento.key === 'ArrowRight') proximo();
    };

    document.addEventListener('keydown', aoTeclar);
    // A página atrás não pode rolar enquanto a galeria está aberta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [anterior, proximo, onClose]);

  const atual = items[indice];
  if (!atual) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${atual.type === 'PHOTO' ? 'Foto' : 'Vídeo'} ${indice + 1} de ${total}`}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <span className="px-2 text-sm tabular-nums text-white/70">
          {indice + 1} / {total}
        </span>
        <button
          ref={fecharRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex size-11 items-center justify-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="size-6" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <AuthenticatedMedia
          key={atual.id}
          reportId={reportId}
          media={atual}
          variant="full"
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {total > 1 && (
        <div className="flex h-20 shrink-0 items-center justify-between px-2 pb-[env(safe-area-inset-bottom)]">
          <Seta rotulo="Anterior" onClick={anterior} icone={ChevronLeft} />
          <p className="truncate px-3 text-center text-xs text-white/60">{atual.fileName}</p>
          <Seta rotulo="Próxima" onClick={proximo} icone={ChevronRight} />
        </div>
      )}
    </div>
  );
}

function Seta({
  rotulo,
  onClick,
  icone: Icone,
}: {
  rotulo: string;
  onClick: () => void;
  icone: typeof ChevronLeft;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className={cn(
        'flex size-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-white',
        'transition-colors active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
      )}
    >
      <Icone className="size-6" />
    </button>
  );
}
