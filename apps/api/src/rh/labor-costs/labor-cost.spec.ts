import { Prisma } from '../../../generated/prisma/client';
import {
  custoBaseDoMes,
  custoDoDiarista,
  empreitadaNoPeriodo,
  percentualApropriado,
  ratearPorDiasPresentes,
  somar,
  type Custo,
} from './labor-cost';

const reais = (custo: Custo) => custo.valor?.toFixed(2) ?? null;
const conhecido = (valor: string): Custo => ({
  estado: 'CONHECIDO',
  valor: new Prisma.Decimal(valor),
  faltando: [],
});

/// A regra que governa este módulo inteiro: **desconhecido não é R$ 0,00**.
///
/// Um zero soma, aparece no total da obra e ninguém percebe que falta
/// informação — o erro só apareceria no fechamento. Por isso o custo tem três
/// estados, e o valor de um DESCONHECIDO é `null`, não zero.
describe('Desconhecido nunca vira zero', () => {
  it('empreitada unitária sem medição devolve valor nulo', () => {
    const { valorInformado, custoDoPeriodo } = empreitadaNoPeriodo({
      pricingType: 'UNIT',
      totalValue: 0,
      unitPrice: 30,
      measuredQuantity: null,
    });

    expect(valorInformado).toBeNull();
    expect(custoDoPeriodo.estado).toBe('DESCONHECIDO');
    expect(custoDoPeriodo.valor).toBeNull();
    expect(custoDoPeriodo.faltando).toContain('sem medição registrada');
  });

  it('somar um desconhecido contamina o total, sem somar zero', () => {
    const total = somar([conhecido('1000.00'), { estado: 'DESCONHECIDO', valor: null, faltando: ['x'] }]);

    expect(total.estado).toBe('PARCIAL');
    expect(reais(total)).toBe('1000.00');
    expect(total.faltando).toContain('x');
  });

  it('um parcial no meio torna o total parcial', () => {
    // A soma de um valor certo com um incompleto é um valor incompleto.
    const total = somar([conhecido('500.00'), { estado: 'PARCIAL', valor: new Prisma.Decimal(100), faltando: ['benefícios'] }]);

    expect(total.estado).toBe('PARCIAL');
    expect(reais(total)).toBe('600.00');
  });

  it('lista vazia é zero CONHECIDO — obra sem mão de obra custou zero mesmo', () => {
    expect(somar([]).estado).toBe('CONHECIDO');
  });
});

describe('Diarista', () => {
  const dia = (valor: string | null) => ({ dailyRateApplied: valor });

  it('presente gera custo: dias × diária congelada', () => {
    // O caso do enunciado: André a R$ 180, presente em 08 e 10 → R$ 360.
    const custo = custoDoDiarista([dia('180.00'), dia('180.00')], 0);

    expect(reais(custo)).toBe('360.00');
    expect(custo.estado).toBe('CONHECIDO');
  });

  it('ausente não gera custo — ele nem chega aqui', () => {
    // Ausência não é um dia de custo zero: é um dia que não entra na lista.
    expect(reais(custoDoDiarista([], 0))).toBe('0.00');
  });

  it('a diária CONGELADA é usada, não a atual do cadastro', () => {
    // André a R$ 180 em setembro e R$ 200 em outubro: setembro continua 180.
    const setembro = custoDoDiarista([dia('180.00'), dia('180.00')], 0);
    const outubro = custoDoDiarista([dia('200.00')], 0);

    expect(reais(setembro)).toBe('360.00');
    expect(reais(outubro)).toBe('200.00');
  });

  it('diárias diferentes no mesmo período somam cada uma pelo seu valor', () => {
    // O reajuste no meio do mês não reescreve os dias anteriores.
    expect(reais(custoDoDiarista([dia('180.00'), dia('200.00')], 0))).toBe('380.00');
  });

  it('dia presente SEM diária registrada deixa o custo parcial', () => {
    // Apontamento anterior à coluna de snapshot: não há como saber quanto valia.
    const custo = custoDoDiarista([dia('180.00'), dia(null)], 0);

    expect(custo.estado).toBe('PARCIAL');
    expect(reais(custo)).toBe('180.00');
    expect(custo.faltando[0]).toMatch(/sem diária registrada/);
  });

  it('dia alocado e não apontado deixa o custo parcial', () => {
    // "Não apontado" não é ausência: ninguém olhou aquele dia.
    const custo = custoDoDiarista([dia('180.00')], 3);

    expect(custo.estado).toBe('PARCIAL');
    expect(custo.faltando[0]).toMatch(/3 dia\(s\) alocado\(s\) ainda sem apontamento/);
  });

  it('a aritmética é decimal, sem erro de ponto flutuante', () => {
    // 0.1 × 3 em ponto flutuante devolve 0.30000000000000004.
    expect(reais(custoDoDiarista([dia('0.10'), dia('0.10'), dia('0.10')], 0))).toBe('0.30');
  });
});

describe('Custo CLT do mês', () => {
  const COMPLETO = {
    grossSalary: '4000.00',
    employerCharges: '1500.00',
    benefits: '400.00',
    provisions: '100.00',
  };

  it('soma salário, encargos, benefícios e provisões', () => {
    const custo = custoBaseDoMes(COMPLETO);

    expect(reais(custo)).toBe('6000.00');
    expect(custo.estado).toBe('CONHECIDO');
  });

  it('descontos do EMPREGADO não entram — seriam contados duas vezes', () => {
    // `deductions` é INSS/IRRF retido do salário, já dentro do bruto. Somá-lo
    // inflaria o custo da empresa com dinheiro que ela não desembolsa a mais.
    const custo = custoBaseDoMes({ ...COMPLETO, ...({ deductions: '900.00' } as object) });

    expect(reais(custo)).toBe('6000.00');
  });

  it('só o salário, sem os demais, é PARCIAL — não é o custo do funcionário', () => {
    const custo = custoBaseDoMes({
      grossSalary: '4000.00',
      employerCharges: null,
      benefits: null,
      provisions: null,
    });

    expect(custo.estado).toBe('PARCIAL');
    expect(reais(custo)).toBe('4000.00');
    expect(custo.faltando).toEqual(['encargos patronais', 'benefícios', 'provisão de 13º e férias']);
  });

  it('cada componente ausente é nomeado', () => {
    const custo = custoBaseDoMes({ ...COMPLETO, benefits: null });

    expect(custo.faltando).toEqual(['benefícios']);
    expect(reais(custo)).toBe('5600.00');
  });

  it('13º e férias entram pela provisão do mês', () => {
    // A proporcionalidade que o negócio pediu sai de graça: cada mês carrega a
    // sua fração e é rateado junto com os dias daquele mês. Nenhuma regra
    // trabalhista é recalculada aqui.
    const semProvisao = custoBaseDoMes({ ...COMPLETO, provisions: null });
    const comProvisao = custoBaseDoMes(COMPLETO);

    expect(reais(comProvisao)).toBe('6000.00');
    expect(reais(semProvisao)).toBe('5900.00');
  });
});

/// O cenário do enunciado.
///
///     João — custo do mês: R$ 6.000
///     TJ: 5 dias · TCE: 15 dias · total 20 dias
///     TJ  → 25% → R$ 1.500
///     TCE → 75% → R$ 4.500
describe('Rateio CLT por dias presentes', () => {
  const CUSTO_DO_MES = conhecido('6000.00');

  it('TJ recebe 25% — R$ 1.500', () => {
    expect(reais(ratearPorDiasPresentes(CUSTO_DO_MES, 5, 20))).toBe('1500.00');
    expect(percentualApropriado(5, 20)).toBe(25);
  });

  it('TCE recebe 75% — R$ 4.500', () => {
    expect(reais(ratearPorDiasPresentes(CUSTO_DO_MES, 15, 20))).toBe('4500.00');
    expect(percentualApropriado(15, 20)).toBe(75);
  });

  it('a soma das obras fecha o custo do mês', () => {
    const tj = ratearPorDiasPresentes(CUSTO_DO_MES, 5, 20);
    const tce = ratearPorDiasPresentes(CUSTO_DO_MES, 15, 20);

    expect(reais(somar([tj, tce]))).toBe('6000.00');
  });

  it('NENHUM divisor fixo é usado — o denominador são os dias presentes', () => {
    // Com 12 dias trabalhados, o custo se divide por 12. Um divisor de 30 daria
    // R$ 1.000 para 5 dias em vez de R$ 2.500, e o restante evaporaria.
    const doze = ratearPorDiasPresentes(CUSTO_DO_MES, 5, 12);

    expect(reais(doze)).toBe('2500.00');
    expect(reais(doze)).not.toBe('1000.00'); // 6000 × 5/30
    expect(reais(doze)).not.toBe('1363.64'); // 6000 × 5/22
  });

  it('quem trabalhou o mês inteiro numa obra leva 100%', () => {
    expect(reais(ratearPorDiasPresentes(CUSTO_DO_MES, 20, 20))).toBe('6000.00');
    expect(percentualApropriado(20, 20)).toBe(100);
  });

  it('mês sem presença nenhuma não apropria a obra nenhuma', () => {
    // Sem divisão por zero, e sem inventar destino para o custo.
    expect(reais(ratearPorDiasPresentes(CUSTO_DO_MES, 0, 0))).toBe('0.00');
    expect(percentualApropriado(0, 0)).toBe(0);
  });

  it('um custo-base parcial continua parcial depois do rateio', () => {
    const parcial: Custo = {
      estado: 'PARCIAL',
      valor: new Prisma.Decimal('4000.00'),
      faltando: ['encargos patronais'],
    };

    const rateado = ratearPorDiasPresentes(parcial, 5, 20);

    expect(rateado.estado).toBe('PARCIAL');
    expect(reais(rateado)).toBe('1000.00');
    expect(rateado.faltando).toContain('encargos patronais');
  });

  it('sem custo-base, o rateio segue desconhecido', () => {
    const rateado = ratearPorDiasPresentes(
      { estado: 'DESCONHECIDO', valor: null, faltando: ['sem holerite'] },
      5,
      20,
    );

    expect(rateado.valor).toBeNull();
  });

  it('proporção que não fecha em centavo é arredondada comercialmente', () => {
    // 1000 ÷ 3 = 333,333...
    expect(reais(ratearPorDiasPresentes(conhecido('1000.00'), 1, 3))).toBe('333.33');
  });
});

/// **O valor do contrato não é o custo do período.**
///
/// Um contrato global de R$ 10.000 vigente de setembro a outubro tem valor
/// conhecido e nenhuma informação sobre QUANDO foi consumido. Atribuí-lo ao
/// período consultado daria R$ 10.000 em setembro e outros R$ 10.000 em
/// outubro — o mesmo dinheiro contado duas vezes, num relatório com cara de
/// exato.
describe('Empreitada por preço global', () => {
  const ELETRICA = {
    pricingType: 'GLOBAL' as const,
    totalValue: '10000.00',
    unitPrice: null,
    measuredQuantity: null,
  };

  it('o valor contratado continua disponível como informação', () => {
    const { valorInformado, rotulo } = empreitadaNoPeriodo(ELETRICA);

    expect(valorInformado!.toFixed(2)).toBe('10000.00');
    // Chamá-lo de "valor contratado", e não de "custo", é metade da correção.
    expect(rotulo).toBe('Valor contratado');
  });

  it('mas NÃO entra no custo do período', () => {
    const { custoDoPeriodo } = empreitadaNoPeriodo(ELETRICA);

    expect(custoDoPeriodo.estado).toBe('DESCONHECIDO');
    expect(custoDoPeriodo.valor).toBeNull();
    expect(custoDoPeriodo.faltando).toContain('contrato sem apropriação temporal');
  });

  it('o mesmo contrato consultado em dois meses não soma duas vezes', () => {
    // A consulta de setembro e a de outubro devolvem o MESMO contrato. Se cada
    // uma atribuísse R$ 10.000, o total do bimestre seria R$ 20.000.
    const setembro = empreitadaNoPeriodo(ELETRICA);
    const outubro = empreitadaNoPeriodo(ELETRICA);

    expect(reais(somar([setembro.custoDoPeriodo, outubro.custoDoPeriodo]))).toBe('0.00');
  });

  it('nenhum rateio é inventado — nem linear, nem por dias, nem por meses', () => {
    // Metade em cada mês (R$ 5.000), ou por dia de vigência, seriam opiniões
    // com cara de fato: nada no contrato diz como a obra o consome.
    const { custoDoPeriodo } = empreitadaNoPeriodo(ELETRICA);

    expect(custoDoPeriodo.valor).toBeNull();
    expect(reais(custoDoPeriodo)).not.toBe('5000.00');
  });
});

describe('Empreitada por preço unitário', () => {
  const ALVENARIA = {
    pricingType: 'UNIT' as const,
    totalValue: '0',
    unitPrice: '30.0000',
    measuredQuantity: '200.000',
  };

  it('o acumulado é calculado e exibido: 200 m² × R$ 30 = R$ 6.000', () => {
    const { valorInformado, rotulo } = empreitadaNoPeriodo(ALVENARIA);

    expect(valorInformado!.toFixed(2)).toBe('6000.00');
    expect(rotulo).toBe('Valor medido acumulado');
  });

  it('o acumulado NÃO é atribuído ao período', () => {
    // `measuredQuantity` é um total corrente, não uma medição datada: os 200 m²
    // podem ter sido executados inteiramente em agosto.
    const { custoDoPeriodo } = empreitadaNoPeriodo(ALVENARIA);

    expect(custoDoPeriodo.estado).toBe('DESCONHECIDO');
    expect(custoDoPeriodo.valor).toBeNull();
  });

  it('sem medição, nem o acumulado existe', () => {
    const { valorInformado, custoDoPeriodo } = empreitadaNoPeriodo({
      ...ALVENARIA,
      measuredQuantity: null,
    });

    expect(valorInformado).toBeNull();
    expect(custoDoPeriodo.faltando).toContain('sem medição registrada');
  });

  it('sem preço unitário, idem', () => {
    const { valorInformado, custoDoPeriodo } = empreitadaNoPeriodo({
      ...ALVENARIA,
      unitPrice: null,
    });

    expect(valorInformado).toBeNull();
    expect(custoDoPeriodo.faltando).toContain('preço unitário não informado');
  });

  it('o `totalValue` do contrato NÃO é usado no modelo unitário', () => {
    // Ali ele é a estimativa de fechamento, não o medido — usar os dois
    // contaria duas vezes.
    const { valorInformado } = empreitadaNoPeriodo({ ...ALVENARIA, totalValue: '99999.00' });

    expect(valorInformado!.toFixed(2)).toBe('6000.00');
  });

  it('quantidade fracionária mantém a precisão decimal', () => {
    // 12,345 m² × R$ 30,50 = R$ 376,5225 → 376,52.
    const { valorInformado } = empreitadaNoPeriodo({
      ...ALVENARIA,
      unitPrice: '30.5000',
      measuredQuantity: '12.345',
    });

    expect(valorInformado!.toFixed(2)).toBe('376.52');
  });
});
