import {
  diasTrabalhados,
  montarChamada,
  participaDaChamada,
  type CandidatoAlocado,
} from './attendance-roster';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const pessoa = (
  employeeId: string,
  name: string,
  position: string,
  extra: Partial<CandidatoAlocado> = {},
): CandidatoAlocado => ({
  employeeId,
  name,
  position,
  status: 'ACTIVE',
  terminationDate: null,
  ...extra,
});

const ANDRE = pessoa('andre', 'André', 'Pedreiro');
const CARLOS = pessoa('carlos', 'Carlos', 'Servente');
const JOAO = pessoa('joao', 'João', 'Eletricista');

/// A chamada do dia cruza duas listas que significam coisas diferentes: quem
/// DEVERIA estar (alocação) e quem ESTEVE (presença).
describe('Chamada do dia', () => {
  it('todo alocado aparece, mesmo sem apontamento nenhum', () => {
    const chamada = montarChamada([ANDRE, CARLOS, JOAO], [], dia('2026-09-08'));

    expect(chamada.map((l) => l.employeeId)).toEqual(['andre', 'carlos', 'joao']);
    expect(chamada.every((l) => l.situacao === 'NAO_APONTADO')).toBe(true);
  });

  it('"não apontado" é diferente de "ausente"', () => {
    // O primeiro é trabalho a fazer; o segundo é informação registrada. Um
    // booleano solto não distinguiria os dois, e o mestre não saberia se já
    // passou por aquele dia.
    const chamada = montarChamada(
      [ANDRE, CARLOS],
      [{ employeeId: 'andre', present: false }],
      dia('2026-09-08'),
    );

    expect(chamada.find((l) => l.employeeId === 'andre')!.situacao).toBe('AUSENTE');
    expect(chamada.find((l) => l.employeeId === 'carlos')!.situacao).toBe('NAO_APONTADO');
  });

  it('quem foi marcado presente aparece como presente', () => {
    const chamada = montarChamada(
      [ANDRE],
      [{ employeeId: 'andre', present: true }],
      dia('2026-09-08'),
    );

    expect(chamada[0]!.situacao).toBe('PRESENTE');
  });

  it('vem em ordem alfabética, para a conferência ser rápida', () => {
    const chamada = montarChamada([JOAO, ANDRE, CARLOS], [], dia('2026-09-08'));

    expect(chamada.map((l) => l.name)).toEqual(['André', 'Carlos', 'João']);
  });

  it('presença de quem NÃO está alocado não entra na chamada', () => {
    // Conservador de propósito: a regra de apoio temporário e substituição
    // emergencial ainda não foi definida pelo negócio. Um registro assim não
    // some do banco — ele só não aparece nesta lista, que é a da alocação.
    const chamada = montarChamada([ANDRE], [{ employeeId: 'estranho', present: true }], dia('2026-09-08'));

    expect(chamada).toHaveLength(1);
    expect(chamada[0]!.employeeId).toBe('andre');
  });

  it('obra sem ninguém alocado devolve chamada vazia', () => {
    expect(montarChamada([], [], dia('2026-09-08'))).toEqual([]);
  });
});

/// O status do cadastro é de HOJE; a chamada é de uma DATA. Confundir os dois
/// apagaria o passado de quem foi desligado depois.
describe('Colaborador desligado', () => {
  const DESLIGADO_EM_OUTUBRO = pessoa('andre', 'André', 'Pedreiro', {
    status: 'TERMINATED',
    terminationDate: dia('2026-10-15'),
  });

  it('continua na chamada de um dia ANTERIOR ao desligamento', () => {
    // Ele trabalhou em setembro. Sumir da chamada de setembro tornaria
    // impossível corrigir o apontamento daquele mês.
    expect(participaDaChamada(DESLIGADO_EM_OUTUBRO, dia('2026-09-08'))).toBe(true);
  });

  it('continua na chamada do PRÓPRIO dia do desligamento', () => {
    // O último dia ainda é dia trabalhado.
    expect(participaDaChamada(DESLIGADO_EM_OUTUBRO, dia('2026-10-15'))).toBe(true);
  });

  it('sai da chamada a partir do dia seguinte', () => {
    expect(participaDaChamada(DESLIGADO_EM_OUTUBRO, dia('2026-10-16'))).toBe(false);
  });

  it('desligado SEM data de desligamento sai de qualquer chamada', () => {
    // Sem a data, não há como afirmar que ele ainda trabalhava — o lado seguro
    // é não oferecê-lo para apontamento.
    const semData = pessoa('x', 'X', 'Servente', { status: 'TERMINATED', terminationDate: null });

    expect(participaDaChamada(semData, dia('2020-01-01'))).toBe(false);
  });

  it('férias e afastamento NÃO tiram ninguém da chamada', () => {
    // São temporários, e quem volta de férias no meio do mês trabalhou o resto
    // dele. Excluir aqui esconderia dias reais.
    for (const status of ['VACATION', 'ON_LEAVE']) {
      expect(participaDaChamada(pessoa('x', 'X', 'Servente', { status }), dia('2026-09-08'))).toBe(
        true,
      );
    }
  });
});

describe('Dias trabalhados', () => {
  it('conta só os dias com presença', () => {
    const registros = [
      { date: dia('2026-09-08'), present: true },
      { date: dia('2026-09-09'), present: false },
      { date: dia('2026-09-10'), present: true },
    ];

    expect(diasTrabalhados(registros)).toBe(2);
  });

  it('o mesmo dia não é contado duas vezes', () => {
    // A chave única já impede isso no banco, mas a contagem não deve depender
    // de uma constraint para estar certa.
    const registros = [
      { date: dia('2026-09-08'), present: true },
      { date: dia('2026-09-08'), present: true },
    ];

    expect(diasTrabalhados(registros)).toBe(1);
  });

  it('sem registro nenhum, zero', () => {
    expect(diasTrabalhados([])).toBe(0);
  });

  it('só ausências dão zero', () => {
    expect(diasTrabalhados([{ date: dia('2026-09-09'), present: false }])).toBe(0);
  });
});

/// O caso funcional do enunciado.
///
///     André, alocado na TJ de 01/09 a 10/09.
///     08/09 presente · 09/09 ausente · 10/09 presente
describe('André na obra TJ', () => {
  const APONTAMENTOS = [
    { date: dia('2026-09-08'), present: true },
    { date: dia('2026-09-09'), present: false },
    { date: dia('2026-09-10'), present: true },
  ];

  it('o período retorna 2 dias trabalhados', () => {
    expect(diasTrabalhados(APONTAMENTOS)).toBe(2);
  });

  it('09/09 não é contado como presença', () => {
    const chamada = montarChamada(
      [ANDRE],
      [{ employeeId: 'andre', present: false }],
      dia('2026-09-09'),
    );

    expect(chamada[0]!.situacao).toBe('AUSENTE');
    expect(diasTrabalhados([APONTAMENTOS[1]!])).toBe(0);
  });

  it('faltar no dia 09 não tira o André da chamada do dia 10', () => {
    // A alocação não foi tocada pela falta: ele continua sendo candidato.
    const chamada = montarChamada(
      [ANDRE],
      [{ employeeId: 'andre', present: true }],
      dia('2026-09-10'),
    );

    expect(chamada[0]!.situacao).toBe('PRESENTE');
  });

  it('nenhum valor é calculado — a resposta é uma contagem', () => {
    // O RH-03 para aqui de propósito: quanto vale um dia é assunto do RH-04.
    const resultado = diasTrabalhados(APONTAMENTOS);

    expect(typeof resultado).toBe('number');
    expect(resultado).toBe(2);
  });
});
