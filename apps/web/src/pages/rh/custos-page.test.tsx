import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustosPage } from './custos-page';
import type { Custo, LaborCostReport } from '@/features/rh/types';

let relatorio: LaborCostReport | undefined;

vi.mock('@/features/rh/hooks/use-labor-costs', () => ({
  useLaborCosts: () => ({ data: relatorio, isLoading: false, isError: false }),
}));

vi.mock('@/features/engenharia/hooks/use-construction-sites', () => ({
  useConstructionSites: () => ({ data: { data: [{ id: 'tj', name: 'Obra TJ' }] } }),
}));

const conhecido = (valor: string): Custo => ({ estado: 'CONHECIDO', valor, faltando: [] });
const parcial = (valor: string, faltando: string[]): Custo => ({
  estado: 'PARCIAL',
  valor,
  faltando,
});
const desconhecido = (motivo: string): Custo => ({
  estado: 'DESCONHECIDO',
  valor: null,
  faltando: [motivo],
});

const SEM_TEMPO = 'contrato sem apropriação temporal';

/// Uma linha de empreitada. O `custo` é o APROPRIADO AO PERÍODO — hoje sempre
/// desconhecido —, e `valorInformado` é o valor do contrato, que é informação.
const empreitada = (
  extra: Partial<LaborCostReport['empreitadas'][number]> = {},
): LaborCostReport['empreitadas'][number] => ({
  contractId: 'c1',
  code: 'CT-001',
  scope: 'Instalação elétrica',
  contractorName: 'Elétrica',
  pricingType: 'GLOBAL',
  unitLabel: null,
  unitPrice: null,
  measuredQuantity: null,
  valorInformado: '10000.00',
  rotuloDoValor: 'Valor contratado',
  custo: desconhecido(SEM_TEMPO),
  ...extra,
});

const BASE: LaborCostReport = {
  constructionSiteId: 'tj',
  from: '2026-09-01',
  to: '2026-09-30',
  colaboradores: [],
  empreitadas: [],
  resumo: {
    colaboradores: conhecido('0.00'),
    empreitadas: conhecido('0.00'),
    maoDeObra: conhecido('0.00'),
  },
};

const ANDRE = {
  employeeId: 'andre',
  name: 'André',
  position: 'Pedreiro',
  employmentType: 'OWN' as const,
  compensationType: 'DAILY' as const,
  diasNaObra: 8,
  diasPresentesNoPeriodo: 8,
  percentual: null,
  custo: conhecido('1440.00'),
};

const JOAO = {
  employeeId: 'joao',
  name: 'João',
  position: 'Eletricista',
  employmentType: 'OWN' as const,
  compensationType: 'CLT' as const,
  diasNaObra: 10,
  diasPresentesNoPeriodo: 20,
  percentual: 50,
  custo: conhecido('3000.00'),
};

async function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <CustosPage />
    </QueryClientProvider>,
  );
  const usuario = userEvent.setup({ pointerEventsCheck: 0 });
  screen.getByLabelText('Obra').focus();
  await usuario.keyboard('{Enter}');
  await usuario.click(await screen.findByRole('option', { name: 'Obra TJ' }));
  return usuario;
}

beforeEach(() => {
  relatorio = undefined;
});

/// A regra que esta tela existe para cumprir.
describe('Custo desconhecido nunca aparece como R$ 0,00', () => {
  it('empreitada sem medição mostra "Custo desconhecido"', async () => {
    // Zero significaria "não custou nada", e ninguém questiona um zero num
    // relatório. A alvenaria foi executada e vai ser paga.
    relatorio = {
      ...BASE,
      empreitadas: [
        empreitada({
          scope: 'Alvenaria',
          pricingType: 'UNIT',
          unitLabel: 'm²',
          unitPrice: '30.0000',
          measuredQuantity: null,
          valorInformado: null,
          rotuloDoValor: 'Valor medido acumulado',
          custo: desconhecido('sem medição registrada'),
        }),
      ],
      resumo: { ...BASE.resumo, empreitadas: parcial('0.00', ['sem medição registrada']) },
    };
    await abrir();

    const linha = (await screen.findByText('Alvenaria')).closest('tr')!;

    expect(within(linha).getByText('Custo desconhecido')).toBeDefined();
    // Zero na LINHA é o que não pode existir. Nos cards de resumo, R$ 0,00 é
    // legítimo — obra sem colaborador custou zero de mão de obra própria.
    expect(within(linha).queryByText(/R\$/)).toBeNull();
    expect(within(linha).getByText('Sem base')).toBeDefined();
  });

  it('o que falta é NOMEADO, não só sinalizado', async () => {
    // "Custo parcial" sozinho não diz a ninguém o que fazer.
    relatorio = {
      ...BASE,
      colaboradores: [{ ...JOAO, custo: parcial('1000.00', ['encargos patronais', 'benefícios']) }],
      resumo: { ...BASE.resumo, maoDeObra: parcial('1000.00', ['encargos patronais']) },
    };
    await abrir();

    expect(await screen.findByText(/Falta:.*encargos patronais.*benefícios/)).toBeDefined();
  });

  it('o resumo avisa quando a apropriação está incompleta', async () => {
    relatorio = {
      ...BASE,
      resumo: { ...BASE.resumo, maoDeObra: parcial('1000.00', ['x']) },
    };
    await abrir();

    expect(
      await screen.findByText(/Custo parcial — existem colaboradores ou períodos sem informação/),
    ).toBeDefined();
  });

  it('sem nada faltando, nenhum aviso de parcialidade aparece', async () => {
    relatorio = { ...BASE, colaboradores: [ANDRE] };
    await abrir();

    expect(screen.queryByText(/Custo parcial —/)).toBeNull();
    expect(screen.queryByText('Custo desconhecido')).toBeNull();
  });
});

describe('De onde veio o valor', () => {
  it('diarista mostra os dias na obra, sem percentual', async () => {
    // Diarista não rateia: o custo dele é inteiro daquela obra.
    relatorio = { ...BASE, colaboradores: [ANDRE] };
    await abrir();

    expect(await screen.findByText('André')).toBeDefined();
    expect(screen.getByText('8 dia(s) na obra')).toBeDefined();
    expect(screen.getByText('R$ 1.440,00')).toBeDefined();
  });

  it('CLT mostra a proporção que sustenta o rateio', async () => {
    // É o que permite refazer a conta de cabeça: 10 de 20 dias, 50%, R$ 3.000.
    relatorio = { ...BASE, colaboradores: [JOAO] };
    await abrir();

    expect(await screen.findByText('10 de 20 dias · 50%')).toBeDefined();
    expect(screen.getByText('R$ 3.000,00')).toBeDefined();
  });

  it('empreitada unitária mostra quantidade × preço', async () => {
    relatorio = {
      ...BASE,
      empreitadas: [
        empreitada({
          contractId: 'c2',
          code: 'CT-002',
          scope: 'Alvenaria',
          contractorName: 'Alvenaria ME',
          pricingType: 'UNIT',
          unitLabel: 'm²',
          unitPrice: '30.0000',
          measuredQuantity: '200.000',
          valorInformado: '6000.00',
          rotuloDoValor: 'Valor medido acumulado',
        }),
      ],
    };
    await abrir();

    expect(await screen.findByText(/200.000 m² × R\$ 30,00/)).toBeDefined();
    expect(screen.getByText('Preço unitário')).toBeDefined();
  });

  it('empreitada global mostra que o valor é o contratado', async () => {
    relatorio = { ...BASE, empreitadas: [empreitada()] };
    await abrir();

    expect(await screen.findByText('Preço global')).toBeDefined();
    expect(screen.getAllByText('Valor contratado').length).toBeGreaterThan(0);
  });
});

describe('Própria e terceirizada ficam separadas', () => {
  it('são duas seções, com dois resumos distintos', async () => {
    // Somá-las como se fossem "salários" apagaria a diferença entre pagar uma
    // pessoa e contratar um serviço fechado.
    relatorio = {
      ...BASE,
      colaboradores: [ANDRE],
      empreitadas: [empreitada()],
      resumo: {
        colaboradores: conhecido('1440.00'),
        empreitadas: parcial('0.00', [SEM_TEMPO]),
        maoDeObra: parcial('1440.00', [SEM_TEMPO]),
      },
    };
    await abrir();

    expect(await screen.findByText('Mão de obra própria (1)')).toBeDefined();
    expect(screen.getByText('Terceirizados / empreitadas (1)')).toBeDefined();
  });

  it('o total se chama "custo CONHECIDO de mão de obra"', async () => {
    // Nunca "custo total da obra": material, equipamento e serviço são outros
    // módulos e não passam por aqui.
    relatorio = BASE;
    await abrir();

    expect(await screen.findByText('Custo conhecido do período')).toBeDefined();
    expect(screen.queryByText(/Custo total da obra/i)).toBeNull();
  });
});

describe('Estado inicial', () => {
  it('sem obra escolhida, explica em vez de mostrar números', () => {
    const cliente = new QueryClient();
    render(
      <QueryClientProvider client={cliente}>
        <CustosPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Escolha a obra e o período')).toBeDefined();
  });
});

/// **O valor do contrato não é o custo do período.**
///
/// Um contrato global de R$ 10.000 vigente de setembro a outubro apareceria
/// integralmente nas duas consultas — R$ 20.000 no bimestre, o mesmo dinheiro
/// contado duas vezes.
describe('Empreitadas ficam fora do total do período', () => {
  it('o card de terceirizados diz "apropriados ao período" e mostra R$ 0,00', async () => {
    relatorio = {
      ...BASE,
      colaboradores: [ANDRE],
      empreitadas: [empreitada()],
      resumo: {
        colaboradores: conhecido('35000.00'),
        empreitadas: parcial('0.00', [SEM_TEMPO]),
        maoDeObra: parcial('35000.00', [SEM_TEMPO]),
      },
    };
    await abrir();

    expect(await screen.findByText('Terceirizados apropriados ao período')).toBeDefined();
    // O total do período é só a mão de obra própria — os R$ 10.000 do contrato
    // não entram.
    expect(screen.getAllByText('R$ 35.000,00').length).toBeGreaterThan(0);
    expect(screen.queryByText('R$ 45.000,00')).toBeNull();
  });

  it('o valor do contrato continua VISÍVEL, fora do total', async () => {
    // O dinheiro existe e alguém precisa saber que está pendente de
    // apropriação — só não pode ser somado ao período.
    relatorio = {
      ...BASE,
      empreitadas: [
        empreitada(),
        empreitada({
          contractId: 'c2',
          scope: 'Alvenaria',
          pricingType: 'UNIT',
          unitLabel: 'm²',
          unitPrice: '30.0000',
          measuredQuantity: '200.000',
          valorInformado: '6000.00',
          rotuloDoValor: 'Valor medido acumulado',
        }),
      ],
      resumo: { ...BASE.resumo, empreitadas: parcial('0.00', [SEM_TEMPO]), maoDeObra: parcial('0.00', [SEM_TEMPO]) },
    };
    await abrir();

    expect(await screen.findByText('Valores terceirizados ainda não temporalizados')).toBeDefined();

    // O valor fica num `<span>` próprio (tabular-nums), então o texto do item
    // quebra entre elementos — a busca é pelo conteúdo do `<li>` inteiro.
    const itens = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');

    expect(itens).toContainEqual(
      expect.stringMatching(/Instalação elétrica — valor contratado — R\$\s?10\.000,00/),
    );
    expect(itens).toContainEqual(
      expect.stringMatching(/Alvenaria — valor medido acumulado — R\$\s?6\.000,00/),
    );
  });

  it('o aviso nomeia a causa: contrato sem apropriação temporal', async () => {
    // É um problema diferente de holerite sem encargos, e a ação é outra.
    relatorio = {
      ...BASE,
      empreitadas: [empreitada()],
      resumo: { ...BASE.resumo, empreitadas: parcial('0.00', [SEM_TEMPO]), maoDeObra: parcial('0.00', [SEM_TEMPO]) },
    };
    await abrir();

    expect(
      await screen.findByText(/existem contratos terceirizados sem apropriação temporal/),
    ).toBeDefined();
  });

  it('a linha separa "valor do contrato" de "apropriado ao período"', async () => {
    relatorio = { ...BASE, empreitadas: [empreitada()] };
    await abrir();

    const linha = (await screen.findByText('Instalação elétrica')).closest('tr')!;

    expect(within(linha).getByText('R$ 10.000,00')).toBeDefined();
    expect(within(linha).getByText('Custo desconhecido')).toBeDefined();
  });

  it('sem contrato nenhum, nada de aviso de temporalização', async () => {
    relatorio = { ...BASE, colaboradores: [ANDRE] };
    await abrir();

    expect(screen.queryByText('Valores terceirizados ainda não temporalizados')).toBeNull();
    expect(screen.queryByText(/sem apropriação temporal/)).toBeNull();
  });
});
