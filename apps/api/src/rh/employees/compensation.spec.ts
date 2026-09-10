import { BadRequestException } from '@nestjs/common';

import { CompensationType } from '../../../generated/prisma/client';
import { resolverRemuneracao } from './compensation';

const CLT = CompensationType.CLT;
const DIARISTA = CompensationType.DAILY;

const gravado = (compensationType: CompensationType, dailyRate: number | null) => ({
  compensationType,
  dailyRate,
});

/// A regra de remuneração do colaborador.
///
/// O caso simples — "diarista precisa de diária" — é um `if`. O que exige um
/// módulo é a EDIÇÃO PARCIAL: um PATCH pode mandar só o tipo, só o valor ou
/// nenhum dos dois, e o que vale é a combinação do que veio com o que já está
/// gravado.
describe('Criação', () => {
  it('quem não diz nada nasce CLT, como o default do schema', () => {
    expect(resolverRemuneracao({}, null)).toEqual({ compensationType: CLT, dailyRate: null });
  });

  it('diarista com valor grava o valor', () => {
    expect(resolverRemuneracao({ compensationType: DIARISTA, dailyRate: 180 }, null)).toEqual({
      compensationType: DIARISTA,
      dailyRate: 180,
    });
  });

  it('diarista SEM valor é recusado', () => {
    // Sem diária, o apontamento do RH-03 registra presença que ninguém
    // consegue custear, e a falta só aparece no fechamento do mês.
    expect(() => resolverRemuneracao({ compensationType: DIARISTA }, null)).toThrow(
      BadRequestException,
    );
  });

  it('diária zero ou negativa é recusada', () => {
    for (const valor of [0, -1, -180]) {
      expect(() => resolverRemuneracao({ compensationType: DIARISTA, dailyRate: valor }, null)).toThrow(
        BadRequestException,
      );
    }
  });

  it('CLT não guarda diária, mesmo que o cliente mande uma', () => {
    // Não é "não exigir": é não deixar entrar. Um número nesta coluna num
    // colaborador CLT seria lido como verdade pelo cálculo de custo do RH-04.
    expect(resolverRemuneracao({ compensationType: CLT, dailyRate: 180 }, null)).toEqual({
      compensationType: CLT,
      dailyRate: null,
    });
  });
});

describe('Edição parcial', () => {
  it('mudar de diarista para CLT LIMPA a diária antiga', () => {
    // O PATCH não menciona `dailyRate`. Se a coluna ficasse como estava, o
    // colaborador seria CLT com uma diária de 180 pendurada.
    expect(resolverRemuneracao({ compensationType: CLT }, gravado(DIARISTA, 180))).toEqual({
      compensationType: CLT,
      dailyRate: null,
    });
  });

  it('mudar de CLT para diarista SEM informar valor é recusado', () => {
    // Não há valor anterior de onde herdar: o colaborador era CLT.
    expect(() => resolverRemuneracao({ compensationType: DIARISTA }, gravado(CLT, null))).toThrow(
      BadRequestException,
    );
  });

  it('mudar de CLT para diarista informando valor passa', () => {
    expect(
      resolverRemuneracao({ compensationType: DIARISTA, dailyRate: 200 }, gravado(CLT, null)),
    ).toEqual({ compensationType: DIARISTA, dailyRate: 200 });
  });

  it('editar outro campo de um diarista não mexe na diária', () => {
    // PATCH de nome, por exemplo: nem tipo nem valor vêm no corpo. `undefined`
    // é "não escreva nesta coluna" — reescrever o mesmo número só produziria
    // uma linha de auditoria sem mudança nenhuma.
    expect(resolverRemuneracao({}, gravado(DIARISTA, 180))).toEqual({
      compensationType: DIARISTA,
      dailyRate: undefined,
    });
  });

  it('editar outro campo de um CLT também não escreve nada', () => {
    expect(resolverRemuneracao({}, gravado(CLT, null))).toEqual({
      compensationType: CLT,
      dailyRate: undefined,
    });
  });

  it('trocar só o valor de um diarista mantém o tipo', () => {
    expect(resolverRemuneracao({ dailyRate: 220 }, gravado(DIARISTA, 180))).toEqual({
      compensationType: DIARISTA,
      dailyRate: 220,
    });
  });

  it('zerar a diária de um diarista é recusado', () => {
    // O caminho por onde um diarista viraria "presente e sem custo".
    expect(() => resolverRemuneracao({ dailyRate: 0 }, gravado(DIARISTA, 180))).toThrow(
      BadRequestException,
    );
  });

  it('mandar diária para quem é CLT continua limpando', () => {
    expect(resolverRemuneracao({ dailyRate: 180 }, gravado(CLT, null))).toEqual({
      compensationType: CLT,
      dailyRate: null,
    });
  });

  it('CLT que por algum motivo tem diária gravada é limpo na próxima edição', () => {
    // Rede de segurança para linha que tenha entrado por outro caminho —
    // importação, correção manual, versão anterior da regra.
    expect(resolverRemuneracao({}, gravado(CLT, 180))).toEqual({
      compensationType: CLT,
      dailyRate: null,
    });
  });
});
