import { ConflictException } from '@nestjs/common';

import type { DailyReportStatus } from '../../../generated/prisma/client';

/// Rótulos do ciclo de vida. O enum do banco continua em inglês, como todo o
/// resto do schema; a tradução vive aqui, num lugar só, porque backend e
/// frontend precisam dizer a mesma palavra sobre o mesmo estado.
///
///   DRAFT     → Rascunho    (em preenchimento, editável)
///   SUBMITTED → Finalizado  (fechado pelo autor; conteúdo histórico)
///   APPROVED  → Aprovado    (conferido pelo fiscal — ainda não alcançável)
///
/// `SUBMITTED` chamava-se "Em revisão" e `APPROVED`, "Finalizado". A troca
/// aconteceu quando o ciclo foi de fato implementado: a etapa intermediária de
/// revisão não existe (ninguém age sobre ela enquanto não houver aprovação), e
/// chamar de "Em revisão" o estado em que o autor ENTREGA o relatório
/// prometeria uma conferência que o sistema não faz.
export const DAILY_REPORT_STATUS_LABEL: Record<DailyReportStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Finalizado',
  APPROVED: 'Aprovado',
};

/// Regra de editabilidade: só rascunho se edita.
///
/// Escrita como "é DRAFT" e não como "não é SUBMITTED" de propósito. A segunda
/// forma é a que envelhece mal: no dia em que um estado novo entrar no enum,
/// ela o trataria como editável por omissão, sem ninguém decidir nada. Assim,
/// o padrão de um estado desconhecido é o mais restritivo.
export function isEditable(status: DailyReportStatus): boolean {
  return status === 'DRAFT';
}

/// Mensagem única de recusa de escrita. A mesma no PATCH do relatório, nas
/// cinco listas e no upload de mídia — porque todos passam pelo mesmo
/// `assertWritable`.
export const NOT_EDITABLE_MESSAGE =
  'Este relatório já foi finalizado e não pode mais ser alterado.';

/// Transições permitidas, declaradas.
///
/// Uma tabela, e não um `if`: é ela que torna óbvio, para quem chegar depois,
/// que só existe UM caminho — e que a aprovação, quando existir, entra aqui
/// como uma linha nova em vez de um `else` no meio de um service.
const TRANSICOES: Partial<Record<DailyReportStatus, DailyReportStatus[]>> = {
  DRAFT: ['SUBMITTED'],
};

export function canTransition(de: DailyReportStatus, para: DailyReportStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

/// Recusa a finalização de quem já não é rascunho.
///
/// 409 e não 400: o pedido está bem formado e o usuário tem permissão — o que
/// mudou foi o ESTADO do recurso, quase sempre porque alguém finalizou antes
/// (ou porque o botão foi tocado duas vezes numa conexão lenta).
export function assertCanSubmit(status: DailyReportStatus): void {
  if (!canTransition(status, 'SUBMITTED')) {
    throw new ConflictException(
      status === 'DRAFT' ? NOT_EDITABLE_MESSAGE : 'Este relatório já foi finalizado por alguém.',
    );
  }
}
