import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReportPatch } from '../api';

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/// Campos escalares do RDO que passam pelo salvamento automático. Todos vivem
/// no mesmo `PATCH /diario/relatorios/:id`.
export type DraftField = keyof ReportPatch;

export type DraftValues = Partial<Record<DraftField, string | null>>;

export interface ReportDraft {
  /// O que a tela exibe. É o rascunho local, não o que veio do servidor —
  /// senão o campo piscaria de volta ao valor antigo enquanto o PATCH viaja.
  values: DraftValues;
  /// Altera um campo digitado letra a letra (observações). Espera o debounce.
  setField: (campo: DraftField, valor: string | null) => void;
  /// Altera um campo escolhido de uma vez (horário, clima) e grava na hora.
  /// Esperar 1,2 s ali só atrasaria o "Salvo" sem poupar requisição nenhuma.
  setFieldNow: (campo: DraftField, valor: string | null) => void;
  state: AutosaveState;
  savedAt: Date | null;
  /// Mensagem do servidor quando a gravação falha — é ela que diz "o término
  /// não pode ser anterior ao início".
  error: string | null;
  /// Grava agora o que estiver pendente. Usado ao sair da tela e no "tentar
  /// de novo".
  flush: () => void;
}

interface Options {
  /// Valores como estão no servidor no momento em que a tela abre.
  initial: DraftValues;
  /// Recebe SÓ o que mudou. Devolve os valores confirmados pelo servidor.
  onSave: (patch: DraftValues) => Promise<unknown>;
  /// Milissegundos de silêncio antes de gravar o que é digitado.
  delay?: number;
  /// Desligado quando o relatório não é editável — a tela não deve nem tentar.
  enabled?: boolean;
}

/// Salvamento automático do RDO — **um mecanismo só, para todos os campos**.
///
/// A versão anterior tinha dois caminhos: observações passavam por um autosave
/// com fila, e horário e clima chamavam a mutação direto. Isso produzia três
/// defeitos reais, que este hook fecha:
///
/// 1. **Uma requisição por tecla.** As observações da jornada e do clima eram
///    `<textarea>` ligados direto à mutação: cada letra digitada virava um
///    PATCH. Agora todo campo de texto passa pelo mesmo debounce.
/// 2. **Requisições concorrentes.** Dois toques rápidos no clima disparavam
///    dois PATCH simultâneos; a resposta que chegasse por último vencia, e ela
///    podia ser a do primeiro toque. Agora há UMA gravação em voo por vez, e o
///    que muda no meio entra no próximo envio.
/// 3. **Erro invisível.** A mutação direta não tinha tratamento: um horário
///    recusado pelo servidor ("término antes do início") deixava o campo
///    mostrando o valor inválido, sem aviso nenhum. Agora o erro sobe para o
///    indicador, com o texto do servidor e um caminho de volta.
///
/// O envio manda apenas o DIFF entre o rascunho e o que o servidor confirmou —
/// e como só existe uma gravação em voo, uma resposta antiga não tem como
/// sobrescrever uma alteração mais nova.
export function useReportDraft({
  initial,
  onSave,
  delay = 1200,
  enabled = true,
}: Options): ReportDraft {
  const [values, setValues] = useState<DraftValues>(initial);
  const [state, setState] = useState<AutosaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs, e não estado: o temporizador e os ouvintes de saída leem estes
  // valores no instante em que disparam, e re-renderizar a cada tecla só para
  // manter uma closure atualizada seria desperdício numa tela de campo.
  const valuesRef = useRef(values);
  const syncedRef = useRef<DraftValues>(initial);
  const onSaveRef = useRef(onSave);
  const enabledRef = useRef(enabled);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    valuesRef.current = values;
    onSaveRef.current = onSave;
    enabledRef.current = enabled;
  });

  // Laço, e não recursão: "enquanto houver diferença, grave". Cobre sozinho o
  // caso de a pessoa continuar mexendo durante a gravação — e é o que garante
  // que nunca haja duas em voo.
  const run = useCallback(async () => {
    if (!enabledRef.current || inFlight.current) return;

    inFlight.current = true;
    let gravou = false;
    try {
      for (;;) {
        const diff = diferenca(valuesRef.current, syncedRef.current);
        if (Object.keys(diff).length === 0) break;

        setState('saving');
        try {
          await onSaveRef.current(diff);
        } catch (erro) {
          setError(mensagemDe(erro));
          setState('error');
          return;
        }

        // Marca como confirmado SÓ o que foi enviado. O que a pessoa digitou
        // enquanto o PATCH viajava continua pendente e sai na volta do laço.
        syncedRef.current = { ...syncedRef.current, ...diff };
        setSavedAt(new Date());
        setError(null);
        gravou = true;
      }

      // Só anuncia "salvo" se algo foi de fato gravado: o temporizador também
      // dispara na abertura da tela, e "Salvo agora" num RDO que ninguém tocou
      // é mentira.
      if (gravou) setState('saved');
    } finally {
      inFlight.current = false;
    }
  }, []);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void run();
  }, [run]);

  const agendar = useCallback(
    (campo: DraftField, valor: string | null, imediato: boolean) => {
      setValues((atual) => ({ ...atual, [campo]: valor }));
      // O ref é atualizado na hora porque `flush()` pode rodar antes do
      // próximo render — é o caso do campo escolhido de uma vez.
      valuesRef.current = { ...valuesRef.current, [campo]: valor };
      setError(null);
      setState((anterior) => (anterior === 'saving' ? anterior : 'pending'));

      if (timer.current) clearTimeout(timer.current);
      if (imediato) {
        void run();
        return;
      }
      timer.current = setTimeout(() => void run(), delay);
    },
    [delay, run],
  );

  const setField = useCallback(
    (campo: DraftField, valor: string | null) => agendar(campo, valor, false),
    [agendar],
  );
  const setFieldNow = useCallback(
    (campo: DraftField, valor: string | null) => agendar(campo, valor, true),
    [agendar],
  );

  // Saída da tela. O navegador não garante que uma requisição iniciada em
  // `pagehide` chegue, mas tentar e talvez perder é estritamente melhor que
  // descartar de propósito o que estava esperando o debounce.
  useEffect(() => {
    if (!enabled) return;

    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', flush);

    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', flush);
      // Desmontar a tela também é sair dela: navegar para outro RDO não pode
      // jogar fora o que estava esperando o debounce.
      flush();
    };
  }, [enabled, flush]);

  return { values, setField, setFieldNow, state, savedAt, error, flush };
}

/// O que mudou entre o rascunho e o que o servidor confirmou.
function diferenca(rascunho: DraftValues, confirmado: DraftValues): DraftValues {
  const diff: DraftValues = {};
  for (const [campo, valor] of Object.entries(rascunho) as [DraftField, string | null][]) {
    if (!Object.is(valor, confirmado[campo])) diff[campo] = valor;
  }
  return diff;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error && erro.message
    ? erro.message
    : 'Não foi possível salvar. Tente novamente.';
}
