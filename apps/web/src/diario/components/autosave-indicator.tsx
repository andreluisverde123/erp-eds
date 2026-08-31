import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@repo/ui';

import type { AutosaveState } from '../hooks/use-report-draft';

/// Feedback do salvamento automático.
///
/// Existe porque autosave sem indicador é pior que botão de salvar: a pessoa
/// não tem como saber se pode fechar o app. Ocupa uma linha só, no rodapé da
/// seção, e fica em silêncio (`idle`) enquanto não há nada a dizer — um aviso
/// permanente vira ruído e deixa de ser lido justamente quando importa.
export function AutosaveIndicator({
  state,
  savedAt,
  error,
  onRetry,
}: {
  state: AutosaveState;
  savedAt: Date | null;
  /// Mensagem do servidor. É ela que diz "o término não pode ser anterior ao
  /// início" — sem isso o usuário via só "não foi possível salvar" e não tinha
  /// como saber qual campo corrigir.
  error?: string | null;
  onRetry: () => void;
}) {
  if (state === 'error') {
    return (
      <p role="alert" className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="size-3.5 shrink-0" />
        {error ?? 'Não foi possível salvar.'}
        <button type="button" onClick={onRetry} className="font-medium underline">
          Tentar novamente
        </button>
      </p>
    );
  }

  if (state === 'idle' && !savedAt) return null;

  const salvando = state === 'saving' || state === 'pending';

  return (
    <p
      // `aria-live="polite"` e não `assertive`: quem usa leitor de tela precisa
      // saber que salvou, mas não a ponto de a fala ser interrompida a cada
      // parada da digitação.
      aria-live="polite"
      className={cn(
        'mt-2 flex items-center gap-1.5 text-xs',
        salvando ? 'text-muted-foreground' : 'text-success',
      )}
    >
      {salvando ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          Salvando…
        </>
      ) : (
        <>
          <Check className="size-3.5 shrink-0" />
          {savedAt ? `Salvo às ${horaDe(savedAt)}` : 'Salvo'}
        </>
      )}
    </p>
  );
}

function horaDe(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(data);
}
