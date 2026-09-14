import { registerDecorator, type ValidationOptions } from 'class-validator';

import { isDateOnly } from './reference-date';

/// Exige uma data `AAAA-MM-DD` que exista. `@IsDateString` aceitaria data com
/// hora e fuso, e o dia gravado dependeria de onde o cliente está.
export function IsDateOnly(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (valor: unknown) => isDateOnly(valor),
        defaultMessage: () => 'Data inválida. Use o formato AAAA-MM-DD.',
      },
    });
  };
}
