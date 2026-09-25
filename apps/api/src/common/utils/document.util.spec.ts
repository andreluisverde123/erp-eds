import { hasValidCheckDigits } from './document.util';

describe('hasValidCheckDigits', () => {
  it('aceita CNPJs reais', () => {
    // Banco do Brasil, Petrobras e o CNPJ de exemplo mais usado em testes.
    for (const cnpj of ['00000000000191', '33000167000101', '11222333000181']) {
      expect(hasValidCheckDigits(cnpj)).toBe(true);
    }
  });

  it('recusa CNPJ com dígito verificador trocado ou repetido', () => {
    expect(hasValidCheckDigits('11222333000180')).toBe(false);
    expect(hasValidCheckDigits('00000000000192')).toBe(false);
    expect(hasValidCheckDigits('11111111111111')).toBe(false);
  });

  it('continua validando CPF', () => {
    expect(hasValidCheckDigits('52998224725')).toBe(true);
    expect(hasValidCheckDigits('52998224724')).toBe(false);
    expect(hasValidCheckDigits('11111111111')).toBe(false);
  });
});
