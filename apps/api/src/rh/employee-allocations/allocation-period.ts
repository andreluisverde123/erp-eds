/// Álgebra de períodos de alocação.
///
/// ## A convenção, que não foi escolhida aqui
///
/// `startDate` e `endDate` são dias INCLUSIVOS: `endDate` é o ÚLTIMO dia em que
/// o colaborador esteve na obra, não o primeiro dia fora dela. Isso não é uma
/// decisão deste módulo — é o que o ERP já pratica em três lugares
/// independentes:
///
/// - a "obra atual" é calculada com `endDate >= hoje` (`EmployeesService`,
///   `ReportsService`, `IndicatorsService`): quem termina hoje ainda conta hoje;
/// - a ação "Encerrar hoje" da tela grava `endDate = hoje`, e a pessoa continua
///   aparecendo como alocada no dia em que foi encerrada;
/// - `endDate` nulo significa alocação em aberto, sem fim previsto.
///
/// A alternativa (fim exclusivo) exigiria reinterpretar toda linha já gravada.
/// Com fim inclusivo, "TJ até 10/09, TCE a partir de 11/09" se escreve
/// exatamente assim, sem dia de sobra nem dia faltando.
///
/// ## Por que um módulo puro
///
/// A regra de sobreposição é aritmética de intervalos, não consulta de banco.
/// Isolada aqui, ela é testável sem Postgres e tem UM lugar — o `create`, o
/// `update` e a transferência chamam a mesma função, em vez de cada um
/// carregar sua versão do mesmo `if`.

/// Um período de alocação. `fim` nulo é o intervalo aberto: vale de `inicio`
/// em diante, indefinidamente.
export interface Periodo {
  inicio: Date;
  fim: Date | null;
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/// Meia-noite UTC do dia informado.
///
/// UTC explicitamente, pelo mesmo motivo que `parseReportDate` no Diário: as
/// datas entram como `YYYY-MM-DD`, que o JavaScript já interpreta como UTC.
/// Comparar isso com uma meia-noite LOCAL num servidor a oeste de Greenwich
/// desloca tudo em algumas horas, e o erro aparece só em parte do dia.
export function inicioDoDia(data: Date): Date {
  const resultado = new Date(data);
  resultado.setUTCHours(0, 0, 0, 0);
  return resultado;
}

/// O dia anterior. É o que uma transferência usa para encerrar a alocação de
/// origem: se a nova começa em 11/09, a anterior termina em 10/09 — sem buraco
/// e sem dia em duplicidade.
export function diaAnterior(data: Date): Date {
  return inicioDoDia(new Date(inicioDoDia(data).getTime() - UM_DIA_MS));
}

/// O período cobre este dia?
export function vigenteEm(periodo: Periodo, dia: Date): boolean {
  const alvo = inicioDoDia(dia).getTime();
  const inicio = inicioDoDia(periodo.inicio).getTime();
  if (alvo < inicio) return false;
  if (periodo.fim === null) return true;
  return alvo <= inicioDoDia(periodo.fim).getTime();
}

/// Dois períodos têm ao menos um dia em comum?
///
/// A regra é `aInicio <= bFim && bInicio <= aFim`, com fim nulo valendo como
/// infinito. Dois períodos abertos SEMPRE se sobrepõem — é o caso de esquecer
/// de encerrar a alocação anterior antes de criar a nova, que é justamente o
/// erro que este módulo existe para impedir.
export function sobrepoe(a: Periodo, b: Periodo): boolean {
  const aInicio = inicioDoDia(a.inicio).getTime();
  const bInicio = inicioDoDia(b.inicio).getTime();
  const aFim = a.fim === null ? Infinity : inicioDoDia(a.fim).getTime();
  const bFim = b.fim === null ? Infinity : inicioDoDia(b.fim).getTime();

  return aInicio <= bFim && bInicio <= aFim;
}

/// O período é válido em si mesmo?
export function fimAntesDoInicio(periodo: Periodo): boolean {
  if (periodo.fim === null) return false;
  return inicioDoDia(periodo.fim).getTime() < inicioDoDia(periodo.inicio).getTime();
}

/// A primeira alocação existente que conflita com a nova, ou `null`.
///
/// Genérica no item para quem chama poder dizer QUAL obra conflita e em que
/// período — uma mensagem de "período sobreposto" sem esses dados obriga a
/// pessoa a caçar a alocação antiga na mão.
export function primeiroConflito<T extends Periodo>(novo: Periodo, existentes: T[]): T | null {
  return existentes.find((existente) => sobrepoe(novo, existente)) ?? null;
}
