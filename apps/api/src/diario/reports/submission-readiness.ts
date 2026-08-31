import { BadRequestException } from '@nestjs/common';

/// O que um RDO precisa ter para ser finalizado.
///
/// **Decisão registrada aqui porque o domínio não tinha nenhuma.** Até esta
/// etapa nada era obrigatório: o relatório nascia com obra e data e podia
/// ficar vazio para sempre. Ao fechar o documento, três coisas passam a ser
/// exigidas — e só três:
///
/// 1. **Obra e data** — estruturais, garantidas na criação. Não há como um RDO
///    existir sem elas, então não são conferidas aqui.
/// 2. **Jornada (início e término)** — um diário sem horário não comprova
///    expediente nenhum, e é a primeira coisa que uma medição contratual
///    procura. O intervalo continua opcional: nem toda frente para para
///    almoço no mesmo horário, e algumas não param.
/// 3. **Pelo menos uma atividade** — um dia de obra sem nenhum serviço
///    executado é um dia que não aconteceu. Se de fato não houve trabalho
///    (chuva, paralisação), isso se registra COMO atividade ou ocorrência; o
///    que não pode é o relatório ser fechado em branco.
///
/// **O que deliberadamente NÃO é exigido:** clima, mão de obra, equipamentos,
/// ocorrências, materiais, observações, fotos e vídeos. Todos são legítimos
/// vazios — uma obra pode passar o dia sem receber material, sem ocorrência e
/// sem equipamento mobilizado. Transformá-los em obrigatórios faria o
/// engenheiro inventar conteúdo para conseguir fechar, que é o oposto do que
/// um diário serve.
export interface SubmissionCandidate {
  workStartMinutes: number | null;
  workEndMinutes: number | null;
  activities: unknown[];
}

/// Uma mensagem com TODAS as pendências, e não a primeira que aparecer.
///
/// Devolver uma de cada vez faria a pessoa tentar finalizar, corrigir, tentar
/// de novo e descobrir a segunda — num aparelho em campo, com conexão ruim.
export function assertReadyToSubmit(report: SubmissionCandidate): void {
  const pendencias: string[] = [];

  if (report.workStartMinutes === null || report.workEndMinutes === null) {
    pendencias.push('informe o horário de início e de término da jornada');
  }

  if (report.activities.length === 0) {
    pendencias.push('registre pelo menos uma atividade executada');
  }

  if (pendencias.length > 0) {
    throw new BadRequestException(`Para finalizar o relatório, ${pendencias.join(' e ')}.`);
  }
}
