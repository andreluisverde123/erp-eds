import { isValidPixKey, maskAccountNumber, maskPixKey, normalizePixKey } from './bank-account.util';

/// Camada pura: normalização, formato da chave PIX e máscara. Sem banco e sem
/// Nest — o que quebra aqui é regra, não fiação.
describe('bank-account.util', () => {
  describe('5. Validação de PIX', () => {
    it('aceita as cinco formas de chave que o Banco Central define', () => {
      expect(isValidPixKey('CPF', '12345678909')).toBe(true);
      expect(isValidPixKey('CNPJ', '12345678000198')).toBe(true);
      expect(isValidPixKey('EMAIL', 'joao@eds.com.br')).toBe(true);
      expect(isValidPixKey('PHONE', '11999998888')).toBe(true);
      expect(isValidPixKey('RANDOM', '9f8d3c2b-1a4e-4b7c-8d9e-0f1a2b3c4d5e')).toBe(true);
    });

    it('recusa a chave que não corresponde ao tipo declarado', () => {
      // O caso real: escolheu "CPF" no seletor e digitou o celular. Os dois têm
      // 11 dígitos — só o dígito verificador separa um do outro.
      expect(isValidPixKey('CPF', '11999998888')).toBe(false);
      expect(isValidPixKey('CNPJ', '12345678909')).toBe(false);
      expect(isValidPixKey('EMAIL', 'joao arroba eds')).toBe(false);
      expect(isValidPixKey('RANDOM', 'chave-qualquer')).toBe(false);
    });

    it('pega o dígito trocado, que é o erro que manda dinheiro para outra pessoa', () => {
      expect(isValidPixKey('CPF', '12345678909')).toBe(true);
      expect(isValidPixKey('CPF', '12345678908')).toBe(false);
      expect(isValidPixKey('CNPJ', '12345678000198')).toBe(true);
      expect(isValidPixKey('CNPJ', '12345678000199')).toBe(false);
      // Os "CPFs" de teste que todo mundo digita.
      expect(isValidPixKey('CPF', '11111111111')).toBe(false);
      expect(isValidPixKey('CPF', '00000000000')).toBe(false);
    });

    it('telefone vale com e sem DDI, e não vale sem DDD', () => {
      expect(isValidPixKey('PHONE', '5511999998888')).toBe(true);
      expect(isValidPixKey('PHONE', '1133334444')).toBe(true);
      expect(isValidPixKey('PHONE', '999998888')).toBe(false);
    });

    it('normaliza antes de validar: a mesma chave digitada de dois jeitos é uma só', () => {
      expect(normalizePixKey('CPF', '123.456.789-09')).toBe('12345678909');
      expect(normalizePixKey('PHONE', '(11) 99999-8888')).toBe('11999998888');
      expect(normalizePixKey('EMAIL', '  Joao@EDS.com.br ')).toBe('joao@eds.com.br');
      expect(normalizePixKey('RANDOM', '9F8D3C2B-1A4E-4B7C-8D9E-0F1A2B3C4D5E')).toBe(
        '9f8d3c2b-1a4e-4b7c-8d9e-0f1a2b3c4d5e',
      );
    });
  });

  describe('10. Máscara', () => {
    it('mostra só os quatro últimos dígitos da conta', () => {
      expect(maskAccountNumber('123456')).toBe('****3456');
      expect(maskAccountNumber('12345-6')).toBe('****3456');
    });

    it('esconde a conta inteira quando ela tem quatro dígitos ou menos', () => {
      // "Os últimos 4" de um número de 4 dígitos seria o número.
      expect(maskAccountNumber('1234')).toBe('****');
      expect(maskAccountNumber('12')).toBe('****');
    });

    it('preserva o domínio do e-mail e esconde o resto', () => {
      expect(maskPixKey('EMAIL', 'joao@eds.com.br')).toBe('j***@eds.com.br');
    });

    it('mascara as demais chaves pelos quatro últimos caracteres', () => {
      expect(maskPixKey('CPF', '12345678909')).toBe('****8909');
      expect(maskPixKey('PHONE', '11999998888')).toBe('****8888');
      expect(maskPixKey('RANDOM', '9f8d3c2b-1a4e-4b7c-8d9e-0f1a2b3c4d5e')).toBe('****4d5e');
    });

    it('nunca devolve o valor inteiro — nem em pedaço reconstruível', () => {
      const conta = '987654321';
      const mascarada = maskAccountNumber(conta);
      expect(mascarada).not.toContain(conta);
      expect(mascarada.replace(/\*/g, '').length).toBeLessThan(conta.length);
    });
  });
});
