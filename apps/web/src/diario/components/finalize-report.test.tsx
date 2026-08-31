import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../api';
import { DiarioRdoPage } from '../pages/rdo-page';
import type { DiarioReportDetail, DiarioSiteSummary } from '../types';

vi.mock('../api');
vi.mock('../lib/image-compression', () => ({
  compressImage: vi.fn(async (file: File) => ({ file, width: 1920, height: 1080 })),
  readVideoDuration: vi.fn(async () => 42),
}));

const mocked = vi.mocked(api, { deep: true });

const AURORA: DiarioSiteSummary = {
  id: 'obra-1',
  code: 'OBR-001',
  name: 'Residencial Aurora',
  clientName: 'Construtora XYZ',
  responsibleName: 'Marina Souza',
  status: 'IN_PROGRESS',
  addressLine: 'Rua das Obras, 100',
  city: 'Curitiba',
  state: 'PR',
  startDate: '2026-01-01T00:00:00.000Z',
  expectedEndDate: '2026-12-31T00:00:00.000Z',
};

function relatorio(over: Partial<DiarioReportDetail> = {}): DiarioReportDetail {
  return {
    id: 'rdo-24',
    number: 24,
    reportDate: '2026-08-30T00:00:00.000Z',
    status: 'DRAFT',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Eduardo Engenharia' },
    weekday: 'Domingo',
    statusLabel: 'Rascunho',
    editable: true,
    notes: null,
    constructionSite: AURORA,
    copiedFrom: null,
    submittedAt: null,
    submittedBy: null,
    schedule: {
      startDate: AURORA.startDate,
      expectedEndDate: AURORA.expectedEndDate,
      totalDays: 364,
      elapsedDays: 241,
      remainingDays: 123,
    },
    workSchedule: {
      startTime: '07:00',
      breakStartTime: null,
      breakEndTime: null,
      endTime: '17:00',
    },
    scheduleNotes: null,
    morningWeather: null,
    afternoonWeather: null,
    weatherNotes: null,
    labor: [],
    equipment: [],
    activities: [{ id: 'a1', description: 'Alvenaria', location: null, notes: null, position: 1 }],
    occurrences: [],
    materials: [],
    photos: [],
    videos: [],
    summary: {
      labor: { roles: 0, workers: 0 },
      equipment: { items: 0, units: 0 },
      activities: 1,
      occurrences: 0,
      materials: 0,
      photos: 0,
      videos: 0,
      hasSchedule: true,
      hasWeather: false,
      hasNotes: false,
    },
    ...over,
  };
}

const FINALIZADO = relatorio({
  status: 'SUBMITTED',
  statusLabel: 'Finalizado',
  editable: false,
  submittedAt: '2026-08-30T20:42:00.000Z',
  submittedBy: { id: 'user-1', name: 'Eduardo Engenharia' },
});

async function abrir(detalhe: DiarioReportDetail = relatorio()) {
  mocked.getReport.mockResolvedValue(detalhe);
  renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });
  await screen.findByRole('heading', { name: 'RDO #24' });
}

// ---------------------------------------------------------------------------

describe('RDO em rascunho', () => {
  it('mostra o badge Rascunho e o botão de finalizar', async () => {
    await abrir();

    expect(screen.getByText('Rascunho')).toBeDefined();
    expect(screen.getByRole('button', { name: /Finalizar RDO/ })).toBeDefined();
  });

  it('avisa que a finalização é definitiva antes de qualquer toque', async () => {
    await abrir();

    expect(
      screen.getByText('Depois de finalizado, o relatório não poderá mais ser alterado.'),
    ).toBeDefined();
  });
});

describe('Finalizar — confirmação', () => {
  it('pede confirmação antes de finalizar', async () => {
    const usuario = userEvent.setup();
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));

    expect(await screen.findByText('Finalizar relatório?')).toBeDefined();
    expect(
      screen.getByText('Depois de finalizado, este relatório não poderá mais ser alterado.'),
    ).toBeDefined();
    expect(mocked.submitReport).not.toHaveBeenCalled();
  });

  it('cancelar não finaliza', async () => {
    const usuario = userEvent.setup();
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(mocked.submitReport).not.toHaveBeenCalled();
  });

  it('confirmar chama o endpoint de domínio, não um PATCH de status', async () => {
    const usuario = userEvent.setup();
    mocked.submitReport.mockResolvedValue(FINALIZADO);
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Finalizar relatório' }));

    await waitFor(() => expect(mocked.submitReport).toHaveBeenCalledWith('rdo-24'));
    expect(mocked.updateReport).not.toHaveBeenCalled();
  });

  it('mostra "Finalizando..." enquanto a chamada está no ar', async () => {
    const usuario = userEvent.setup();
    let concluir!: (r: DiarioReportDetail) => void;
    mocked.submitReport.mockImplementation(() => new Promise((resolve) => (concluir = resolve)));
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Finalizar relatório' }));

    expect(await screen.findByText('Finalizando...')).toBeDefined();
    concluir(FINALIZADO);
  });
});

describe('Finalizar — sucesso', () => {
  it('a tela vira somente leitura sem recarregar nada', async () => {
    const usuario = userEvent.setup();
    mocked.submitReport.mockResolvedValue(FINALIZADO);
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Finalizar relatório' }));

    // A resposta traz o relatório fechado; o cache é atualizado direto.
    expect(await screen.findByText('Relatório finalizado')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Finalizar RDO/ })).toBeNull();
    expect(mocked.getReport).toHaveBeenCalledTimes(1);
  });
});

describe('Finalizar — erro', () => {
  it('mostra as pendências que o backend devolveu, e o botão continua lá', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.submitReport.mockRejectedValue(
      new ApiError(400, 'Para finalizar o relatório, registre pelo menos uma atividade executada.'),
    );
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Finalizar relatório' }));

    expect(
      await screen.findByText(
        'Para finalizar o relatório, registre pelo menos uma atividade executada.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Finalizar RDO/ })).toBeDefined();
  });

  it('conflito de finalização simultânea aparece como mensagem, não como tela quebrada', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.submitReport.mockRejectedValue(
      new ApiError(409, 'Este relatório já foi finalizado por alguém.'),
    );
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Finalizar RDO/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Finalizar relatório' }));

    expect(await screen.findByText('Este relatório já foi finalizado por alguém.')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------

describe('RDO finalizado — somente leitura', () => {
  it('mostra o badge Finalizado, com quando e por quem', async () => {
    await abrir(FINALIZADO);

    expect(screen.getByText('Finalizado')).toBeDefined();
    expect(screen.getByText(/por Eduardo Engenharia/)).toBeDefined();
  });

  it('não oferece nenhum CTA de escrita em nenhuma seção', async () => {
    const usuario = userEvent.setup();
    await abrir(FINALIZADO);

    for (const secao of [
      'Mão de obra',
      'Equipamentos',
      'Atividades executadas',
      'Ocorrências',
      'Materiais',
      'Fotos',
    ]) {
      const cabecalho = screen.getByRole('button', { name: new RegExp(`^${secao}`, 'i') });
      if (cabecalho.getAttribute('aria-expanded') === 'false') {
        await usuario.click(cabecalho);
      }
    }

    for (const rotulo of [
      'Adicionar função',
      'Adicionar equipamento',
      'Adicionar atividade',
      'Registrar ocorrência',
      'Adicionar material',
      'Tirar foto',
    ]) {
      expect(screen.queryByRole('button', { name: rotulo })).toBeNull();
    }
  });

  it('os campos de texto e horário ficam bloqueados', async () => {
    const usuario = userEvent.setup();
    await abrir(FINALIZADO);

    expect(screen.getByLabelText('Observações do relatório')).toHaveProperty('readOnly', true);

    const horario = screen.getByRole('button', { name: /^Horário de trabalho/i });
    if (horario.getAttribute('aria-expanded') === 'false') await usuario.click(horario);
    expect(screen.getByLabelText('Início')).toHaveProperty('disabled', true);
  });

  it('o autosave não dispara — a tela sabe que está fechada', async () => {
    // Não é "faz o PATCH e recebe erro": `useAutosave` é desligado por
    // `enabled`, então nem o temporizador é armado.
    const usuario = userEvent.setup();
    await abrir(FINALIZADO);

    const campo = screen.getByLabelText('Observações do relatório');
    await usuario.click(campo);
    await usuario.keyboard('tentativa de edição');

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(mocked.updateReport).not.toHaveBeenCalled();
  });

  it('não mostra indicador de salvamento', async () => {
    await abrir(FINALIZADO);

    expect(screen.queryByText(/^Salvo/)).toBeNull();
    expect(screen.queryByText('Salvando…')).toBeNull();
  });
});
