import { BadRequestException } from '@nestjs/common';

import { CompensationType } from '../../../generated/prisma/client';

/// Regra de remuneração do colaborador.
///
/// Duas afirmações, e a segunda é a que dá trabalho:
///
/// 1. **Diarista tem diária, e ela é maior que zero.** Sem valor, o
///    apontamento do RH-03 registra presença que ninguém consegue custear, e o
///    erro só aparece no fechamento do mês.
/// 2. **CLT não guarda diária.** Não basta "não exigir": um número que sobrou
///    de quando o colaborador era diarista continua na linha, e o cálculo de
///    custo (RH-04) não tem como saber que ele não vale. Zerar é a única forma
///    de a coluna significar sempre a mesma coisa.
///
/// Módulo puro — sem Prisma, sem banco. A edição parcial é o que torna isto
/// mais que um `if`: um PATCH pode mandar só o tipo, só o valor, ou nenhum dos
/// dois, e a regra vale sobre a combinação do que veio com o que já está
/// gravado. Trocar para CLT sem mandar `dailyRate` precisa limpar o valor
/// antigo; trocar para diarista sem mandar valor precisa ser recusado.

export interface RemuneracaoGravada {
  compensationType: CompensationType;
  dailyRate: number | null;
}

export interface RemuneracaoInformada {
  compensationType?: CompensationType;
  dailyRate?: number | null;
}

export interface RemuneracaoResolvida {
  compensationType: CompensationType;
  /// `undefined` significa "não escreva nesta coluna" — o valor gravado já está
  /// correto e reescrevê-lo só produziria uma linha de auditoria sem mudança.
  dailyRate: number | null | undefined;
}

export const DIARIA_OBRIGATORIA = 'Informe o valor da diária para um colaborador diarista.';
export const DIARIA_POSITIVA = 'O valor da diária deve ser maior que zero.';

/// Resolve o que gravar nas duas colunas.
///
/// `atual` é `null` na criação. Na edição é a linha como está no banco, porque
/// sem ela não dá para saber o tipo efetivo quando o PATCH não manda um.
export function resolverRemuneracao(
  informada: RemuneracaoInformada,
  atual: RemuneracaoGravada | null,
): RemuneracaoResolvida {
  // O default de criação espelha o do schema: quem não diz nada é CLT.
  const tipo = informada.compensationType ?? atual?.compensationType ?? CompensationType.CLT;

  if (tipo === CompensationType.CLT) {
    const jaEstaLimpo = atual !== null && atual.dailyRate === null;
    const naoMandaramValor = informada.dailyRate === undefined;

    // Nada a escrever só quando a coluna JÁ está nula e ninguém mandou valor.
    // Em qualquer outro caso — inclusive quando o cliente manda uma diária
    // junto com CLT — a coluna vai a `null`.
    return {
      compensationType: tipo,
      dailyRate: jaEstaLimpo && naoMandaramValor ? undefined : null,
    };
  }

  const valorEfetivo = informada.dailyRate === undefined ? (atual?.dailyRate ?? null) : informada.dailyRate;

  if (valorEfetivo === null) {
    throw new BadRequestException(DIARIA_OBRIGATORIA);
  }
  if (valorEfetivo <= 0) {
    throw new BadRequestException(DIARIA_POSITIVA);
  }

  return {
    compensationType: tipo,
    // Só escreve se o valor veio no pedido. Um PATCH de nome num diarista não
    // precisa reescrever a diária que já está lá.
    dailyRate: informada.dailyRate === undefined ? undefined : valorEfetivo,
  };
}
