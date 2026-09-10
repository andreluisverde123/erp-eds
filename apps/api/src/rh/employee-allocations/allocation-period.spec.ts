import {
  diaAnterior,
  fimAntesDoInicio,
  inicioDoDia,
  primeiroConflito,
  sobrepoe,
  vigenteEm,
  type Periodo,
} from './allocation-period';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const periodo = (inicio: string, fim?: string): Periodo => ({
  inicio: dia(inicio),
  fim: fim ? dia(fim) : null,
});

/// `endDate` é o ÚLTIMO dia na obra, não o primeiro dia fora dela.
///
/// Não é escolha deste módulo: o ERP já calcula "obra atual" com
/// `endDate >= hoje` em três serviços, e a ação "Encerrar hoje" grava a data de
/// hoje deixando a pessoa alocada no dia. Estes testes travam essa leitura,
/// para que uma mudança de convenção precise passar por aqui.
describe('Fim inclusivo', () => {
  it('o último dia ainda está dentro do período', () => {
    expect(vigenteEm(periodo('2026-09-01', '2026-09-10'), dia('2026-09-10'))).toBe(true);
  });

  it('o dia seguinte ao fim já está fora', () => {
    expect(vigenteEm(periodo('2026-09-01', '2026-09-10'), dia('2026-09-11'))).toBe(false);
  });

  it('o primeiro dia já está dentro', () => {
    expect(vigenteEm(periodo('2026-09-01', '2026-09-10'), dia('2026-09-01'))).toBe(true);
  });

  it('a véspera do início está fora', () => {
    expect(vigenteEm(periodo('2026-09-01', '2026-09-10'), dia('2026-08-31'))).toBe(false);
  });

  it('período em aberto vale indefinidamente', () => {
    expect(vigenteEm(periodo('2026-09-21'), dia('2030-01-01'))).toBe(true);
    expect(vigenteEm(periodo('2026-09-21'), dia('2026-09-20'))).toBe(false);
  });

  it('a hora do dia não interfere', () => {
    // As datas chegam como meia-noite UTC, mas "hoje" costuma ser um instante
    // qualquer. Comparar sem normalizar faz a resposta mudar ao longo do dia.
    const tarde = new Date('2026-09-10T21:30:00.000Z');
    expect(vigenteEm(periodo('2026-09-01', '2026-09-10'), tarde)).toBe(true);
  });
});

describe('Sobreposição', () => {
  it('períodos que se cruzam no meio', () => {
    // O exemplo do enunciado: TJ 01→15 e TCE 10→20 compartilham 10 a 15.
    expect(sobrepoe(periodo('2026-09-01', '2026-09-15'), periodo('2026-09-10', '2026-09-20'))).toBe(
      true,
    );
  });

  it('períodos encostados NÃO se sobrepõem', () => {
    // 01→10 e 11→20 é exatamente a transferência correta. Se isto acusasse
    // conflito, transferir seria impossível.
    expect(sobrepoe(periodo('2026-09-01', '2026-09-10'), periodo('2026-09-11', '2026-09-20'))).toBe(
      false,
    );
  });

  it('um único dia em comum já é conflito', () => {
    expect(sobrepoe(periodo('2026-09-01', '2026-09-10'), periodo('2026-09-10', '2026-09-20'))).toBe(
      true,
    );
  });

  it('período contido em outro é conflito', () => {
    expect(sobrepoe(periodo('2026-09-05', '2026-09-08'), periodo('2026-09-01', '2026-09-20'))).toBe(
      true,
    );
  });

  it('uma alocação ABERTA engole tudo que vier depois dela', () => {
    // O erro mais comum na operação: criar a nova alocação sem encerrar a
    // anterior. Sem esta regra, a pessoa fica em duas obras para sempre.
    expect(sobrepoe(periodo('2026-09-01'), periodo('2026-12-01', '2026-12-31'))).toBe(true);
  });

  it('duas alocações abertas SEMPRE conflitam', () => {
    expect(sobrepoe(periodo('2026-01-01'), periodo('2030-01-01'))).toBe(true);
  });

  it('uma alocação aberta não alcança o passado', () => {
    expect(sobrepoe(periodo('2026-09-01'), periodo('2026-08-01', '2026-08-31'))).toBe(false);
  });

  it('a ordem dos argumentos não importa', () => {
    const a = periodo('2026-09-01', '2026-09-15');
    const b = periodo('2026-09-10', '2026-09-20');
    expect(sobrepoe(a, b)).toBe(sobrepoe(b, a));
  });

  it('alocação futura entra na conta', () => {
    // Já existe uma alocação marcada para dezembro; criar uma aberta a partir
    // de novembro tem de esbarrar nela.
    expect(sobrepoe(periodo('2026-11-01'), periodo('2026-12-01', '2026-12-31'))).toBe(true);
  });
});

describe('Encadeamento de transferência', () => {
  it('a véspera do novo início é o fim do anterior', () => {
    expect(diaAnterior(dia('2026-09-11')).toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('atravessa a virada de mês', () => {
    expect(diaAnterior(dia('2026-10-01')).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('atravessa a virada de ano', () => {
    expect(diaAnterior(dia('2027-01-01')).toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('encerrar na véspera não deixa buraco nem duplicidade', () => {
    const anterior = periodo('2026-09-01', '2026-09-10');
    const nova = periodo('2026-09-11');

    expect(sobrepoe(anterior, nova)).toBe(false);
    // E nenhum dia fica descoberto entre os dois.
    expect(vigenteEm(anterior, dia('2026-09-10'))).toBe(true);
    expect(vigenteEm(nova, dia('2026-09-11'))).toBe(true);
  });
});

/// O caso que orienta o RH-02.
///
///     André — Pedreiro
///     TJ    01/09 → 10/09
///     TCE   11/09 → 20/09
///     X     21/09 em diante
describe('André entre três obras', () => {
  const TJ = { ...periodo('2026-09-01', '2026-09-10'), obra: 'TJ' };
  const TCE = { ...periodo('2026-09-11', '2026-09-20'), obra: 'TCE' };
  const X = { ...periodo('2026-09-21'), obra: 'Obra X' };
  const historico = [TJ, TCE, X];

  const obraEm = (iso: string) => historico.find((p) => vigenteEm(p, dia(iso)))?.obra ?? null;

  it('05/09 responde TJ', () => {
    expect(obraEm('2026-09-05')).toBe('TJ');
  });

  it('15/09 responde TCE', () => {
    expect(obraEm('2026-09-15')).toBe('TCE');
  });

  it('depois de 21/09 responde Obra X', () => {
    expect(obraEm('2026-09-25')).toBe('Obra X');
    expect(obraEm('2027-03-01')).toBe('Obra X');
  });

  it('as bordas caem na obra certa', () => {
    // O dia da virada é o teste real da convenção: 10/09 ainda é TJ e 11/09 já
    // é TCE. Com fim exclusivo, os dois responderiam TCE.
    expect(obraEm('2026-09-10')).toBe('TJ');
    expect(obraEm('2026-09-11')).toBe('TCE');
    expect(obraEm('2026-09-20')).toBe('TCE');
    expect(obraEm('2026-09-21')).toBe('Obra X');
  });

  it('nenhum par do histórico se sobrepõe', () => {
    expect(sobrepoe(TJ, TCE)).toBe(false);
    expect(sobrepoe(TCE, X)).toBe(false);
    expect(sobrepoe(TJ, X)).toBe(false);
  });

  it('o histórico inteiro sobrevive: três períodos, nenhum sobrescrito', () => {
    expect(historico.map((p) => p.obra)).toEqual(['TJ', 'TCE', 'Obra X']);
  });

  it('antes de 01/09 ele não estava em obra nenhuma', () => {
    expect(obraEm('2026-08-31')).toBeNull();
  });
});

describe('Qual alocação conflita', () => {
  it('devolve a alocação em conflito, não só "sim"', () => {
    // Quem vai ler a mensagem precisa saber QUAL obra e QUE período conflitam.
    const existentes = [
      { ...periodo('2026-09-01', '2026-09-10'), obra: 'TJ' },
      { ...periodo('2026-09-11', '2026-09-20'), obra: 'TCE' },
    ];

    expect(primeiroConflito(periodo('2026-09-15'), existentes)?.obra).toBe('TCE');
  });

  it('sem conflito, devolve null', () => {
    const existentes = [{ ...periodo('2026-09-01', '2026-09-10'), obra: 'TJ' }];
    expect(primeiroConflito(periodo('2026-09-11'), existentes)).toBeNull();
  });

  it('lista vazia nunca conflita', () => {
    expect(primeiroConflito(periodo('2026-09-01'), [])).toBeNull();
  });
});

describe('Validade do próprio período', () => {
  it('fim antes do início é recusado', () => {
    expect(fimAntesDoInicio(periodo('2026-09-10', '2026-09-01'))).toBe(true);
  });

  it('um único dia é válido', () => {
    expect(fimAntesDoInicio(periodo('2026-09-10', '2026-09-10'))).toBe(false);
  });

  it('período aberto é sempre válido', () => {
    expect(fimAntesDoInicio(periodo('2026-09-10'))).toBe(false);
  });
});

describe('Normalização do dia', () => {
  it('zera a hora em UTC', () => {
    expect(inicioDoDia(new Date('2026-09-10T21:30:00.000Z')).toISOString()).toBe(
      '2026-09-10T00:00:00.000Z',
    );
  });
});
