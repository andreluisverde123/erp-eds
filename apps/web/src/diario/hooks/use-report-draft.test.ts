import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReportDraft, type DraftValues } from './use-report-draft';

const DELAY = 1200;

const INICIAL: DraftValues = { notes: '', scheduleNotes: '', workStartTime: null };

/// Deixa a fila de microtarefas correr enquanto os temporizadores estão sob
/// controle do teste. Sem isto, um `await` dentro do hook ficaria pendente e o
/// estado nunca chegaria a "saved".
async function drenar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function avancar(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await drenar();
}

function montar(onSave = vi.fn().mockResolvedValue(undefined), enabled = true) {
  const hook = renderHook(() => useReportDraft({ initial: INICIAL, onSave, enabled }));
  return { ...hook, onSave };
}

describe('useReportDraft — o básico', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('não salva na abertura da tela', async () => {
    const { onSave } = montar();

    await avancar(DELAY * 3);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('agrupa a digitação numa gravação só', async () => {
    const { result, onSave } = montar();

    act(() => result.current.setField('notes', 'a'));
    await avancar(200);
    act(() => result.current.setField('notes', 'ab'));
    await avancar(200);
    act(() => result.current.setField('notes', 'abc'));
    await avancar(DELAY);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ notes: 'abc' });
  });

  it('anuncia "salvando" e depois "salvo"', async () => {
    const { result } = montar();

    expect(result.current.state).toBe('idle');

    act(() => result.current.setField('notes', 'chuva à tarde'));
    expect(result.current.state).toBe('pending');

    await avancar(DELAY);
    expect(result.current.state).toBe('saved');
    expect(result.current.savedAt).toBeInstanceOf(Date);
  });

  it('manda SÓ o que mudou, e não o relatório inteiro', async () => {
    const { result, onSave } = montar();

    act(() => result.current.setField('scheduleNotes', 'Começou às 8h.'));
    await avancar(DELAY);

    expect(onSave).toHaveBeenCalledWith({ scheduleNotes: 'Começou às 8h.' });
  });

  it('não salva nada quando desligado — relatório finalizado não é editável', async () => {
    const { result, onSave } = montar(vi.fn().mockResolvedValue(undefined), false);

    act(() => result.current.setField('notes', 'tentativa'));
    await avancar(DELAY * 3);

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('useReportDraft — campos escolhidos de uma vez', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('grava na hora, sem esperar o debounce', async () => {
    // Escolher "13:00" ou tocar em "Chuva" é um evento completo: esperar 1,2 s
    // ali só atrasaria o "Salvo" sem poupar requisição nenhuma.
    const { result, onSave } = montar();

    act(() => result.current.setFieldNow('morningWeather', 'SUNNY'));
    await drenar();

    expect(onSave).toHaveBeenCalledWith({ morningWeather: 'SUNNY' });
  });

  it('o valor aparece na tela antes de o servidor responder', async () => {
    let concluir!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (concluir = resolve)));
    const { result } = montar(onSave as never);

    act(() => result.current.setFieldNow('workStartTime', '07:00'));

    expect(result.current.values.workStartTime).toBe('07:00');
    await act(async () => concluir());
  });
});

describe('useReportDraft — concorrência', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('não sobrepõe requisições — o que muda durante a gravação sai depois', async () => {
    // É o cenário do enunciado: altera um campo, altera outro em seguida, o
    // primeiro request demora. Na versão ingênua os dois saem juntos e a
    // resposta que chega por último vence — que pode ser a do primeiro.
    let liberar!: () => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (liberar = resolve)))
      .mockResolvedValue(undefined);

    const { result } = montar(onSave);

    act(() => result.current.setFieldNow('morningWeather', 'SUNNY'));
    await drenar();
    expect(onSave).toHaveBeenCalledTimes(1);

    // Segundo campo enquanto o primeiro ainda não voltou.
    act(() => result.current.setFieldNow('afternoonWeather', 'RAIN'));
    await drenar();
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => liberar());
    await drenar();

    expect(onSave).toHaveBeenCalledTimes(2);
    // A segunda gravação leva SÓ o campo novo: o primeiro já foi confirmado.
    expect(onSave).toHaveBeenLastCalledWith({ afternoonWeather: 'RAIN' });
  });

  it('junta as alterações acumuladas durante uma gravação lenta', async () => {
    let liberar!: () => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (liberar = resolve)))
      .mockResolvedValue(undefined);

    const { result } = montar(onSave);

    act(() => result.current.setFieldNow('workStartTime', '07:00'));
    await drenar();

    act(() => result.current.setFieldNow('workEndTime', '17:00'));
    act(() => result.current.setField('notes', 'tudo normal'));
    await drenar();

    await act(async () => liberar());
    await drenar();

    // Uma requisição só para os dois campos pendentes, em vez de duas.
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({ workEndTime: '17:00', notes: 'tudo normal' });
  });
});

describe('useReportDraft — saída da tela', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('grava na hora quando a tela é escondida — trocar de app não perde texto', async () => {
    const { result, onSave } = montar();

    act(() => result.current.setField('notes', 'medição do dia'));
    await avancar(100);
    expect(onSave).not.toHaveBeenCalled();

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await drenar();

    expect(onSave).toHaveBeenCalledWith({ notes: 'medição do dia' });
  });

  it('grava o pendente ao desmontar — navegar para outro RDO não descarta', async () => {
    const { result, unmount, onSave } = montar();

    act(() => result.current.setField('notes', 'ocorrência registrada'));
    await avancar(100);

    await act(async () => {
      unmount();
    });
    await drenar();

    expect(onSave).toHaveBeenCalledWith({ notes: 'ocorrência registrada' });
  });
});

describe('useReportDraft — erro', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expõe o erro em vez de mentir que salvou, e o flush tenta de novo', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue(undefined);
    const { result } = montar(onSave);

    act(() => result.current.setField('notes', 'texto'));
    await avancar(DELAY);

    expect(result.current.state).toBe('error');

    await act(async () => result.current.flush());
    await drenar();

    expect(result.current.state).toBe('saved');
  });

  it('mostra a MENSAGEM do servidor — é ela que diz qual campo está errado', async () => {
    // "Não foi possível salvar" sozinho não diz nada; o backend responde "o
    // término não pode ser anterior ao início da jornada".
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error('O término não pode ser anterior ao início da jornada.'));
    const { result } = montar(onSave);

    act(() => result.current.setFieldNow('workEndTime', '05:00'));
    await drenar();

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('O término não pode ser anterior ao início da jornada.');
  });

  it('o valor recusado continua na tela para a pessoa poder corrigir', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('inválido'));
    const { result } = montar(onSave);

    act(() => result.current.setFieldNow('workEndTime', '05:00'));
    await drenar();

    expect(result.current.values.workEndTime).toBe('05:00');
  });
});
