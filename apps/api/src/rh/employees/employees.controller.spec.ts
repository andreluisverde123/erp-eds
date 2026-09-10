import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { EmployeesController } from './employees.controller';

const reflector = new Reflector();

/// Resolve a permissão exigida do jeito que o `PermissionsGuard` resolve: o
/// metadado do MÉTODO sobrepõe o da classe, não se somam. É essa semântica que
/// faz `@RequirePermissions('rh.manage')` num método valer sozinho, mesmo com
/// `rh.view` declarado na classe.
function exigidaPara(metodo: keyof EmployeesController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    EmployeesController.prototype[metodo] as unknown as () => void,
    EmployeesController,
  ]);
}

/// RBAC dos colaboradores.
///
/// `rh.view` e `rh.manage` já existiam e são as permissões do módulo inteiro —
/// nenhuma foi criada para o RH-01. O que estes testes guardam é a divisão:
/// ler é uma permissão, escrever é outra.
describe('Permissões do cadastro de colaboradores', () => {
  it('ler exige apenas rh.view', () => {
    expect(exigidaPara('findAll')).toEqual(['rh.view']);
    expect(exigidaPara('findOne')).toEqual(['rh.view']);
    expect(exigidaPara('positions')).toEqual(['rh.view']);
  });

  it('criar, editar e excluir exigem rh.manage', () => {
    // Sem isto, quem só consulta o RH poderia cadastrar e inativar
    // colaborador — e alterar a diária, que é a informação financeira desta
    // fase.
    expect(exigidaPara('create')).toEqual(['rh.manage']);
    expect(exigidaPara('update')).toEqual(['rh.manage']);
    expect(exigidaPara('remove')).toEqual(['rh.manage']);
  });

  it('nenhuma rota fica sem exigência declarada', () => {
    // Uma rota nova sem decoration herdaria `rh.view` da classe e passaria a
    // escrever com permissão de leitura. Este teste falha quando isso acontece.
    const rotas: (keyof EmployeesController)[] = [
      'findAll',
      'findOne',
      'positions',
      'create',
      'update',
      'remove',
    ];

    for (const rota of rotas) {
      expect(exigidaPara(rota).length).toBeGreaterThan(0);
    }
  });
});
