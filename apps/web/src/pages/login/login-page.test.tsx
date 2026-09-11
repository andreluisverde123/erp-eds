import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { LoginPage } from './login-page';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  paymentPending: false,
}));

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    paymentPending: auth.paymentPending,
    login: auth.login,
  }),
}));

function renderizar() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

async function entrar() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail'), 'fulano@eds.com.br');
  await user.type(screen.getByLabelText('Senha'), 'senha-certa');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

/// Empresa `SUSPENDED` é o corte por falta de pagamento. Quem tenta entrar
/// precisa ver o motivo, e não um "acesso suspenso" genérico.
describe('Banner de pagamento pendente no login', () => {
  beforeEach(() => {
    auth.login.mockReset();
    auth.paymentPending = false;
  });

  it('aparece quando a API recusa o login com PAYMENT_PENDING', async () => {
    auth.login.mockRejectedValue(new ApiError(403, 'Acesso suspenso.', 'PAYMENT_PENDING'));
    renderizar();

    await entrar();

    expect(await screen.findByText('Pagamento pendente')).toBeTruthy();
    expect(screen.queryByText('Acesso suspenso.')).toBeNull();
  });

  it('não aparece para outros erros, como senha errada', async () => {
    auth.login.mockRejectedValue(new ApiError(401, 'E-mail ou senha inválidos.'));
    renderizar();

    await entrar();

    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeTruthy();
    expect(screen.queryByText('Pagamento pendente')).toBeNull();
  });

  it('já abre com o banner quando a sessão caiu pela suspensão', () => {
    auth.paymentPending = true;
    renderizar();

    expect(screen.getByText('Pagamento pendente')).toBeTruthy();
  });
});
