import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';
import { ApiError } from '@/lib/api-client';

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

async function abrir(detalhe: DiarioReportDetail = relatorio()) {
  mocked.getReport.mockResolvedValue(detalhe);
  renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });
  await screen.findByRole('heading', { name: 'RDO #24' });
}

// ---------------------------------------------------------------------------

describe('Excluir rascunho', () => {
  it('oferece a exclusão no rascunho', async () => {
    await abrir();

    expect(screen.getByRole('button', { name: /Excluir rascunho/ })).toBeDefined();
  });

  it('NÃO oferece a exclusão num relatório finalizado', async () => {
    await abrir(
      relatorio({
        status: 'SUBMITTED',
        statusLabel: 'Finalizado',
        editable: false,
        submittedAt: '2026-08-30T20:42:00.000Z',
        submittedBy: { id: 'user-1', name: 'Eduardo Engenharia' },
      }),
    );

    // Um botão que o backend sempre recusaria é pior que botão nenhum: ele
    // sugere que existe um caminho para desfazer o documento do dia.
    expect(screen.queryByRole('button', { name: /Excluir rascunho/ })).toBeNull();
  });

  it('não exclui sem confirmação, e a confirmação diz o que se perde', async () => {
    const usuario = userEvent.setup();
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Excluir rascunho/ }));

    expect(await screen.findByText('Excluir o RDO 24?')).toBeDefined();
    expect(screen.getByText(/fotos e vídeos/)).toBeDefined();
    expect(screen.getByText(/Não há como desfazer/)).toBeDefined();
    // Nada foi chamado só por abrir o diálogo.
    expect(mocked.deleteReport).not.toHaveBeenCalled();
  });

  it('desistir da confirmação não exclui nada', async () => {
    const usuario = userEvent.setup();
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Excluir rascunho/ }));
    await screen.findByText('Excluir o RDO 24?');
    await usuario.click(screen.getByRole('button', { name: /Cancelar/i }));

    expect(mocked.deleteReport).not.toHaveBeenCalled();
  });

  it('confirmando, exclui e sai da tela do relatório', async () => {
    const usuario = userEvent.setup();
    mocked.deleteReport.mockResolvedValue(undefined);
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Excluir rascunho/ }));
    await usuario.click(await screen.findByRole('button', { name: /Excluir definitivamente/ }));

    await waitFor(() => expect(mocked.deleteReport).toHaveBeenCalledWith('rdo-24'));
    // Sair da tela é parte da operação: ficar num relatório que não existe
    // mais faria a próxima leitura responder 404 e parecer falha.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'RDO #24' })).toBeNull(),
    );
  });

  it('mostra o motivo vindo do servidor quando a exclusão é recusada', async () => {
    const usuario = userEvent.setup();
    mocked.deleteReport.mockRejectedValue(
      new ApiError(409, 'Este relatório já foi finalizado e não pode mais ser excluído.'),
    );
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Excluir rascunho/ }));
    await usuario.click(await screen.findByRole('button', { name: /Excluir definitivamente/ }));

    // A frase do backend, e não um "erro ao excluir" genérico: é ela que
    // explica que alguém finalizou o relatório enquanto esta tela estava
    // aberta.
    expect(
      await screen.findByText('Este relatório já foi finalizado e não pode mais ser excluído.'),
    ).toBeDefined();
  });
});
