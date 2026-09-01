import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@repo/ui';
import { describe, expect, it, vi } from 'vitest';

import { ConstructionSiteFormFields } from './construction-site-form-fields';
import type { ConstructionSiteFormValues } from '../construction-site-form-schema';
import * as siteTeam from '../site-team';

vi.mock('../site-team');
const mocked = vi.mocked(siteTeam);

const ANA = { id: 'u1', name: 'Ana', email: 'ana@eds.com.br' };

function montar(responsibleId = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Formulario() {
    const form = useForm<ConstructionSiteFormValues>({
      defaultValues: {
        code: '',
        name: '',
        clientName: '',
        city: '',
        state: '',
        startDate: '',
        expectedEndDate: '',
        status: 'PLANNING',
        responsibleId,
        responsibleName: '',
        description: '',
      } as ConstructionSiteFormValues,
    });
    // `Form` é o FormProvider: `FormField` e `FormItem` chamam `useFormField`,
    // que exige o contexto — sem ele, o mesmo erro que derrubava a tela de
    // gerar ordem de compra.
    return (
      <Form {...form}>
        <ConstructionSiteFormFields control={form.control} />
      </Form>
    );
  }

  render(
    <QueryClientProvider client={client}>
      <Formulario />
    </QueryClientProvider>,
  );
}

describe('campo Responsável', () => {
  it('mostra SÓ o nome no campo fechado, não o nome grudado no e-mail', async () => {
    mocked.listSiteTeamCandidates.mockResolvedValue([ANA]);
    montar('u1');

    // O Radix espelha no gatilho o conteúdo inteiro da opção. Sem um filho
    // explícito, o campo saía "Anaana@eds.com.br" — nome e e-mail colados,
    // que foi o defeito relatado.
    // `findByText` espera a lista de candidatos chegar; o `closest` sobe até o
    // campo fechado, que é onde o defeito aparecia.
    const nome = await screen.findByText('Ana');
    const gatilho = nome.closest('[role="combobox"]');

    expect(gatilho).not.toBeNull();
    expect(gatilho!.textContent).not.toContain('@');
  });

  it('sem ninguém escolhido, mostra o texto de instrução', async () => {
    mocked.listSiteTeamCandidates.mockResolvedValue([ANA]);
    montar();

    expect(await screen.findByText('Selecione o responsável')).toBeDefined();
  });

  it('sem candidatos, explica onde liberar o acesso', async () => {
    mocked.listSiteTeamCandidates.mockResolvedValue([]);
    montar();

    // Campo vazio sem explicação faz a pessoa achar que a tela quebrou.
    expect(await screen.findByText(/Libere em Administração/)).toBeDefined();
  });
});
