/// CNPJ/CPF sempre na mesma forma: só dígitos.
///
/// Existe porque o mesmo documento chega ao sistema por dois caminhos que o
/// escrevem diferente — o usuário digita com máscara no cadastro de
/// fornecedores, e a NF-e traz `emit/CNPJ` só com dígitos. A unique
/// `(companyId, document)` do `Supplier` é sobre o TEXTO: sem normalizar na
/// entrada, "12.345.678/0001-90" e "12345678000190" convivem como dois
/// fornecedores e o emitente nunca casa com o cadastro.
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/// Um documento que serve para identificar fornecedor tem 14 dígitos (CNPJ) ou
/// 11 (CPF — produtor rural e prestador pessoa física emitem NF-e).
///
/// Só o COMPRIMENTO é conferido, de propósito. Validar dígito verificador aqui
/// rejeitaria documento que a própria SEFAZ autorizou por causa de um bug
/// nosso, e o ganho seria nulo: o documento chega assinado de uma origem que
/// já o validou. O que esta função barra é o caso real — string vazia ou
/// truncada de um XML fora do padrão virando um cadastro de fornecedor lixo.
export function hasValidDocumentLength(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}

/// Dígito verificador de CPF/CNPJ (módulo 11).
///
/// Complementa `hasValidDocumentLength`, não a substitui — as duas existem
/// porque a ORIGEM do documento é diferente e o erro a evitar também:
///
///  - Documento vindo da NF-e chega assinado, já validado pela SEFAZ. Ali o
///    risco é rejeitar dado bom por bug nosso, então só o comprimento é
///    conferido.
///  - Documento DIGITADO por uma pessoa (titular de conta bancária, chave PIX)
///    não passou por conferência nenhuma. Ali o risco é o oposto: um dígito
///    trocado manda dinheiro para outra pessoa, e é justamente isso que o
///    módulo 11 pega.
export function hasValidCheckDigits(digits: string): boolean {
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

function isValidCpf(cpf: string): boolean {
  // Todos os dígitos iguais passam no módulo 11 por coincidência aritmética
  // ("111.111.111-11") e são a entrada de teste mais comum do mundo.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const [length, start] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (start - i);
    }
    const remainder = (sum * 10) % 11;
    const expected = remainder === 10 ? 0 : remainder;
    if (expected !== Number(cpf[length])) return false;
  }

  return true;
}

function isValidCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  // Pesos do CNPJ: 5..2 seguido de 9..2, um dígito a mais na segunda volta.
  for (const length of [12, 13]) {
    let sum = 0;
    let weight = length - 7;
    for (let i = length - 1; i >= 0; i -= 1) {
      sum += Number(cnpj[i]) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;
    if (expected !== Number(cnpj[length])) return false;
  }

  return true;
}
