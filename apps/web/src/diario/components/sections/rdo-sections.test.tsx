import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../../api';
import { DiarioRdoPage } from '../../pages/rdo-page';
import type { DiarioReportDetail, DiarioSiteSummary } from '../../types';

vi.mock('../../api');

// `deep: true`: os grupos de rotas (`laborApi`, `activityApi`…) são objetos
// aninhados, e sem isso o TypeScript enxerga as funções originais em vez dos
// dublês — o teste roda, mas não compila.
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
    workSchedule: { startTime: null, breakStartTime: null, breakEndTime: null, endTime: null },
    scheduleNotes: null,
    morningWeather: null,
    afternoonWeather: null,
    weatherNotes: null,
    labor: [],
    equipment: [],
    activities: [],
    occurrences: [],
    materials: [],
    photos: [],
    videos: [],
    summary: {
      labor: { roles: 0, workers: 0 },
      equipment: { items: 0, units: 0 },
      activities: 0,
      occurrences: 0,
      materials: 0,
      photos: 0,
      videos: 0,
      hasSchedule: false,
      hasWeather: false,
      hasNotes: false,
    },
    ...over,
  };
}

async function abrirRdo(detalhe: DiarioReportDetail = relatorio()) {
  mocked.getReport.mockResolvedValue(detalhe);
  renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });
  await screen.findByRole('heading', { name: 'RDO #24' });
}

/// Garante a seção aberta.
///
/// As listas nascem fechadas (a lista inteira precisa caber numa tela de
/// 375px), mas horário e clima abrem sozinhos quando ainda estão vazios — são
/// as duas que se preenchem em segundos e não valem um toque a mais. Por isso
/// o teste consulta `aria-expanded` em vez de clicar sempre: um clique cego
/// FECHARIA justamente as que já estavam abertas.
async function abrirSecao(usuario: ReturnType<typeof userEvent.setup>, titulo: string) {
  const cabecalho = screen.getByRole('button', { name: new RegExp(titulo, 'i') });
  if (cabecalho.getAttribute('aria-expanded') === 'false') {
    await usuario.click(cabecalho);
  }
}

// ---------------------------------------------------------------------------
// Horário e clima — salvam pelo PATCH do relatório
// ---------------------------------------------------------------------------

describe('Horário de trabalho', () => {
  it('salva o horário escolhido pelo mesmo PATCH das observações', async () => {
    const usuario = userEvent.setup();
    mocked.updateReport.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Horário de trabalho');
    await usuario.type(screen.getByLabelText('Início'), '07:00');

    await waitFor(() =>
      expect(mocked.updateReport).toHaveBeenCalledWith('rdo-24', { workStartTime: '07:00' }),
    );
  });

  it('mostra o horário já gravado nos campos', async () => {
    const usuario = userEvent.setup();
    await abrirRdo(
      relatorio({
        workSchedule: {
          startTime: '07:00',
          breakStartTime: '12:00',
          breakEndTime: '13:00',
          endTime: '17:00',
        },
        summary: { ...relatorio().summary, hasSchedule: true },
      }),
    );

    await abrirSecao(usuario, 'Horário de trabalho');
    expect(screen.getByLabelText('Término')).toHaveProperty('value', '17:00');
  });
});

describe('Condições climáticas', () => {
  it('registra o clima da manhã com um toque', async () => {
    const usuario = userEvent.setup();
    mocked.updateReport.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Condições climáticas');
    await usuario.click(screen.getByRole('button', { name: 'Manhã: Ensolarado' }));

    expect(mocked.updateReport).toHaveBeenCalledWith('rdo-24', { morningWeather: 'SUNNY' });
  });

  it('registra o clima da tarde de forma independente', async () => {
    const usuario = userEvent.setup();
    mocked.updateReport.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Condições climáticas');
    await usuario.click(screen.getByRole('button', { name: 'Tarde: Chuva' }));

    expect(mocked.updateReport).toHaveBeenCalledWith('rdo-24', { afternoonWeather: 'RAIN' });
  });

  it('tocar de novo na opção escolhida limpa o campo', async () => {
    // Sem isso, um toque errado no clima não teria como ser desfeito.
    const usuario = userEvent.setup();
    mocked.updateReport.mockResolvedValue(relatorio());
    await abrirRdo(relatorio({ morningWeather: 'SUNNY' }));

    await abrirSecao(usuario, 'Condições climáticas');
    await usuario.click(screen.getByRole('button', { name: 'Manhã: Ensolarado' }));

    expect(mocked.updateReport).toHaveBeenCalledWith('rdo-24', { morningWeather: null });
  });
});

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

describe('Mão de obra', () => {
  it('adiciona uma função pelo painel inferior', async () => {
    const usuario = userEvent.setup();
    mocked.laborApi.add.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Mão de obra');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar função' }));

    await usuario.type(screen.getByLabelText('Função'), 'Pedreiro');
    await usuario.clear(screen.getByLabelText('Quantidade'));
    await usuario.type(screen.getByLabelText('Quantidade'), '8');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mocked.laborApi.add).toHaveBeenCalledWith('rdo-24', {
        role: 'Pedreiro',
        quantity: 8,
      }),
    );
  });

  it('mostra o total calculado, e ele não é editável', async () => {
    const usuario = userEvent.setup();
    await abrirRdo(
      relatorio({
        labor: [
          { id: 'l1', role: 'Pedreiro', quantity: 8 },
          { id: 'l2', role: 'Servente', quantity: 6 },
        ],
        summary: { ...relatorio().summary, labor: { roles: 2, workers: 14 } },
      }),
    );

    await abrirSecao(usuario, 'Mão de obra');

    expect(screen.getByText('14 profissionais')).toBeDefined();
    // Nenhum campo de total: ele é derivado, não digitado.
    expect(screen.queryByLabelText(/total/i)).toBeNull();
  });

  it('exclui uma função, mas só depois de confirmar', async () => {
    const usuario = userEvent.setup();
    mocked.laborApi.remove.mockResolvedValue(relatorio());
    await abrirRdo(
      relatorio({
        labor: [{ id: 'l1', role: 'Pedreiro', quantity: 8 }],
        summary: { ...relatorio().summary, labor: { roles: 1, workers: 8 } },
      }),
    );

    await abrirSecao(usuario, 'Mão de obra');
    await usuario.click(screen.getByRole('button', { name: 'Excluir Pedreiro' }));

    // O toque no ícone abre a confirmação e NÃO exclui: um alvo de 44px ao
    // lado do de editar, numa tela usada de pé, é tocado por engano — e item
    // de RDO não tem soft delete para desfazer.
    expect(mocked.laborApi.remove).not.toHaveBeenCalled();
    expect(await screen.findByText('Excluir este item?')).toBeDefined();

    await usuario.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mocked.laborApi.remove).toHaveBeenCalledWith('rdo-24', 'l1'));
  });

  it('cancelar a confirmação não exclui nada', async () => {
    const usuario = userEvent.setup();
    await abrirRdo(
      relatorio({
        labor: [{ id: 'l1', role: 'Pedreiro', quantity: 8 }],
        summary: { ...relatorio().summary, labor: { roles: 1, workers: 8 } },
      }),
    );

    await abrirSecao(usuario, 'Mão de obra');
    await usuario.click(screen.getByRole('button', { name: 'Excluir Pedreiro' }));
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(mocked.laborApi.remove).not.toHaveBeenCalled();
  });

  it('mostra o estado vazio antes do primeiro registro', async () => {
    const usuario = userEvent.setup();
    await abrirRdo();

    await abrirSecao(usuario, 'Mão de obra');
    expect(screen.getByText('Nenhuma função registrada.')).toBeDefined();
  });
});

describe('Equipamentos', () => {
  it('adiciona um equipamento com situação', async () => {
    const usuario = userEvent.setup();
    mocked.equipmentApi.add.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Equipamentos');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar equipamento' }));

    await usuario.type(screen.getByLabelText('Equipamento'), 'Betoneira');
    await usuario.type(screen.getByLabelText('Situação'), 'Em manutenção');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() =>
      expect(mocked.equipmentApi.add).toHaveBeenCalledWith('rdo-24', {
        name: 'Betoneira',
        quantity: 1,
        notes: 'Em manutenção',
      }),
    );
  });
});

describe('Atividades', () => {
  it('adiciona uma atividade com local e observação', async () => {
    const usuario = userEvent.setup();
    mocked.activityApi.add.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Atividades executadas');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar atividade' }));

    await usuario.type(screen.getByLabelText('Descrição da atividade'), 'Alvenaria');
    await usuario.type(screen.getByLabelText('Local'), 'Pavimento 03');
    await usuario.click(screen.getByRole('button', { name: 'Adicionar atividade' }));

    await waitFor(() =>
      expect(mocked.activityApi.add).toHaveBeenCalledWith('rdo-24', {
        description: 'Alvenaria',
        location: 'Pavimento 03',
      }),
    );
  });

  it('edita uma atividade existente pelo mesmo painel', async () => {
    const usuario = userEvent.setup();
    mocked.activityApi.update.mockResolvedValue(relatorio());
    await abrirRdo(
      relatorio({
        activities: [
          {
            id: 'a1',
            description: 'Alvenaria',
            location: 'Pavimento 03',
            notes: null,
            position: 1,
          },
        ],
        summary: { ...relatorio().summary, activities: 1 },
      }),
    );

    await abrirSecao(usuario, 'Atividades executadas');
    await usuario.click(screen.getByRole('button', { name: 'Editar Alvenaria' }));

    const campo = screen.getByLabelText('Descrição da atividade');
    expect(campo).toHaveProperty('value', 'Alvenaria');
    await usuario.type(campo, ' e chapisco');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocked.activityApi.update).toHaveBeenCalledWith('rdo-24', 'a1', {
        description: 'Alvenaria e chapisco',
        location: 'Pavimento 03',
      }),
    );
  });
});

describe('Ocorrências', () => {
  it('registra uma ocorrência com tipo e horário', async () => {
    const usuario = userEvent.setup();
    mocked.occurrenceApi.add.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Ocorrências');
    await usuario.click(screen.getByRole('button', { name: 'Registrar ocorrência' }));

    await usuario.click(screen.getByRole('radio', { name: 'Clima' }));
    await usuario.type(screen.getByLabelText('Descrição'), 'Chuva forte');
    await usuario.type(screen.getByLabelText(/Horário/), '14:30');
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(mocked.occurrenceApi.add).toHaveBeenCalledWith('rdo-24', {
        type: 'WEATHER',
        description: 'Chuva forte',
        occurredAtTime: '14:30',
      }),
    );
  });

  it('permite registrar SEM horário', async () => {
    const usuario = userEvent.setup();
    mocked.occurrenceApi.add.mockResolvedValue(relatorio());
    await abrirRdo();

    await abrirSecao(usuario, 'Ocorrências');
    await usuario.click(screen.getByRole('button', { name: 'Registrar ocorrência' }));
    await usuario.type(screen.getByLabelText('Descrição'), 'Chuva durante a tarde');
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(mocked.occurrenceApi.add).toHaveBeenCalledWith('rdo-24', {
        type: 'OTHER',
        description: 'Chuva durante a tarde',
        occurredAtTime: null,
      }),
    );
  });

  it('mostra o erro do backend dentro do painel, sem fechá-lo', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.occurrenceApi.add.mockRejectedValue(new ApiError(400, 'Descreva a ocorrência.'));
    await abrirRdo();

    await abrirSecao(usuario, 'Ocorrências');
    await usuario.click(screen.getByRole('button', { name: 'Registrar ocorrência' }));
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Descreva a ocorrência.',
    );
    // O painel continua aberto com o que foi digitado — fechar apagaria o
    // trabalho da pessoa por causa de um erro que ela pode corrigir.
    expect(screen.getByLabelText('Descrição')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Relatório fechado
// ---------------------------------------------------------------------------

describe('Relatório finalizado', () => {
  it('não oferece adicionar nem editar em nenhuma seção', async () => {
    const usuario = userEvent.setup();
    await abrirRdo(
      relatorio({
        status: 'SUBMITTED',
        statusLabel: 'Finalizado',
        editable: false,
        labor: [{ id: 'l1', role: 'Pedreiro', quantity: 8 }],
        summary: { ...relatorio().summary, labor: { roles: 1, workers: 8 } },
      }),
    );

    await abrirSecao(usuario, 'Mão de obra');

    expect(screen.queryByRole('button', { name: 'Adicionar função' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir Pedreiro' })).toBeNull();
    // A informação continua legível — o que some é a ação.
    const secao = screen.getByText('Pedreiro').closest('li')!;
    expect(within(secao).getByText('8')).toBeDefined();
  });
});
