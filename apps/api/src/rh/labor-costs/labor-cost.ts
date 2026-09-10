import { Prisma } from '../../../generated/prisma/client';
import { money, round, ZERO } from '../../compras/discount';

/// A aritmética de custo de mão de obra, e o único lugar em que ela existe.
///
/// ## O estado que este módulo existe para representar
///
/// Um custo aqui tem TRÊS estados, não um número:
///
/// - **CONHECIDO** — todos os componentes estão na base.
/// - **PARCIAL** — parte está, parte não. Mostra o que dá para somar e diz o
///   que falta.
/// - **DESCONHECIDO** — não há base nenhuma para afirmar valor.
///
/// A razão é única e vale mais que qualquer conveniência de tipo: **custo
/// desconhecido não é R$ 0,00**. Um zero soma normalmente, aparece no total da
/// obra e ninguém nota que falta informação — o erro só apareceria no
/// fechamento, quando alguém comparasse com a folha. Um `PARCIAL` que carrega a
/// lista do que falta obriga a decidir.
///
/// Tudo em `Prisma.Decimal`, nunca em `number`, e com o mesmo `round` de
/// Compras: `0.1 * 3` em ponto flutuante devolve `0.30000000000000004`, e num
/// campo de dinheiro isso vira centavo errado.

export type EstadoDoCusto = 'CONHECIDO' | 'PARCIAL' | 'DESCONHECIDO';

export interface Custo {
  estado: EstadoDoCusto;
  /// O que É possível somar hoje. Em `DESCONHECIDO` vem `null` — e é `null`,
  /// não zero, para não existir caminho em que um desconhecido entre num total.
  valor: Prisma.Decimal | null;
  /// O que impede o custo de ser completo, em linguagem de quem lê o relatório.
  faltando: string[];
}

export const DESCONHECIDO = (motivo: string): Custo => ({
  estado: 'DESCONHECIDO',
  valor: null,
  faltando: [motivo],
});

function resolver(valor: Prisma.Decimal, faltando: string[]): Custo {
  return {
    estado: faltando.length === 0 ? 'CONHECIDO' : 'PARCIAL',
    valor: round(valor),
    faltando,
  };
}

/// Soma custos preservando a incerteza.
///
/// Um `PARCIAL` no meio contamina o total — e tem de contaminar: a soma de um
/// valor certo com um incompleto é um valor incompleto. Um `DESCONHECIDO`
/// também, e sem contribuir com nada para a soma.
export function somar(custos: Custo[]): Custo {
  if (custos.length === 0) return { estado: 'CONHECIDO', valor: ZERO, faltando: [] };

  let total = ZERO;
  const faltando: string[] = [];

  for (const custo of custos) {
    if (custo.valor !== null) total = total.plus(custo.valor);
    faltando.push(...custo.faltando);
  }

  const completo = custos.every((c) => c.estado === 'CONHECIDO');
  return {
    estado: completo ? 'CONHECIDO' : 'PARCIAL',
    valor: round(total),
    faltando: [...new Set(faltando)],
  };
}

// ---------------------------------------------------------------------------
// DIARISTA
// ---------------------------------------------------------------------------

export interface DiaDeDiarista {
  /// A diária congelada naquele dia. `null` = apontamento anterior ao snapshot.
  dailyRateApplied: Prisma.Decimal | number | string | null;
}

/// Custo de um diarista: soma das diárias dos dias em que ele ESTEVE.
///
/// Recebe só os dias presentes — ausência não gera custo, e essa decisão é de
/// quem monta a lista, não desta função.
///
/// Dias presentes sem diária congelada não viram zero: eles entram na lista do
/// que falta, e o custo fica PARCIAL. É o caso dos apontamentos anteriores à
/// coluna de snapshot, que a migration deliberadamente não preencheu.
export function custoDoDiarista(diasPresentes: DiaDeDiarista[], naoApontados: number): Custo {
  let total = ZERO;
  let semDiaria = 0;

  for (const dia of diasPresentes) {
    if (dia.dailyRateApplied === null) {
      semDiaria += 1;
      continue;
    }
    total = total.plus(money(dia.dailyRateApplied));
  }

  const faltando: string[] = [];
  if (semDiaria > 0) {
    faltando.push(`${semDiaria} dia(s) presente(s) sem diária registrada`);
  }
  if (naoApontados > 0) {
    faltando.push(`${naoApontados} dia(s) alocado(s) ainda sem apontamento`);
  }

  return resolver(total, faltando);
}

// ---------------------------------------------------------------------------
// CLT
// ---------------------------------------------------------------------------

export interface ComponentesDoMes {
  grossSalary: Prisma.Decimal | number | string;
  employerCharges: Prisma.Decimal | number | string | null;
  benefits: Prisma.Decimal | number | string | null;
  provisions: Prisma.Decimal | number | string | null;
}

/// Custo do empregador no mês.
///
/// `grossSalary` é obrigatório e é a base. Os outros três são opcionais, e cada
/// um ausente entra na lista do que falta — o custo então é PARCIAL, e o
/// relatório não pode apresentá-lo como o custo do funcionário.
///
/// `deductions` NÃO entra: são descontos do empregado (INSS e IRRF retidos), já
/// contidos no bruto. Somá-los contaria o mesmo dinheiro duas vezes.
export function custoBaseDoMes(componentes: ComponentesDoMes): Custo {
  const faltando: string[] = [];
  let total = money(componentes.grossSalary);

  const opcionais: [keyof ComponentesDoMes, string][] = [
    ['employerCharges', 'encargos patronais'],
    ['benefits', 'benefícios'],
    ['provisions', 'provisão de 13º e férias'],
  ];

  for (const [campo, rotulo] of opcionais) {
    const valor = componentes[campo];
    if (valor === null || valor === undefined) {
      faltando.push(rotulo);
      continue;
    }
    total = total.plus(money(valor));
  }

  return resolver(total, faltando);
}

/// Rateio do custo do mês entre as obras, POR DIAS PRESENTES.
///
///     apropriado = custo do mês × (dias na obra ÷ dias presentes no mês)
///
/// Nenhum divisor fixo — nem 30, nem 22, nem 220 horas. O denominador é o que a
/// pessoa efetivamente trabalhou no mês, e é isso que faz a soma das obras
/// fechar exatamente o custo do mês: quem trabalhou 12 dias tem o custo dividido
/// por 12, não por 30.
///
/// `diasPresentesNoMes = 0` devolve zero apropriado, e não uma divisão por zero:
/// mês sem nenhuma presença não apropria custo a obra nenhuma. O custo existe e
/// continua sendo do administrativo — este módulo só não sabe a qual obra
/// atribuí-lo, e dizer isso é papel de quem monta o relatório.
export function ratearPorDiasPresentes(
  custoDoMes: Custo,
  diasNaObra: number,
  diasPresentesNoMes: number,
): Custo {
  if (custoDoMes.valor === null) return custoDoMes;
  if (diasPresentesNoMes <= 0 || diasNaObra <= 0) {
    return { ...custoDoMes, valor: ZERO };
  }

  const proporcao = new Prisma.Decimal(diasNaObra).dividedBy(diasPresentesNoMes);
  return { ...custoDoMes, valor: round(custoDoMes.valor.times(proporcao)) };
}

/// A proporção em si, para o relatório poder exibi-la ("10 de 20 dias · 50%").
export function percentualApropriado(diasNaObra: number, diasPresentesNoMes: number): number {
  if (diasPresentesNoMes <= 0) return 0;
  return Math.round((diasNaObra / diasPresentesNoMes) * 10000) / 100;
}

// ---------------------------------------------------------------------------
// EMPREITADA
// ---------------------------------------------------------------------------

export interface Empreitada {
  pricingType: 'GLOBAL' | 'UNIT';
  totalValue: Prisma.Decimal | number | string;
  unitPrice: Prisma.Decimal | number | string | null;
  measuredQuantity: Prisma.Decimal | number | string | null;
}

/// O que se sabe de uma empreitada num período.
///
/// ## Por que o valor do contrato NÃO é o custo do período
///
/// Um contrato global de R$ 10.000 vigente de 01/09 a 31/10 tem valor
/// conhecido — e nenhuma informação sobre QUANDO esse valor foi consumido.
/// Atribuí-lo ao período consultado produziria R$ 10.000 em setembro e outros
/// R$ 10.000 em outubro: o mesmo dinheiro contado duas vezes, num relatório que
/// parece exato.
///
/// O acumulado do contrato unitário tem o mesmo defeito: `measuredQuantity` é
/// um total corrente, não uma medição datada. Os 200 m² podem ter sido
/// executados inteiramente em agosto.
///
/// A saída não é inventar rateio — nem linear, nem por dias, nem por meses.
/// Nenhum deles descreve como uma obra consome uma empreitada, e o número
/// resultante seria uma opinião com cara de fato. A saída é separar as duas
/// coisas:
///
/// - **`valorInformado`** — o que o contrato diz. Informação, exibida como tal.
/// - **`custoDoPeriodo`** — DESCONHECIDO enquanto não houver medições datadas,
///   e portanto fora do total do período.
///
/// Quando existirem medições com data, `custoDoPeriodo` passa a ser a soma das
/// medições do intervalo, e nada mais neste módulo precisa mudar.
export interface ValorDeEmpreitada {
  /// Valor contratado (`GLOBAL`) ou medido acumulado (`UNIT`). `null` quando
  /// nem isso é conhecido.
  valorInformado: Prisma.Decimal | null;
  /// Como esse valor deve ser chamado na tela — dizer "valor contratado" em vez
  /// de "custo" é metade da correção.
  rotulo: string;
  /// O que pode ser atribuído a ESTE período.
  custoDoPeriodo: Custo;
}

export const SEM_APROPRIACAO_TEMPORAL = 'contrato sem apropriação temporal';

export function empreitadaNoPeriodo(contrato: Empreitada): ValorDeEmpreitada {
  const semTempo = DESCONHECIDO(SEM_APROPRIACAO_TEMPORAL);

  if (contrato.pricingType === 'GLOBAL') {
    return {
      valorInformado: round(money(contrato.totalValue)),
      rotulo: 'Valor contratado',
      custoDoPeriodo: semTempo,
    };
  }

  // Unitário sem preço ou sem medição: nem o acumulado é conhecido.
  if (contrato.unitPrice === null || contrato.measuredQuantity === null) {
    return {
      valorInformado: null,
      rotulo: 'Valor medido acumulado',
      custoDoPeriodo: DESCONHECIDO(
        contrato.unitPrice === null ? 'preço unitário não informado' : 'sem medição registrada',
      ),
    };
  }

  return {
    valorInformado: round(money(contrato.measuredQuantity).times(money(contrato.unitPrice))),
    rotulo: 'Valor medido acumulado',
    custoDoPeriodo: semTempo,
  };
}
