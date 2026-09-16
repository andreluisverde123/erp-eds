import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { Form } from '@repo/ui';
import { describe, expect, it, vi } from 'vitest';

import { ConstructionSiteFormFields } from './construction-site-form-fields';
import {
  CONSTRUCTION_SITE_FORM_DEFAULTS,
  constructionSiteFormSchema,
  toConstructionSiteInput,
  type ConstructionSiteFormValues,
} from '../construction-site-form-schema';
import * as siteTeam from '../site-team';

vi.mock('../site-team');
vi.mocked(siteTeam).listSiteTeamCandidates.mockResolvedValue([]);

function montar(firstReportNumberLocked: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Formulario() {
    const form = useForm<ConstructionSiteFormValues>({
      defaultValues: { ...CONSTRUCTION_SITE_FORM_DEFAULTS, firstReportNumber: '58' },
    });
    return (
      <Form {...form}>
        <ConstructionSiteFormFields
          control={form.control}
          firstReportNumberLocked={firstReportNumberLocked}
        />
      </Form>
    );
  }

  render(
    <QueryClientProvider client={client}>
      <Formulario />
    </QueryClientProvider>,
  );
}

describe('Número do primeiro RDO', () => {
  it('obra sem RDO: o campo é editável', () => {
    montar(false);

    const campo = screen.getByLabelText(/Número do primeiro RDO/) as HTMLInputElement;
    expect(campo.value).toBe('58');
    expect(campo.disabled).toBe(false);
  });

  it('obra com RDO: o campo trava e diz por quê', () => {
    montar(true);

    expect((screen.getByLabelText(/Número do primeiro RDO/) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/já tem RDO no Diário/)).toBeDefined();
  });

  it('vai para a API como número, e vazio não vai', () => {
    const base = { ...CONSTRUCTION_SITE_FORM_DEFAULTS, code: 'OBR-1', name: 'Obra' };

    expect(toConstructionSiteInput({ ...base, firstReportNumber: '58' }).firstReportNumber).toBe(
      58,
    );
    expect(toConstructionSiteInput(base).firstReportNumber).toBeUndefined();
  });

  it('recusa zero, negativo e texto', () => {
    const base = { ...CONSTRUCTION_SITE_FORM_DEFAULTS, code: 'OBR-1', name: 'Obra' };

    for (const valor of ['0', '-3', 'abc', '100000']) {
      expect(
        constructionSiteFormSchema.safeParse({ ...base, firstReportNumber: valor }).success,
      ).toBe(false);
    }
    expect(constructionSiteFormSchema.safeParse({ ...base, firstReportNumber: '58' }).success).toBe(
      true,
    );
  });
});
