import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../../api';
import { DiarioRdoPage } from '../../pages/rdo-page';
import type { DiarioReportDetail, DiarioSiteSummary, MaterialItem } from '../../types';

vi.mock('../../api');

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

/// Quantidades como o Decimal do Prisma as serializa: STRING, com as casas da
/// coluna. `"50.000"` é cinquenta, não cinquenta mil — e é justamente isso que
/// a formatação da tela precisa acertar.
const CIMENTO: MaterialItem = {
  id: 'm1',
  name: 'Cimento CP-II',
  quantity: '50.000',
  unit: 'SC',
  movementType: 'RECEIVED',
  notes: null,
};

const CONCRETO: MaterialItem = {
  id: 'm2',
  name: 'Concreto usinado',
  quantity: '2.500',
  unit: 'M3',
  movementType: 'USED',
  notes: 'Laje do pavimento 03',
};

const BLOCO: MaterialItem = {
  id: 'm3',
  name: 'Bloco cerâmico',
  quantity: '1200.000',
  unit: 'UN',
  movementType: 'RECEIVED',
  notes: null,
};

function relatorio(materiais: MaterialItem[] = [], over: Partial<DiarioReportDetail> = {}) {
  const base: DiarioReportDetail = {
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
    workSchedule: { startTime: null, breakStartTime: null, breakEndTime: null, endTime: null },
    scheduleNotes: null,
    morningWeather: null,
    afternoonWeather: null,
    weatherNotes: null,
    labor: [],
    equipment: [],
    activities: [],
    occurrences: [],
    materials: materiais,
    photos: [],
    videos: [],
    summary: {
      labor: { roles: 0, workers: 0 },
      equipment: { items: 0, units: 0 },
      activities: 0,
      occurrences: 0,
      materials: materiais.length,
      photos: 0,
      videos: 0,
      hasSchedule: false,
      hasWeather: false,
      hasNotes: false,
    },
  };

  return { ...base, ...over };
}

async function abrirMateriais(
  usuario: ReturnType<typeof userEvent.setup>,
  detalhe: DiarioReportDetail = relatorio(),
) {
  mocked.getReport.mockResolvedValue(detalhe);
  renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });
  await screen.findByRole('heading', { name: 'RDO #24' });

  const cabecalho = screen.getByRole('button', { name: /Materiais/i });
  if (cabecalho.getAttribute('aria-expanded') === 'false') {
    await usuario.click(cabecalho);
  }
}

async function preencher(
  usuario: ReturnType<typeof userEvent.setup>,
  campos: { material?: string; quantidade?: string; unidade?: string; movimentacao?: string },
) {
  if (campos.material) await usuario.type(screen.getByLabelText('Material'), campos.material);
  if (campos.quantidade) {
    await usuario.clear(screen.getByLabelText('Quantidade'));
    await usuario.type(screen.getByLabelText('Quantidade'), campos.quantidade);
  }
  if (campos.unidade) {
    await usuario.selectOptions(screen.getByLabelText('Unidade'), campos.unidade);
  }
  if (campos.movimentacao) {
    await usuario.click(screen.getByRole('radio', { name: campos.movimentacao }));
  }
}

// ---------------------------------------------------------------------------

describe('Materiais — estado vazio', () => {
  it('explica o vazio e oferece o primeiro registro', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario);

    expect(screen.getByText('Nenhum material registrado neste dia.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Adicionar material' })).toBeDefined();
  });

  it('não mostra resumo enquanto não há registro', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario);

    expect(screen.queryByText(/movimenta(ção|ções)/)).toBeNull();
  });
});

describe('Materiais — adicionar', () => {
  it('registra material, quantidade, unidade e movimentação', async () => {
    const usuario = userEvent.setup();
    mocked.materialApi.add.mockResolvedValue(relatorio([CIMENTO]));
    await abrirMateriais(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));
    await preencher(usuario, {
      material: 'Cimento CP-II',
      quantidade: '50',
      unidade: 'SC',
      movimentacao: 'Recebido',
    });
    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));

    await waitFor(() =>
      expect(mocked.materialApi.add).toHaveBeenCalledWith('rdo-24', {
        name: 'Cimento CP-II',
        quantity: 50,
        unit: 'SC',
        movementType: 'RECEIVED',
      }),
    );
  });

  it('aceita quantidade decimal', async () => {
    const usuario = userEvent.setup();
    mocked.materialApi.add.mockResolvedValue(relatorio([CONCRETO]));
    await abrirMateriais(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));
    await preencher(usuario, {
      material: 'Concreto usinado',
      quantidade: '2.5',
      unidade: 'M3',
      movimentacao: 'Utilizado',
    });
    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));

    await waitFor(() =>
      expect(mocked.materialApi.add).toHaveBeenCalledWith(
        'rdo-24',
        expect.objectContaining({ quantity: 2.5, unit: 'M3', movementType: 'USED' }),
      ),
    );
  });

  it('recusa nome em branco antes de ir à rede', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));
    await preencher(usuario, { quantidade: '10' });
    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Informe o material.');
    expect(mocked.materialApi.add).not.toHaveBeenCalled();
  });

  it('recusa quantidade zero antes de ir à rede', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));
    await preencher(usuario, { material: 'Cimento', quantidade: '0' });
    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'A quantidade deve ser maior que zero.',
    );
    expect(mocked.materialApi.add).not.toHaveBeenCalled();
  });

  it('mostra o erro do backend sem fechar o painel', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.materialApi.add.mockRejectedValue(new ApiError(400, 'Unidade inválida.'));
    await abrirMateriais(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));
    await preencher(usuario, { material: 'Cimento', quantidade: '10' });
    await usuario.click(screen.getByRole('button', { name: 'Adicionar material' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Unidade inválida.');
    // O que foi digitado continua lá — fechar o painel apagaria o trabalho por
    // causa de um erro que a pessoa pode corrigir.
    expect(screen.getByLabelText('Material')).toHaveProperty('value', 'Cimento');
  });
});

describe('Materiais — lista preenchida', () => {
  it('formata a quantidade de forma legível, com a unidade por extenso', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario, relatorio([CIMENTO, CONCRETO, BLOCO]));

    // `"50.000"` guardado é cinquenta, não cinquenta mil.
    expect(screen.getByText('50 sacos')).toBeDefined();
    // Decimal com vírgula, milhar com ponto — pt-BR.
    expect(screen.getByText('2,5 m³')).toBeDefined();
    expect(screen.getByText('1.200 un')).toBeDefined();
  });

  it('mostra a movimentação de cada registro', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario, relatorio([CIMENTO, CONCRETO]));

    expect(screen.getByText('Recebido')).toBeDefined();
    expect(screen.getByText('Utilizado')).toBeDefined();
  });

  it('resume a seção pela contagem de movimentações — não por saldo', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario, relatorio([CIMENTO, CONCRETO, BLOCO]));

    expect(screen.getByText('3 movimentações')).toBeDefined();
    expect(screen.queryByText(/saldo/i)).toBeNull();
  });

  it('usa o singular com um registro só', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(usuario, relatorio([CIMENTO]));

    expect(screen.getByText('1 movimentação')).toBeDefined();
  });
});

describe('Materiais — editar e excluir', () => {
  it('abre o mesmo formulário preenchido ao editar', async () => {
    const usuario = userEvent.setup();
    mocked.materialApi.update.mockResolvedValue(relatorio([CIMENTO]));
    await abrirMateriais(usuario, relatorio([CIMENTO]));

    await usuario.click(screen.getByRole('button', { name: 'Editar Cimento CP-II' }));

    expect(screen.getByLabelText('Material')).toHaveProperty('value', 'Cimento CP-II');
    // "50", e não "50.000": o campo mostra o número, não a serialização.
    expect(screen.getByLabelText('Quantidade')).toHaveProperty('value', '50');
    expect(screen.getByLabelText('Unidade')).toHaveProperty('value', 'SC');

    await usuario.clear(screen.getByLabelText('Quantidade'));
    await usuario.type(screen.getByLabelText('Quantidade'), '75');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocked.materialApi.update).toHaveBeenCalledWith(
        'rdo-24',
        'm1',
        expect.objectContaining({ quantity: 75 }),
      ),
    );
  });

  it('exclui só depois de confirmar', async () => {
    const usuario = userEvent.setup();
    mocked.materialApi.remove.mockResolvedValue(relatorio());
    await abrirMateriais(usuario, relatorio([CIMENTO]));

    await usuario.click(screen.getByRole('button', { name: 'Excluir Cimento CP-II' }));
    expect(mocked.materialApi.remove).not.toHaveBeenCalled();

    await usuario.click(await screen.findByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mocked.materialApi.remove).toHaveBeenCalledWith('rdo-24', 'm1'));
  });
});

describe('Materiais — relatório fechado', () => {
  it('mostra os registros mas não oferece nenhuma ação', async () => {
    const usuario = userEvent.setup();
    await abrirMateriais(
      usuario,
      relatorio([CIMENTO], { status: 'SUBMITTED', statusLabel: 'Finalizado', editable: false }),
    );

    expect(screen.getByText('Cimento CP-II')).toBeDefined();
    expect(screen.getByText('50 sacos')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Adicionar material' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir Cimento CP-II' })).toBeNull();
  });
});
