import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@repo/ui';

/// Uma seção do RDO.
///
/// Duas formas, mesma moldura: a seção que já funciona (com `children`) e a
/// que ainda vai chegar. A segunda NÃO é um espaço em branco nem um "erro
/// carregando" — mostra o nome, o ícone e uma linha dizendo o que vai entrar
/// ali, com uma marca discreta de "em breve".
///
/// Cabeçalhos dobráveis, e não tudo aberto: com nove seções abertas, a de
/// Observações ficaria a três telas de rolagem do topo. Fechada, cada seção
/// custa uma linha, e a lista inteira cabe numa tela de 375px.
export function ReportSectionCard({
  titulo,
  icone: Icone,
  descricao,
  resumo,
  concluida = false,
  aberta = false,
  children,
}: {
  titulo: string;
  icone: LucideIcon;
  descricao?: string;
  /// O que já foi preenchido ("5 funções · 18 pessoas"). Substitui a descrição
  /// quando existe: uma vez que há conteúdo, saber quanto há vale mais do que
  /// ler de novo o que a seção é.
  resumo?: string | null;
  /// Mostra o ✓ ao lado do título. É o que permite passar os olhos pela lista
  /// e ver o que falta sem abrir nada.
  concluida?: boolean;
  aberta?: boolean;
  children?: ReactNode;
}) {
  const [expandida, setExpandida] = useState(aberta);
  const disponivel = Boolean(children);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={() => disponivel && setExpandida((atual) => !atual)}
        aria-expanded={disponivel ? expandida : undefined}
        disabled={!disponivel}
        className={cn(
          'flex w-full items-center gap-3 p-4 text-left',
          disponivel
            ? 'transition-colors active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
            : 'cursor-default',
        )}
      >
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            disponivel ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icone className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-center gap-1.5 text-sm font-semibold',
              disponivel ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {titulo}
            {concluida && (
              <>
                {/* `aria-label` num `<svg>` sem `role` não é anunciado de forma
                    confiável: o texto invisível é o que funciona em todo leitor
                    de tela. */}
                <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                <span className="sr-only">(preenchida)</span>
              </>
            )}
          </p>
          {(resumo ?? descricao) && (
            <p
              className={cn(
                'truncate text-xs',
                resumo ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {resumo ?? descricao}
            </p>
          )}
        </div>

        {disponivel ? (
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform',
              expandida && 'rotate-180',
            )}
          />
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Em breve
          </span>
        )}
      </button>

      {disponivel && expandida && <div className="border-t border-border p-4">{children}</div>}
    </section>
  );
}
