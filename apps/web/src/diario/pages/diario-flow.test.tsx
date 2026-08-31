import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../api';
import type { DiarioReport, DiarioReportDetail, DiarioSite } from '../types';
import { DiarioHomePage } from './home-page';
import { DiarioNovoRelatorioPage } from './novo-relatorio-page';
import { DiarioRdoPage } from './rdo-page';
import { DiarioRelatoriosPage } from './relatorios-page';

vi.mock('../api');

const obra = (id: string, name: string): DiarioSite => ({
  id,
  code: `OBR-${id}`,
  name,
  clientName: 'Construtora XYZ',
  responsibleName: 'Marina Souza',
  status: 'IN_PROGRESS',
  addressLine: 'Rua das Obras, 100',
  city: 'Curitiba',
  state: 'PR',
  startDate: '2026-01-01T00:00:00.000Z',
  expectedEndDate: '2026-12-31T00:00:00.000Z',
  assignmentRole: 'ENGINEER',
  lastReportDate: null,
  reportCount: 0,
});

const AURORA = obra('1', 'Residencial Aurora');
const CENTRAL = obra('2', 'Edifício Central');

const RASCUNHO: DiarioReport = {
  id: 'rdo-24',
  number: 24,
  reportDate: '2026-08-30T00:00:00.000Z',
  status: 'DRAFT',
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z',
  constructionSite: { id: AURORA.id, code: AURORA.code, name: AURORA.name },
  createdBy: { id: 'user-1', name: 'Eduardo Engenharia' },
};

const DETALHE: DiarioReportDetail = {
  ...RASCUNHO,
  weekday: 'Domingo',
  statusLabel: 'Rascunho',
  editable: true,
  notes: 'Concretagem do 3º pavimento.',
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
    hasNotes: true,
  },
};

/// O mesmo relatório, com conteúdo. Serve aos testes de estado preenchido.
const DETALHE_PREENCHIDO: DiarioReportDetail = {
  ...DETALHE,
  workSchedule: {
    startTime: '07:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    endTime: '17:00',
  },
  morningWeather: 'SUNNY',
  afternoonWeather: 'RAIN',
  labor: [
    { id: 'l1', role: 'Pedreiro', quantity: 8 },
    { id: 'l2', role: 'Servente', quantity: 6 },
  ],
  equipment: [{ id: 'e1', name: 'Betoneira', quantity: 1, notes: 'Em manutenção' }],
  activities: [
    {
      id: 'a1',
      description: 'Alvenaria do pavimento 03',
      location: 'Pavimento 03',
      notes: null,
      position: 1,
    },
  ],
  occurrences: [
    {
      id: 'o1',
      type: 'WEATHER',
      description: 'Chuva forte',
      occurredAtMinutes: 870,
      notes: null,
    },
  ],
  materials: [],
  photos: [],
  videos: [],
  summary: {
    labor: { roles: 2, workers: 14 },
    equipment: { items: 1, units: 1 },
    activities: 1,
    occurrences: 1,
    materials: 0,
    photos: 0,
    videos: 0,
    hasSchedule: true,
    hasWeather: true,
    hasNotes: true,
  },
};

const mocked = vi.mocked(api);

function paginado(itens: DiarioReport[]) {
  return { data: itens, meta: { page: 1, limit: 50, total: itens.length, totalPages: 1 } };
}

// ---------------------------------------------------------------------------
// 19 — Home
// ---------------------------------------------------------------------------

describe('Home do Diário', () => {
  it('mostra as obras autorizadas', async () => {
    mocked.getHome.mockResolvedValue({ sites: [AURORA, CENTRAL], recentReports: [RASCUNHO] });

    renderDiario(<DiarioHomePage />);

    // "Residencial Aurora" aparece duas vezes de propósito — no cartão da obra
    // e na linha do RDO recente. O que importa é que as duas obras vinculadas
    // estejam lá.
    expect(await screen.findAllByText('Residencial Aurora')).not.toHaveLength(0);
    expect(screen.getByText('Edifício Central')).toBeDefined();
    expect(screen.getByText('RDO #24')).toBeDefined();
  });

  it('mostra esqueleto enquanto carrega', () => {
    mocked.getHome.mockReturnValue(new Promise(() => {}));

    const { container } = renderDiario(<DiarioHomePage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('explica o vazio em vez de mostrar uma tela em branco', async () => {
    mocked.getHome.mockResolvedValue({ sites: [], recentReports: [] });

    renderDiario(<DiarioHomePage />);

    expect(await screen.findByText('Nenhuma obra vinculada')).toBeDefined();
    expect(screen.getByText('Nenhum relatório ainda')).toBeDefined();
  });

  it('oferece tentar de novo quando a carga falha', async () => {
    mocked.getHome.mockRejectedValue(new Error('sem rede'));

    renderDiario(<DiarioHomePage />);

    // Mesmo rótulo em todas as telas do Diário: a Home dizia "Tentar de novo"
    // e as demais, "Tentar novamente".
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 20 — Criação
// ---------------------------------------------------------------------------

describe('Criar relatório', () => {
  it('leva o usuário da escolha da obra até o RDO criado', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA, CENTRAL]);
    mocked.createReport.mockResolvedValue(DETALHE);
    mocked.getReport.mockResolvedValue(DETALHE);

    renderDiario(<DiarioNovoRelatorioPage />, {
      rota: '/relatorios/novo',
      outrasRotas: [{ path: '/relatorios/:id', element: <DiarioRdoPage /> }],
    });

    await usuario.click(await screen.findByRole('button', { name: /Residencial Aurora/ }));

    // Etapa 2: a data já vem com hoje, e o dia da semana aparece calculado.
    const campoData = screen.getByLabelText('Data do relatório');
    await usuario.clear(campoData);
    await usuario.type(campoData, '2026-08-30');
    expect(screen.getByText('Domingo')).toBeDefined();

    await usuario.click(screen.getByRole('button', { name: 'Criar relatório' }));

    await waitFor(() =>
      expect(mocked.createReport).toHaveBeenCalledWith({
        constructionSiteId: AURORA.id,
        reportDate: '2026-08-30',
      }),
    );

    // Navegou de verdade para o relatório criado.
    expect(await screen.findByRole('heading', { name: 'RDO #24' })).toBeDefined();
  });

  it('não oferece obra a que o usuário não tem acesso — a lista é a da API', async () => {
    mocked.listSites.mockResolvedValue([AURORA]);

    renderDiario(<DiarioNovoRelatorioPage />, { rota: '/relatorios/novo' });

    expect(await screen.findByRole('button', { name: /Residencial Aurora/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Edifício Central/ })).toBeNull();
  });

  it('exige escolher a origem antes de copiar', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockResolvedValue(paginado([RASCUNHO]));

    renderDiario(<DiarioNovoRelatorioPage />, { rota: '/relatorios/novo?obra=1' });

    await usuario.click(await screen.findByRole('button', { name: /Copiar anterior/ }));

    expect(screen.getByRole('button', { name: 'Criar relatório' })).toHaveProperty(
      'disabled',
      true,
    );

    await usuario.click(await screen.findByRole('button', { name: /RDO #24/ }));
    expect(screen.getByRole('button', { name: 'Criar relatório' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('copia pelo endpoint de cópia, sem mandar a obra — ela vem da origem', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockResolvedValue(paginado([RASCUNHO]));
    mocked.copyReport.mockResolvedValue({ ...DETALHE, id: 'rdo-25', number: 25 });
    mocked.getReport.mockResolvedValue({ ...DETALHE, id: 'rdo-25', number: 25 });

    renderDiario(<DiarioNovoRelatorioPage />, {
      rota: '/relatorios/novo?obra=1',
      outrasRotas: [{ path: '/relatorios/:id', element: <DiarioRdoPage /> }],
    });

    await usuario.click(await screen.findByRole('button', { name: /Copiar anterior/ }));
    await usuario.click(await screen.findByRole('button', { name: /RDO #24/ }));
    await usuario.click(screen.getByRole('button', { name: 'Criar relatório' }));

    await waitFor(() => expect(mocked.copyReport).toHaveBeenCalledTimes(1));
    expect(mocked.copyReport.mock.calls[0]![0]).toBe('rdo-24');
    expect(mocked.copyReport.mock.calls[0]![1]).not.toHaveProperty('constructionSiteId');
    expect(mocked.createReport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 21 e 22 — Lista e continuação
// ---------------------------------------------------------------------------

describe('Lista de relatórios', () => {
  it('mostra o rascunho com o convite para continuar', async () => {
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockResolvedValue(paginado([RASCUNHO]));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios' });

    // Escopo na lista: "Rascunho" também é o rótulo de um chip de filtro, e a
    // asserção precisa ser sobre o RELATÓRIO, não sobre o filtro.
    const lista = within(await screen.findByRole('list'));
    expect(lista.getByText('RDO #24')).toBeDefined();
    expect(lista.getByText('Rascunho')).toBeDefined();
    expect(lista.getByText('Continuar')).toBeDefined();
  });

  it('continuar abre o relatório EXISTENTE, sem criar outro', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockResolvedValue(paginado([RASCUNHO]));
    mocked.getReport.mockResolvedValue(DETALHE);

    renderDiario(<DiarioRelatoriosPage />, {
      rota: '/relatorios',
      outrasRotas: [{ path: '/relatorios/:id', element: <DiarioRdoPage /> }],
    });

    await usuario.click(await screen.findByRole('link', { name: /RDO #24/ }));

    expect(await screen.findByRole('heading', { name: 'RDO #24' })).toBeDefined();
    expect(mocked.getReport).toHaveBeenCalledWith('rdo-24');
    expect(mocked.createReport).not.toHaveBeenCalled();
    expect(mocked.copyReport).not.toHaveBeenCalled();
  });

  it('vazio sem filtro convida a criar o primeiro relatório', async () => {
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockResolvedValue(paginado([]));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios' });

    expect(await screen.findByText('Nenhum relatório criado ainda')).toBeDefined();
    expect(screen.getByRole('link', { name: /Criar primeiro relatório/ })).toBeDefined();
  });

  it('vazio COM filtro diz outra coisa — não sugere criar do nada', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockResolvedValue(paginado([]));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios' });

    await usuario.click(await screen.findByRole('button', { name: 'Finalizado' }));

    expect(await screen.findByText('Nada com esses filtros')).toBeDefined();
  });

  it('erro mostra mensagem amigável e botão de tentar novamente', async () => {
    mocked.listSites.mockResolvedValue([AURORA]);
    mocked.listReports.mockRejectedValue(new Error('sem rede'));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios' });

    expect(await screen.findByText('Não foi possível carregar os relatórios.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

describe('Tela do RDO', () => {
  it('monta o cabeçalho com o que o backend calculou', async () => {
    mocked.getReport.mockResolvedValue(DETALHE);

    renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });

    expect(await screen.findByRole('heading', { name: 'RDO #24' })).toBeDefined();
    // O nome da obra aparece no cabeçalho e de novo em "Dados da obra".
    expect(screen.getAllByText('Residencial Aurora')).not.toHaveLength(0);
    // Dia da semana e rótulo de situação vêm calculados do backend.
    expect(screen.getByText(/Domingo/)).toBeDefined();
    expect(screen.getByText('Rascunho')).toBeDefined();
  });

  it('lista as nove seções operacionais na ordem do preenchimento', async () => {
    mocked.getReport.mockResolvedValue(DETALHE);

    renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });

    await screen.findByRole('heading', { name: 'RDO #24' });
    const secoes = [
      'Dados da obra',
      'Horário de trabalho',
      'Condições climáticas',
      'Mão de obra',
      'Equipamentos',
      'Atividades executadas',
      'Ocorrências',
      'Materiais',
      'Observações gerais',
      'Fotos',
      'Vídeos',
    ];

    for (const secao of secoes) {
      expect(screen.getByText(secao)).toBeDefined();
    }
  });

  it('não sobrou nenhuma seção marcada como próxima etapa', async () => {
    mocked.getReport.mockResolvedValue(DETALHE);

    renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });

    // Fotos e vídeos foram as últimas a sair do "Em breve". O editor do RDO
    // está completo — o que vier depois é fluxo (fechamento, PDF, assinatura),
    // não conteúdo.
    await screen.findByRole('heading', { name: 'RDO #24' });
    expect(screen.queryAllByText('Em breve')).toHaveLength(0);
  });

  it('resume cada seção preenchida no cabeçalho dela', async () => {
    mocked.getReport.mockResolvedValue(DETALHE_PREENCHIDO);

    renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });

    // É o que permite passar os olhos pela lista e saber o que já foi feito
    // sem abrir nenhuma seção.
    expect(await screen.findByText('2 funções · 14 pessoas')).toBeDefined();
    expect(screen.getByText('1 registro · 1 unidade')).toBeDefined();
    expect(screen.getByText('1 atividade')).toBeDefined();
    expect(screen.getByText('1 ocorrência')).toBeDefined();
    expect(screen.getByText('07:00 às 17:00')).toBeDefined();
    expect(screen.getByText('Ensolarado · Chuva')).toBeDefined();
  });

  it('salva as observações sozinho, sem botão', async () => {
    const usuario = userEvent.setup();
    mocked.getReport.mockResolvedValue(DETALHE);
    mocked.updateReport.mockResolvedValue(DETALHE);

    renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });

    const campo = await screen.findByLabelText('Observações do relatório');
    await usuario.clear(campo);
    await usuario.type(campo, 'Chuva forte no fim da tarde.');

    await waitFor(
      () =>
        expect(mocked.updateReport).toHaveBeenCalledWith('rdo-24', {
          notes: 'Chuva forte no fim da tarde.',
        }),
      { timeout: 3000 },
    );
    expect(await screen.findByText(/^Salvo às/)).toBeDefined();
  });

  it('relatório fechado não é editável e diz quando e por quem foi', async () => {
    mocked.getReport.mockResolvedValue({
      ...DETALHE,
      status: 'SUBMITTED',
      statusLabel: 'Finalizado',
      editable: false,
      submittedAt: '2026-08-30T20:42:00.000Z',
      submittedBy: { id: 'user-1', name: 'Eduardo Engenharia' },
    });

    renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });

    expect(await screen.findByText('Relatório finalizado')).toBeDefined();
    // "Não dá para editar" vira uma explicação quando diz quando e por quem.
    expect(screen.getByText(/por Eduardo Engenharia/)).toBeDefined();
    expect(screen.getByLabelText('Observações do relatório')).toHaveProperty('readOnly', true);
    expect(screen.queryByRole('button', { name: 'Finalizar RDO' })).toBeNull();
  });

  it('RDO de obra não autorizada não abre — 404 vira mensagem, não tela em branco', async () => {
    const { ApiError } = await import('@/lib/api-client');
    mocked.getReport.mockRejectedValue(new ApiError(404, 'Relatório não encontrado.'));

    renderDiario(<DiarioRdoPage />, {
      rota: '/relatorios/rdo-de-outra-obra',
      path: '/relatorios/:id',
    });

    expect(
      await screen.findByText('Relatório não encontrado ou não vinculado ao seu acesso.'),
    ).toBeDefined();
  });
});
