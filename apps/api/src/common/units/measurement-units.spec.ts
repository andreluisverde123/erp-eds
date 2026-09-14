import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isCanonicalUnit, MEASUREMENT_UNIT_CODES, MEASUREMENT_UNITS } from './measurement-units';

/// O arquivo do FRONT, lido como texto.
///
/// Mesma técnica que `item-suggestions.service.spec.ts` usa para conferir que
/// o SQL da migration normaliza igual ao TypeScript: quando a mesma verdade
/// precisa existir em dois lugares que não podem se importar, o teste é o
/// que os mantém juntos.
const ARQUIVO_DO_FRONT = join(__dirname, '../../../../web/src/lib/measurement-units.ts');

function codigosDoFront(): string[] {
  const fonte = readFileSync(ARQUIVO_DO_FRONT, 'utf8');
  return [...fonte.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]!);
}

describe('A lista canônica de unidades', () => {
  it('é idêntica à do frontend, código a código e na mesma ordem', () => {
    // A API valida e o front oferece. Se as duas divergirem, a tela mostra uma
    // unidade que o servidor recusa — e o usuário não tem como saber por quê.
    expect(MEASUREMENT_UNIT_CODES).toEqual(codigosDoFront());
  });

  it('tem as unidades de que o orçamento vai precisar', () => {
    // Mão de obra em H, equipamento em H ou DIA, serviço fechado em VB. Sem
    // elas, a composição não teria como expressar coeficiente de tempo.
    for (const codigo of ['H', 'DIA', 'VB', 'M2', 'M3', 'KG', 'SC', 'UN']) {
      expect(MEASUREMENT_UNIT_CODES).toContain(codigo);
    }
  });

  it('tem as unidades básicas de material', () => {
    // A tonelada é `TON`, e não ganha um `T` ao lado: dois códigos para a
    // mesma grandeza é exatamente o defeito que a lista existe para impedir.
    for (const codigo of ['UN', 'KG', 'G', 'TON', 'M', 'M2', 'M3', 'L', 'ML', 'CX', 'SC']) {
      expect(MEASUREMENT_UNIT_CODES).toContain(codigo);
    }
    expect(MEASUREMENT_UNIT_CODES).not.toContain('T');
  });

  it('não tem código repetido', () => {
    expect(new Set(MEASUREMENT_UNIT_CODES).size).toBe(MEASUREMENT_UNIT_CODES.length);
  });

  it('todo código é caixa alta e sem acento', () => {
    for (const { code } of MEASUREMENT_UNITS) {
      expect(code).toBe(code.toUpperCase());
      expect(code.normalize('NFD')).toBe(code);
    }
  });
});

describe('Validação de unidade', () => {
  it('aceita os códigos da lista', () => {
    expect(isCanonicalUnit('SC')).toBe(true);
    expect(isCanonicalUnit('M3')).toBe(true);
  });

  it('RECUSA as variantes que fariam a mesma unidade virar duas', () => {
    // É o defeito que a lista existe para impedir: com `String` livre, "M2",
    // "m2" e "m²" são três unidades para o banco, e um relatório que some por
    // unidade para de fechar.
    for (const variante of ['m2', 'M²', 'm²', ' M2', 'M2 ']) {
      expect(isCanonicalUnit(variante)).toBe(false);
    }
  });

  it('recusa unidade inventada', () => {
    expect(isCanonicalUnit('SACO')).toBe(false);
    expect(isCanonicalUnit('')).toBe(false);
  });
});
