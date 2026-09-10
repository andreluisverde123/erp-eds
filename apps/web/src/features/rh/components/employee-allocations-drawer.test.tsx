import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmployeeAllocationsDrawer } from './employee-allocations-drawer';
import type { Employee, EmployeeAllocation } from '../types';

const transferir = vi.fn();

vi.mock('../hooks/use-employee-allocation-mutations', () => ({
  useTransferEmployee: () => ({ mutateAsync: transferir, isPending: false }),
}));

let historico: EmployeeAllocation[] = [];

vi.mock('../hooks/use-employee-allocations', () => ({
  useEmployeeAllocations: () => ({ data: { data: historico }, isLoading: false }),
}));

vi.mock('@/features/engenharia/hooks/use-construction-sites', () => ({
  useConstructionSites: () => ({
    data: {
      data: [
        { id: 'tj', name: 'Obra TJ' },
        { id: 'tce', name: 'Obra TCE' },
        { id: 'x', name: 'Obra X' },
      ],
    },
  }),
}));

const ANDRE: Employee = {
  id: 'andre',
  name: 'André',
  cpf: '12345678901',
  position: 'Pedreiro',
  status: 'ACTIVE',
  employmentType: 'OWN',
  compensationType: 'DAILY',
  dailyRate: '180',
  hireDate: '2026-09-01',
  terminationDate: null,
  baseSalary: null,
  currentAllocation: null,
};

const aloc = (
  id: string,
  siteId: string,
  nome: string,
  inicio: string,
  fim: string | null,
): EmployeeAllocation => ({
  id,
  startDate: `${inicio}T00:00:00.000Z`,
  endDate: fim ? `${fim}T00:00:00.000Z` : null,
  employee: { id: ANDRE.id, name: ANDRE.name, cpf: ANDRE.cpf, position: ANDRE.position },
  constructionSite: { id: siteId, code: siteId.toUpperCase(), name: nome },
  costCenter: null,
});

/// O histórico do André, do mais recente para o mais antigo — é a ordem em que
/// o backend devolve.
const HISTORICO_ANDRE = [
  aloc('a3', 'x', 'Obra X', '2026-09-21', null),
  aloc('a2', 'tce', 'Obra TCE', '2026-09-11', '2026-09-20'),
  aloc('a1', 'tj', 'Obra TJ', '2026-09-01', '2026-09-10'),
];

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <EmployeeAllocationsDrawer employee={ANDRE} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  historico = [];
  transferir.mockReset();
  vi.setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
});

describe('Histórico de obras do colaborador', () => {
  it('mostra as três obras por onde ele passou', () => {
    // Nenhuma foi sobrescrita: transferir preserva o histórico.
    historico = HISTORICO_ANDRE;
    abrir();

    expect(screen.getAllByText('Obra TJ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Obra TCE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Obra X').length).toBeGreaterThan(0);
  });

  it('marca qual é a alocação atual', () => {
    historico = HISTORICO_ANDRE;
    abrir();

    expect(screen.getByText('Atual')).toBeDefined();
  });

  it('a obra atual aparece em destaque, com desde quando', () => {
    historico = HISTORICO_ANDRE;
    abrir();

    // "Obra atual" é a seção; a data de início responde "desde quando".
    expect(screen.getByText('Obra atual')).toBeDefined();
    expect(screen.getByText(/Desde 21\/09\/2026/)).toBeDefined();
  });

  it('cada linha mostra início e fim, e "em aberto" quando não terminou', () => {
    historico = HISTORICO_ANDRE;
    abrir();

    expect(screen.getByText(/01\/09\/2026 → 10\/09\/2026/)).toBeDefined();
    expect(screen.getByText(/21\/09\/2026 → em aberto/)).toBeDefined();
  });

  it('colaborador nunca alocado não vira tela vazia sem explicação', () => {
    abrir();

    expect(screen.getByText(/ainda não foi alocado/i)).toBeDefined();
    expect(screen.getByText(/Sem alocação vigente/i)).toBeDefined();
  });
});

describe('Transferência pela tela', () => {
  it('manda funcionário, obra de destino e data — não a alocação de origem', async () => {
    // Qual alocação encerrar é decisão do backend: informá-la daqui abriria
    // caminho para encerrar a alocação errada.
    historico = HISTORICO_ANDRE;
    const usuario = abrir();

    screen.getByLabelText(/nova obra/i).focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Obra TCE' }));
    await usuario.click(screen.getByRole('button', { name: 'Transferir' }));

    await waitFor(() => expect(transferir).toHaveBeenCalledTimes(1));
    expect(transferir.mock.calls[0]![0]).toMatchObject({
      employeeId: 'andre',
      constructionSiteId: 'tce',
    });
    expect(transferir.mock.calls[0]![0]).not.toHaveProperty('allocationId');
  });

  it('a obra atual não aparece como destino', async () => {
    // Transferir para onde já se está não é uma operação.
    historico = HISTORICO_ANDRE;
    const usuario = abrir();

    screen.getByLabelText(/nova obra/i).focus();
    await usuario.keyboard('{Enter}');

    expect(await screen.findByRole('option', { name: 'Obra TCE' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'Obra X' })).toBeNull();
  });

  it('avisa que a alocação atual será encerrada, e que o histórico fica', () => {
    historico = HISTORICO_ANDRE;
    abrir();

    expect(screen.getByText(/será encerrada no dia anterior/i)).toBeDefined();
    expect(screen.getByText(/histórico é preservado/i)).toBeDefined();
  });

  it('sem obra escolhida, não chama o backend', async () => {
    historico = HISTORICO_ANDRE;
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Transferir' }));

    await waitFor(() => expect(screen.getByText(/Escolha a obra de destino/i)).toBeDefined());
    expect(transferir).not.toHaveBeenCalled();
  });

  it('a recusa por período sobreposto é exibida como veio do backend', async () => {
    // A mensagem do servidor nomeia a obra e o período em conflito — é ela que
    // resolve o problema de quem está na tela. Trocá-la por um texto genérico
    // obrigaria a pessoa a caçar a alocação antiga na mão.
    historico = HISTORICO_ANDRE;
    const { ApiError } = await import('@/lib/api-client');
    transferir.mockRejectedValueOnce(
      new ApiError(409, 'Período conflita com a alocação na obra "Obra TJ" (01/09/2026 → 10/09/2026).'),
    );
    const usuario = abrir();

    screen.getByLabelText(/nova obra/i).focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Obra TCE' }));
    await usuario.click(screen.getByRole('button', { name: 'Transferir' }));

    expect(await screen.findByText(/Obra TJ.*01\/09\/2026/)).toBeDefined();
  });
});
