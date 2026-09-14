import { registerDecorator, type ValidationOptions } from 'class-validator';

import { bdiProblem } from './budget-bdi';
import { quantityProblem, unitCostProblem } from './budget-cost';

/// Validadores de quantidade e custo com a MESMA regra do cálculo, contando as
/// casas com `Decimal` — o `@IsNumber({ maxDecimalPlaces })` do class-validator
/// quebra com número pequeno escrito em notação científica (ver
/// `compositions/composition-number.validator.ts`).
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

export function IsBudgetBdi(options?: ValidationOptions) {
  return segundoARegra('isBudgetBdi', bdiProblem, options);
}

export function IsBudgetQuantity(options?: ValidationOptions) {
  return segundoARegra('isBudgetQuantity', quantityProblem, options);
}

export function IsBudgetUnitCost(options?: ValidationOptions) {
  return segundoARegra('isBudgetUnitCost', unitCostProblem, options);
}
