/// Quem entra na chamada de um dia, e o que já foi apontado sobre cada um.
///
/// Módulo puro: recebe a alocação do dia e os registros de presença, devolve a
/// lista pronta. Sem Prisma, sem banco.
///
/// ## As duas perguntas que ele mantém separadas
///
/// - **ALOCADO** — deveria estar nesta obra neste dia. Vem de
///   `EmployeeAllocation`, consolidada no RH-02.
/// - **PRESENTE** — esteve. Vem de `EmployeeAttendance`.
///
/// Faltar não mexe na alocação: a pessoa continua alocada e aparece na chamada
/// do dia seguinte. É por isso que as duas coisas são listas separadas aqui, e
/// não um campo só.

/// Estado do apontamento de uma pessoa num dia. Três valores, e o terceiro é o
/// que justifica não usar um booleano solto: "ainda não apontado" é diferente
/// de "apontado como ausente" — o primeiro é trabalho a fazer, o segundo é
/// informação registrada.
export type SituacaoDoApontamento = 'PRESENTE' | 'AUSENTE' | 'NAO_APONTADO';

export interface CandidatoAlocado {
  employeeId: string;
  name: string;
  position: string;
  /// Status ATUAL do cadastro. Usado só para explicar a linha na tela, nunca
  /// para decidir se ela aparece — isso é decidido pela data.
  status: string;
  terminationDate: Date | null;
}

export interface PresencaGravada {
  employeeId: string;
  present: boolean;
}

export interface LinhaDaChamada {
  employeeId: string;
  name: string;
  position: string;
  situacao: SituacaoDoApontamento;
}

/// O colaborador entra na chamada DESTE dia?
///
/// A pergunta é temporal, e não sobre o status de hoje: alguém desligado em
/// outubro continua tendo trabalhado em setembro, e a chamada de setembro
/// precisa mostrá-lo — senão não há como corrigir o passado.
///
/// Só é excluído quem já estava desligado NA DATA. Sem `terminationDate`
/// gravada, o desligamento não tem quando: a pessoa sai da chamada de qualquer
/// data, porque não há como afirmar que ela ainda trabalhava.
export function participaDaChamada(candidato: CandidatoAlocado, dia: Date): boolean {
  if (candidato.status !== 'TERMINATED') return true;
  if (candidato.terminationDate === null) return false;
  return dia.getTime() <= candidato.terminationDate.getTime();
}

/// Monta a chamada do dia cruzando quem estava alocado com o que foi apontado.
export function montarChamada(
  alocados: CandidatoAlocado[],
  presencas: PresencaGravada[],
  dia: Date,
): LinhaDaChamada[] {
  const porFuncionario = new Map(presencas.map((p) => [p.employeeId, p.present]));

  return alocados
    .filter((candidato) => participaDaChamada(candidato, dia))
    .map((candidato) => {
      const apontado = porFuncionario.get(candidato.employeeId);
      return {
        employeeId: candidato.employeeId,
        name: candidato.name,
        position: candidato.position,
        situacao:
          apontado === undefined ? 'NAO_APONTADO' : apontado ? 'PRESENTE' : 'AUSENTE',
      } satisfies LinhaDaChamada;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/// Dias efetivamente trabalhados num conjunto de registros.
///
/// Conta LINHAS com `present`, e nada além disso — nenhuma multiplicação, nenhum
/// valor. O RH-04 é que decide o que fazer com este número; aqui ele é só a
/// contagem.
///
/// A chave única `(funcionário, dia)` garante que um dia não seja contado duas
/// vezes, mas a deduplicação está aqui também: a contagem não deve depender de
/// uma constraint para estar certa.
export function diasTrabalhados(registros: { date: Date; present: boolean }[]): number {
  const dias = new Set<number>();
  for (const registro of registros) {
    if (registro.present) dias.add(registro.date.getTime());
  }
  return dias.size;
}
