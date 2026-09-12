import { registerDecorator, type ValidationOptions } from 'class-validator';

import { isCanonicalUnit, MEASUREMENT_UNIT_CODES } from '../../common/units/measurement-units';

/// Exige um código da lista canônica de unidades.
///
/// Um decorator próprio, e não `@IsIn(MEASUREMENT_UNIT_CODES)`, para a mensagem
/// de erro dizer o que aceitar. Quem manda "m²" precisa descobrir que o código
/// é `M2` sem abrir o código-fonte.
export function IsCanonicalUnit(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCanonicalUnit',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isCanonicalUnit(value),
        defaultMessage: () =>
          `Unidade inválida. Use um destes códigos: ${MEASUREMENT_UNIT_CODES.join(', ')}.`,
      },
    });
  };
}
