import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApontamentoPage } from './apontamento-page';
import type { AttendanceDay } from '@/features/rh/types';

const salvar = vi.fn();
let chamada: AttendanceDay | undefined;

vi.mock('@/features/rh/hooks/use-attendance', () => ({
  useAttendanceDay: () => ({ data: chamada, isLoading: false, isError: false }),
  useSaveAttendanceDay: () => ({ mutateAsync: salvar, isPending: false }),
}));

vi.mock('@/features/engenharia/hooks/use-construction-sites', () => ({
  useConstructionSites: () => ({
    data: { data: [{ id: 'tj', name: 'Obra TJ' }, { id: 'tce', name: 'Obra TCE' }] },
  }),
}));

const CHAMADA: AttendanceDay = {
  constructionSiteId: 'tj',
  date: '2026-09-08',
  rows: [
    { employeeId: 'andre', name: 'André', position: 'Pedreiro', situacao: 'NAO_APONTADO' },
    { employeeId: 'carlos', name: 'Carlos', position: 'Servente', situacao: 'PRESENTE' },
    { employeeId: 'joao', name: 'João', position: 'Eletricista', situacao: 'AUSENTE' },
  ],
};

async function abrirObra() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <ApontamentoPage />
    </QueryClientProvider>,
  );
  const usuario = userEvent.setup({ pointerEventsCheck: 0 });
  screen.getByLabelText('Obra').focus();
  await usuario.keyboard('{Enter}');
  await usuario.click(await screen.findByRole('option', { name: 'Obra TJ' }));
  return usuario;
}

beforeEach(() => {
  chamada = undefined;
  salvar.mockReset();
});

describe('Escolher obra e dia', () => {
  it('sem obra escolhida, a tela explica o que fazer em vez de listar', () => {
    const cliente = new QueryClient();
    render(
      <QueryClientProvider client={cliente}>
        <ApontamentoPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Escolha a obra e o dia')).toBeDefined();
  });

  it('obra sem ninguém alocado no dia diz onde alocar', async () => {
    chamada = { ...CHAMADA, rows: [] };
    await abrirObra();

    expect(await screen.findByText(/Ninguém alocado nesta obra neste dia/)).toBeDefined();
    expect(screen.getByText(/Alocações antes de apontar/)).toBeDefined();
  });
});

describe('A chamada do dia', () => {
  it('lista quem estava alocado, com a função', async () => {
    chamada = CHAMADA;
    await abrirObra();

    expect(await screen.findByText('André')).toBeDefined();
    expect(screen.getByText('Pedreiro')).toBeDefined();
    expect(screen.getByText('Carlos')).toBeDefined();
    expect(screen.getByText('João')).toBeDefined();
  });

  it('distingue não apontado, presente e ausente', async () => {
    // "Não apontado" é o que diz ao mestre que ele ainda não passou por aquela
    // pessoa — some se virar só um checkbox desmarcado.
    chamada = CHAMADA;
    await abrirObra();

    expect(await screen.findByText('Não apontado')).toBeDefined();
    expect(screen.getByText('Presente')).toBeDefined();
    expect(screen.getByText('Ausente')).toBeDefined();
  });

  it('quem está presente já vem marcado', async () => {
    chamada = CHAMADA;
    await abrirObra();

    const caixas = await screen.findAllByRole('checkbox');
    // André (não apontado) e João (ausente) desmarcados; Carlos marcado.
    expect((caixas[0] as HTMLInputElement).checked).toBe(false);
    expect((caixas[1] as HTMLInputElement).checked).toBe(true);
    expect((caixas[2] as HTMLInputElement).checked).toBe(false);
  });

  it('avisa quantos ainda faltam apontar', async () => {
    chamada = CHAMADA;
    await abrirObra();

    expect(await screen.findByText(/1 ainda sem apontamento/)).toBeDefined();
  });
});

describe('Salvar o dia', () => {
  it('manda a chamada INTEIRA, não só o que mudou', async () => {
    // O corpo descreve o estado do dia. Quem ficou sem marca é gravado como
    // ausente — informação, diferente de "ainda não apontado".
    chamada = CHAMADA;
    const usuario = await abrirObra();

    await usuario.click(await screen.findByRole('button', { name: 'Salvar o dia' }));

    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    expect(salvar.mock.calls[0]![0].entries).toEqual([
      { employeeId: 'andre', present: false },
      { employeeId: 'carlos', present: true },
      { employeeId: 'joao', present: false },
    ]);
  });

  it('marcar alguém muda o que é enviado', async () => {
    chamada = CHAMADA;
    const usuario = await abrirObra();

    const caixas = await screen.findAllByRole('checkbox');
    await usuario.click(caixas[0]!); // André passa a presente

    await usuario.click(screen.getByRole('button', { name: 'Salvar o dia' }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0]![0].entries[0]).toEqual({ employeeId: 'andre', present: true });
  });

  it('corrigir de ausente para presente é só remarcar e salvar', async () => {
    // O caso do enunciado: "André foi marcado ausente por engano".
    chamada = CHAMADA;
    const usuario = await abrirObra();

    const caixas = await screen.findAllByRole('checkbox');
    await usuario.click(caixas[2]!); // João, ausente → presente

    await usuario.click(screen.getByRole('button', { name: 'Salvar o dia' }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0]![0].entries[2]).toEqual({ employeeId: 'joao', present: true });
  });

  it('conta as alterações por salvar', async () => {
    chamada = CHAMADA;
    const usuario = await abrirObra();

    const caixas = await screen.findAllByRole('checkbox');
    await usuario.click(caixas[0]!);

    expect(await screen.findByText(/1 alteração\(ões\) por salvar/)).toBeDefined();
  });

  it('a obra e a data acompanham o pedido', async () => {
    chamada = CHAMADA;
    const usuario = await abrirObra();

    await usuario.click(await screen.findByRole('button', { name: 'Salvar o dia' }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0]![0]).toMatchObject({ constructionSiteId: 'tj' });
    expect(salvar.mock.calls[0]![0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a falha do backend aparece na tela', async () => {
    chamada = CHAMADA;
    const { ApiError } = await import('@/lib/api-client');
    salvar.mockRejectedValueOnce(new ApiError(400, 'Há colaborador inválido no apontamento.'));
    const usuario = await abrirObra();

    await usuario.click(await screen.findByRole('button', { name: 'Salvar o dia' }));

    expect(await screen.findByText(/colaborador inválido/i)).toBeDefined();
  });
});
