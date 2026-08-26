import {
  barcodeFromDigitableLine,
  digitableLineFromBarcode,
  dueDateFromFactor,
  mod10,
  mod11,
  parseBoleto,
} from './boleto.util';

/// Monta um boleto VÁLIDO a partir das partes, calculando os dígitos como a
/// FEBRABAN manda. Existe porque não há amostra real da EDS no repositório —
/// e porque copiar uma linha digitável de documentação é frágil: as publicadas
/// por aí frequentemente têm o DV geral desatualizado em relação ao valor, e o
/// teste passaria a medir a memória de quem copiou.
///
/// O que este helper NÃO prova: que a EXTRAÇÃO de um PDF real devolve os
/// dígitos certos. Isso só um boleto de verdade responde — ver
/// `docs/boleto.md`.
function buildBarcode(options: {
  bank?: string;
  factor?: string;
  amountCents?: string;
  freeField?: string;
  currency?: string;
}): string {
  const {
    bank = '341',
    factor = '1585',
    amountCents = '0000350000',
    freeField = '1234567890123456789012345',
    currency = '9',
  } = options;

  const withoutCheckDigit = bank + currency + factor + amountCents + freeField;
  const checkDigit = mod11(withoutCheckDigit);

  return bank + currency + String(checkDigit) + factor + amountCents + freeField;
}

const BOLETO_VALIDO = buildBarcode({});
const LINHA_VALIDA = digitableLineFromBarcode(BOLETO_VALIDO);

describe('boleto.util — leitura da linha digitável', () => {
  describe('Dígitos verificadores (conferidos à mão)', () => {
    it('módulo 10 alterna pesos 2 e 1 da direita para a esquerda', () => {
      // "12": 2×2=4, 1×1=1 → soma 5 → DV 5.
      expect(mod10('12')).toBe(5);
      // "19": 9×2=18 → soma os DÍGITOS (1+8=9), 1×1=1 → soma 10 → DV 0.
      expect(mod10('19')).toBe(0);
      expect(mod10('0')).toBe(0);
    });

    it('módulo 11 cicla pesos de 2 a 9 da direita para a esquerda', () => {
      // "11": 1×2 + 1×3 = 5 → DV 11−5 = 6.
      expect(mod11('11')).toBe(6);
      // Nove dígitos 1: 2+3+4+5+6+7+8+9+2 = 46 → resto 2 → DV 9.
      // O último 2 prova que o peso VOLTA para 2 depois do 9.
      expect(mod11('111111111')).toBe(9);
    });

    it('módulo 11 devolve 1 quando o cálculo daria 0, 10 ou 11', () => {
      // 5×2 = 10 → resto 10 → 11−10 = 1.
      expect(mod11('0'.repeat(42) + '5')).toBe(1);
      // Soma zero → resto 0 → 11−0 = 11 → por definição, 1.
      expect(mod11('0'.repeat(43))).toBe(1);
    });
  });

  describe('1, 3 e 4. Leitura da linha digitável e do código de barras', () => {
    it('lê a linha digitável e devolve banco, valor e vencimento', () => {
      const resultado = parseBoleto(LINHA_VALIDA);

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(resultado.boleto.bankCode).toBe('341');
      expect(resultado.boleto.amount).toBe(3500);
      expect(resultado.boleto.barcode).toBe(BOLETO_VALIDO);
    });

    it('aceita o código de barras direto e devolve a mesma coisa', () => {
      const daLinha = parseBoleto(LINHA_VALIDA);
      const daBarra = parseBoleto(BOLETO_VALIDO);

      expect(daLinha).toEqual(daBarra);
    });

    it('normaliza máscara, espaço e pontuação sem mudar a informação', () => {
      const comMascara = `${LINHA_VALIDA.slice(0, 5)}.${LINHA_VALIDA.slice(5, 10)} ${LINHA_VALIDA.slice(10, 15)}.${LINHA_VALIDA.slice(15)}`;

      expect(parseBoleto(comMascara)).toEqual(parseBoleto(LINHA_VALIDA));
    });

    it('a conversão linha <-> código de barras não perde nem inventa dígito', () => {
      expect(barcodeFromDigitableLine(LINHA_VALIDA)).toBe(BOLETO_VALIDO);
      expect(digitableLineFromBarcode(BOLETO_VALIDO)).toBe(LINHA_VALIDA);
      expect(LINHA_VALIDA).toHaveLength(47);
      expect(BOLETO_VALIDO).toHaveLength(44);
    });
  });

  describe('2. O que NÃO é um boleto de cobrança', () => {
    it('recusa entrada vazia', () => {
      const resultado = parseBoleto('   ');
      expect(resultado).toMatchObject({ ok: false, error: 'EMPTY' });
    });

    it('recusa comprimento fora de 44 e 47, dizendo quanto recebeu', () => {
      const resultado = parseBoleto('1234567890');

      expect(resultado).toMatchObject({ ok: false, error: 'WRONG_LENGTH' });
      if (resultado.ok) return;
      expect(resultado.message).toContain('10');
    });

    it('reconhece o boleto de arrecadação e explica o que é, em vez de dizer "inválido"', () => {
      // Concessionária, tributo, FGTS: 48 dígitos, começa com 8, layout outro.
      const resultado = parseBoleto('8' + '1'.repeat(47));

      expect(resultado).toMatchObject({ ok: false, error: 'COLLECTION_SLIP' });
      if (resultado.ok) return;
      expect(resultado.message).toContain('arrecadação');
    });

    it('recusa moeda diferente de real', () => {
      const resultado = parseBoleto(buildBarcode({ currency: '8' }));
      expect(resultado).toMatchObject({ ok: false, error: 'UNKNOWN_CURRENCY' });
    });
  });

  describe('3. Dígito trocado é PEGO, não aceito calado', () => {
    it('recusa quando um dígito do campo muda', () => {
      const adulterada = LINHA_VALIDA.slice(0, 5) + '9' + LINHA_VALIDA.slice(6);

      // Só vale como teste se o dígito realmente mudou.
      expect(adulterada).not.toBe(LINHA_VALIDA);
      expect(parseBoleto(adulterada)).toMatchObject({ ok: false, error: 'CHECK_DIGIT' });
    });

    it('a mensagem aponta qual campo não conferiu', () => {
      const adulterada = LINHA_VALIDA.slice(0, 15) + '9' + LINHA_VALIDA.slice(16);
      const resultado = parseBoleto(adulterada);

      if (resultado.ok) return;
      expect(resultado.message).toContain('2º campo');
    });

    it('recusa quando o valor é adulterado no código de barras', () => {
      // É o ataque que importa: trocar o valor mantendo o resto. O DV geral
      // cobre o valor, então a adulteração não passa.
      const original = BOLETO_VALIDO;
      const adulterado = original.slice(0, 9) + '0000999900' + original.slice(19);

      expect(parseBoleto(adulterado)).toMatchObject({ ok: false, error: 'CHECK_DIGIT' });
    });
  });

  describe('5 e 6. Valor e vencimento', () => {
    it('lê o valor em reais, com centavos', () => {
      const resultado = parseBoleto(buildBarcode({ amountCents: '0000012345' }));

      if (!resultado.ok) throw new Error(resultado.message);
      expect(resultado.boleto.amount).toBe(123.45);
    });

    it('valor zerado é "boleto sem valor", não "valor não identificado"', () => {
      const resultado = parseBoleto(buildBarcode({ amountCents: '0'.repeat(10) }));

      if (!resultado.ok) throw new Error(resultado.message);
      expect(resultado.boleto.amount).toBeNull();
    });

    it('fator 0000 é boleto sem vencimento — e não é erro', () => {
      const resultado = parseBoleto(buildBarcode({ factor: '0000' }));

      if (!resultado.ok) throw new Error(resultado.message);
      expect(resultado.boleto.dueDate).toBeNull();
    });
  });

  describe('6. Fator de vencimento e a virada de 2025', () => {
    const emAgostoDe2026 = new Date('2026-08-24T12:00:00Z');

    it('fator 1000 do ciclo novo é 22/02/2025', () => {
      const data = dueDateFromFactor(1000, new Date('2025-03-01T12:00:00Z'));
      expect(data?.toISOString().slice(0, 10)).toBe('2025-02-22');
    });

    it('resolve a ambiguidade pela data mais próxima da referência', () => {
      // O contador estourou em 9999 (21/02/2025) e reiniciou em 1000. Cada
      // fator passa a ter duas datas possíveis, a 27 anos uma da outra.
      const data = dueDateFromFactor(1585, emAgostoDe2026);

      expect(data?.toISOString().slice(0, 10)).toBe('2026-09-30');
    });

    it('boleto antigo continua lendo no ciclo antigo', () => {
      // Fator alto: no ciclo novo cairia em 2052, o que nenhum boleto é.
      const data = dueDateFromFactor(9700, emAgostoDe2026);

      expect(data?.toISOString().slice(0, 10)).toBe('2024-04-28');
    });

    it('fator 9999 é o último dia do ciclo antigo', () => {
      const data = dueDateFromFactor(9999, new Date('2025-01-01T12:00:00Z'));
      expect(data?.toISOString().slice(0, 10)).toBe('2025-02-21');
    });
  });

  describe('15. Boleto vencido é sinalizado, não recusado', () => {
    it('a data lida é comparável com hoje — quem decide é a tela', () => {
      const vencido = parseBoleto(buildBarcode({ factor: String(1000 + 100) }));

      if (!vencido.ok) throw new Error(vencido.message);
      // 22/02/2025 + 100 dias: bem antes da referência de 2026.
      expect(vencido.boleto.dueDate!.getTime()).toBeLessThan(
        new Date('2026-08-24T00:00:00Z').getTime(),
      );
    });
  });
});
