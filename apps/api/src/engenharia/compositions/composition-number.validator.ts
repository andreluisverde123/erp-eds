import { registerDecorator, type ValidationOptions } from 'class-validator';

import { coefficientProblem, unitPriceProblem } from './composition-cost';

/// Validadores de coeficiente e preço que usam a MESMA regra do cálculo.
///
/// **Por que não `@IsNumber({ maxDecimalPlaces })`.** O class-validator conta
/// as casas por `String(valor).split('.')`, e o JavaScript escreve 0,0000001
/// como `"1e-7"` — sem ponto. O resultado não é uma recusa: é um `TypeError`
/// dentro da validação, que chega ao cliente como 500. Um coeficiente
/// minúsculo é justamente o caso que este módulo existe para aceitar ou
/// recusar com clareza.
///
/// A regra vem de `composition-cost.ts`, que conta as casas com `Decimal`. O
/// DTO e o service passam a dizer a mesma coisa com a mesma mensagem.
function segundoARegra(
  nome: string,
  regra: (valor: unknown) => string | null,
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: nome,
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (valor: unknown) => regra(valor) === null,
        defaultMessage: (args) => regra(args?.value) ?? 'Valor inválido.',
      },
    });
  };
}

/// Maior que zero, até 6 casas, dentro de DECIMAL(14,6). Aceita número ou
/// texto numérico ("0.000123").
export function IsCompositionCoefficient(options?: ValidationOptions) {
  return segundoARegra('isCompositionCoefficient', coefficientProblem, options);
}

/// Zero ou positivo, até 4 casas, dentro de DECIMAL(14,4). Aceita número ou
/// texto numérico.
export function IsCompositionUnitPrice(options?: ValidationOptions) {
  return segundoARegra('isCompositionUnitPrice', unitPriceProblem, options);
}
