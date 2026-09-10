import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { EmployeeAllocationsController } from './employee-allocations.controller';

const reflector = new Reflector();

/// Resolve a permissão como o `PermissionsGuard` resolve: o metadado do método
/// SOBREPÕE o da classe — não se somam.
function exigidaPara(metodo: keyof EmployeeAllocationsController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    EmployeeAllocationsController.prototype[metodo] as unknown as () => void,
    EmployeeAllocationsController,
  ]);
}

describe('Permissões da alocação', () => {
  it('consultar alocação e histórico exige apenas rh.view', () => {
    expect(exigidaPara('findAll')).toEqual(['rh.view']);
    expect(exigidaPara('findOne')).toEqual(['rh.view']);
  });

  it('alocar, editar, encerrar e TRANSFERIR exigem rh.manage', () => {
    // A transferência move mão de obra entre obras — é escrita, e das mais
    // sensíveis: mexe em duas linhas de uma vez.
    expect(exigidaPara('create')).toEqual(['rh.manage']);
    expect(exigidaPara('update')).toEqual(['rh.manage']);
    expect(exigidaPara('remove')).toEqual(['rh.manage']);
    expect(exigidaPara('transfer')).toEqual(['rh.manage']);
  });

  it('nenhuma rota fica sem exigência declarada', () => {
    // Uma rota nova sem decoration herdaria `rh.view` da classe e passaria a
    // escrever com permissão de leitura.
    const rotas: (keyof EmployeeAllocationsController)[] = [
      'findAll',
      'findOne',
      'create',
      'update',
      'remove',
      'transfer',
    ];

    for (const rota of rotas) {
      expect(exigidaPara(rota).length).toBeGreaterThan(0);
    }
  });
});
