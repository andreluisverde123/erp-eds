import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmployeeFormDrawer } from './employee-form-drawer';
import type { Employee } from '../types';

vi.mock('../hooks/use-employee-mutations', () => ({
  useCreateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const DIARISTA: Employee = {
  id: 'e1',
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

function abrir(employee?: Employee) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <EmployeeFormDrawer open onOpenChange={() => {}} employee={employee} />
    </QueryClientProvider>,
  );
  // `pointerEventsCheck: 0`: o Radix marca o body com `pointer-events: none`
  // enquanto o Sheet está aberto, e o userEvent recusa clicar em algo assim.
  // No navegador o portal do Select fica fora dessa marca; no jsdom, não.
  return userEvent.setup({ pointerEventsCheck: 0 });
}

const campoDeDiaria = () => screen.queryByLabelText(/valor da diária/i);

/// Abre um `Select` do Radix pelo TECLADO. No jsdom ele não reage ao clique
/// sintético — a abertura depende de eventos de ponteiro que o ambiente não
/// produz —, mas o caminho de teclado é o mesmo que uma pessoa usaria e
/// funciona.
async function escolher(
  usuario: ReturnType<typeof userEvent.setup>,
  rotulo: RegExp,
  opcao: string,
) {
  screen.getByLabelText(rotulo).focus();
  await usuario.keyboard('{Enter}');
  await usuario.click(await screen.findByRole('option', { name: opcao }));
}

/// O campo de diária só aparece para quem é diarista.
///
/// Deixá-lo sempre visível convidaria a preencher um valor que a API descarta —
/// e a pessoa sairia da tela achando que gravou o custo daquele colaborador.
describe('Campo de diária no formulário de colaborador', () => {
  it('não aparece num cadastro novo, que nasce CLT', async () => {
    abrir();

    expect(campoDeDiaria()).toBeNull();
  });

  it('aparece ao escolher diarista', async () => {
    const usuario = abrir();

    await escolher(usuario, /remuneração/i, 'Diarista');

    expect(campoDeDiaria()).not.toBeNull();
  });

  it('já vem preenchido ao editar um diarista', async () => {
    abrir(DIARISTA);

    // `NumberInput` exibe no formato brasileiro; o valor cru vem do Decimal.
    expect((campoDeDiaria() as HTMLInputElement).value).toBe('180,00');
  });

  it('some ao trocar o diarista para CLT', async () => {
    // O caminho em que um valor antigo ficaria pendurado na tela.
    const usuario = abrir(DIARISTA);

    await escolher(usuario, /remuneração/i, 'CLT');

    expect(campoDeDiaria()).toBeNull();
  });

  it('vínculo e remuneração são escolhas separadas', async () => {
    // Terceirizado é vínculo; diarista é forma de pagamento. As duas listas
    // existem lado a lado e nenhuma restringe a outra.
    abrir();

    expect(screen.getByLabelText(/vínculo/i)).toBeDefined();
    expect(screen.getByLabelText(/remuneração/i)).toBeDefined();
  });
});
