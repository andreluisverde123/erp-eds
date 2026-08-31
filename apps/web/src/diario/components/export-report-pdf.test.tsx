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
    workSchedule: { startTime: '07:00', breakStartTime: null, breakEndTime: null, endTime: '17:00' },
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

describe('Exportar PDF', () => {
  it('oferece a exportação no rascunho', async () => {
    await abrir();

    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeDefined();
  });

  it('oferece a exportação também no relatório finalizado', async () => {
    await abrir(
      relatorio({ status: 'SUBMITTED', statusLabel: 'Finalizado', editable: false }),
    );

    // Exportar é leitura: fechar o documento não pode impedir levá-lo para uma
    // reunião.
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeDefined();
  });

  it('dispara o download do relatório aberto', async () => {
    const usuario = userEvent.setup();
    mocked.exportReportPdf.mockResolvedValue(undefined);
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    await waitFor(() =>
      expect(mocked.exportReportPdf).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rdo-24', number: 24 }),
      ),
    );
  });

  it('mostra o estado de espera e desabilita só o botão', async () => {
    const usuario = userEvent.setup();
    let liberar!: () => void;
    mocked.exportReportPdf.mockReturnValue(
      new Promise<void>((resolve) => {
        liberar = resolve;
      }),
    );
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    const botao = await screen.findByRole('button', { name: /Exportando/ });
    expect(botao.hasAttribute('disabled')).toBe(true);
    // O resto do relatório continua acessível: uma espera de segundos com a
    // tela travada parece defeito.
    expect(screen.getByRole('heading', { name: 'RDO #24' })).toBeDefined();

    liberar();
    await waitFor(() => expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeDefined());
  });

  it('mostra o motivo do servidor quando a geração falha', async () => {
    const usuario = userEvent.setup();
    mocked.exportReportPdf.mockRejectedValue(
      new ApiError(503, 'O armazenamento de mídia está indisponível.'),
    );
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    expect(await screen.findByText('O armazenamento de mídia está indisponível.')).toBeDefined();
  });

  it('usa mensagem genérica quando a falha não vem da API', async () => {
    const usuario = userEvent.setup();
    mocked.exportReportPdf.mockRejectedValue(new Error('rede caiu'));
    await abrir();

    await usuario.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    expect(await screen.findByText(/Não foi possível gerar o PDF/)).toBeDefined();
  });
});
