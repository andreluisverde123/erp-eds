import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { LaborCostsController } from './labor-costs.controller';

const reflector = new Reflector();

/// O módulo de custo é SÓ LEITURA: ele apropria custo, não gera folha, conta a
/// pagar nem lançamento. Por isso nenhuma rota exige `rh.manage` — e se alguma
/// passar a exigir, é porque alguém acrescentou escrita aqui.
describe('Permissões do custo de mão de obra', () => {
  it('consultar exige rh.view', () => {
    expect(
      reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        LaborCostsController.prototype.byConstructionSite as unknown as () => void,
        LaborCostsController,
      ]),
    ).toEqual(['rh.view']);
  });

  it('o controller não expõe nenhuma rota de escrita', () => {
    const metodos = Object.getOwnPropertyNames(LaborCostsController.prototype).filter(
      (m) => m !== 'constructor',
    );

    expect(metodos).toEqual(['byConstructionSite']);
  });
});
