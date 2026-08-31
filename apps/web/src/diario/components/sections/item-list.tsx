import { useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, cn } from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';

/// Moldura comum das quatro listas do RDO (mão de obra, equipamentos,
/// atividades, ocorrências): estado vazio, cartões com editar/excluir e o CTA
/// de adicionar.
///
/// Ela existe porque as quatro se comportam igual, e quatro cópias do mesmo
/// cartão divergem na terceira alteração — a de espaçamento passa numa, a de
/// alvo de toque passa em duas.
export function ItemList({
  vazio,
  rotuloAdicionar,
  disabled,
  onAdicionar,
  children,
}: {
  vazio: string;
  rotuloAdicionar: string;
  disabled: boolean;
  onAdicionar: () => void;
  children: ReactNode;
}) {
  const temItens = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <>
      {temItens ? (
        <ul className="space-y-2">{children}</ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {vazio}
        </p>
      )}

      {!disabled && (
        <Button
          type="button"
          variant="secondary"
          onClick={onAdicionar}
          className="mt-3 h-12 w-full justify-center text-base"
        >
          <Plus className="size-5" />
          {rotuloAdicionar}
        </Button>
      )}
    </>
  );
}

/// Cartão de item. Editar e excluir são botões de 44px — o mínimo que um dedo
/// acerta —, e ficam à direita do conteúdo em vez de escondidos atrás de um
/// menu: uma correção de quantidade não pode custar dois toques e uma leitura.
///
/// **Excluir pede confirmação.** Um alvo de 44px ao lado do de editar, numa
/// tela usada de pé e com luva, é tocado por engano — e um item excluído por
/// engano não tem como voltar, porque item de RDO não tem soft delete. A
/// confirmação vale para as CINCO listas, e não só para materiais: apagar uma
/// atividade sem querer é tão ruim quanto apagar um material, e comportamentos
/// diferentes na mesma tela ensinam o usuário errado.
export function ItemCard({
  titulo,
  destaque,
  etiqueta,
  linhas,
  disabled,
  onEditar,
  onExcluir,
  excluindo,
}: {
  titulo: string;
  /// Número em evidência (quantidade, horário). Fica em tabular para as linhas
  /// alinharem entre si.
  destaque?: string;
  /// Etiqueta colorida ao lado do título (movimentação do material).
  etiqueta?: ReactNode;
  linhas?: (string | null)[];
  disabled: boolean;
  onEditar: () => void;
  onExcluir: () => void;
  excluindo: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const detalhes = (linhas ?? []).filter(Boolean) as string[];

  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            {titulo}
            {etiqueta}
          </p>
          {detalhes.map((linha) => (
            <p key={linha} className="text-xs text-muted-foreground">
              {linha}
            </p>
          ))}
        </div>

        {destaque && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {destaque}
          </span>
        )}

        {!disabled && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEditar}
              aria-label={`Editar ${titulo}`}
              className={cn(
                'flex size-11 items-center justify-center rounded-lg text-muted-foreground',
                'transition-colors active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={excluindo}
              aria-label={`Excluir ${titulo}`}
              className={cn(
                'flex size-11 items-center justify-center rounded-lg text-destructive',
                'transition-colors active:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                excluindo && 'opacity-50',
              )}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Excluir este item?"
        description={`"${titulo}" será removido deste relatório. Não é possível desfazer.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={excluindo}
        onConfirm={() => {
          onExcluir();
          setConfirmando(false);
        }}
      />
    </li>
  );
}
