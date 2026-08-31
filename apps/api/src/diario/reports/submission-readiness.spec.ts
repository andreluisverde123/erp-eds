import { BadRequestException } from '@nestjs/common';

import { assertCanSubmit, canTransition } from './daily-report-status';
import { assertReadyToSubmit } from './submission-readiness';

const PRONTO = { workStartMinutes: 420, workEndMinutes: 1020, activities: [{}] };

describe('canTransition', () => {
  it('permite apenas DRAFT → SUBMITTED', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
  });

  it.each([
    ['SUBMITTED', 'SUBMITTED'],
    ['SUBMITTED', 'DRAFT'],
    ['APPROVED', 'SUBMITTED'],
    ['DRAFT', 'APPROVED'],
  ] as const)('recusa %s → %s', (de, para) => {
    // Não há caminho de volta e não há salto: reabrir um RDO finalizado seria
    // outra funcionalidade (com outro rastro), e a aprovação ainda não existe.
    expect(canTransition(de, para)).toBe(false);
  });
});

describe('assertCanSubmit', () => {
  it('deixa passar o rascunho', () => {
    expect(() => assertCanSubmit('DRAFT')).not.toThrow();
  });

  it('recusa finalizar de novo, com mensagem que explica o que houve', () => {
    expect(() => assertCanSubmit('SUBMITTED')).toThrow('já foi finalizado por alguém');
  });
});

describe('assertReadyToSubmit', () => {
  it('deixa passar o relatório com jornada e atividade', () => {
    expect(() => assertReadyToSubmit(PRONTO)).not.toThrow();
  });

  it('exige o horário de início e de término', () => {
    expect(() => assertReadyToSubmit({ ...PRONTO, workEndMinutes: null })).toThrow(
      /horário de início e de término/,
    );
    expect(() => assertReadyToSubmit({ ...PRONTO, workStartMinutes: null })).toThrow(
      BadRequestException,
    );
  });

  it('exige pelo menos uma atividade', () => {
    expect(() => assertReadyToSubmit({ ...PRONTO, activities: [] })).toThrow(
      /pelo menos uma atividade/,
    );
  });

  it('junta TODAS as pendências numa mensagem só', () => {
    // Uma de cada vez faria a pessoa tentar, corrigir, tentar de novo e
    // descobrir a segunda — num aparelho em campo, com conexão ruim.
    expect(() =>
      assertReadyToSubmit({ workStartMinutes: null, workEndMinutes: null, activities: [] }),
    ).toThrow(
      'Para finalizar o relatório, informe o horário de início e de término da jornada e registre pelo menos uma atividade executada.',
    );
  });

  it('NÃO exige clima, mão de obra, equipamentos, ocorrências, materiais nem mídia', () => {
    // Todos são legítimos vazios. Exigi-los faria o engenheiro inventar
    // conteúdo para conseguir fechar o relatório.
    expect(() => assertReadyToSubmit(PRONTO)).not.toThrow();
  });

  it('não exige o intervalo — nem toda frente para no mesmo horário', () => {
    expect(() => assertReadyToSubmit(PRONTO)).not.toThrow();
  });
});
