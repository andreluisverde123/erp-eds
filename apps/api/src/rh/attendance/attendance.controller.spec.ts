import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { AttendanceController } from './attendance.controller';

const reflector = new Reflector();

function exigidaPara(metodo: keyof AttendanceController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    AttendanceController.prototype[metodo] as unknown as () => void,
    AttendanceController,
  ]);
}

/// Nenhuma permissão nova foi criada: apontar presença é operação de RH.
describe('Permissões da presença', () => {
  it('consultar chamada, histórico e contagem exige apenas rh.view', () => {
    expect(exigidaPara('day')).toEqual(['rh.view']);
    expect(exigidaPara('findAll')).toEqual(['rh.view']);
    expect(exigidaPara('summary')).toEqual(['rh.view']);
  });

  it('apontar e corrigir exigem rh.manage', () => {
    // Quem só consulta o RH não pode declarar que alguém trabalhou — é o dado
    // que o RH-04 vai transformar em dinheiro.
    expect(exigidaPara('saveDay')).toEqual(['rh.manage']);
  });

  it('nenhuma rota fica sem exigência declarada', () => {
    const rotas: (keyof AttendanceController)[] = ['day', 'summary', 'findAll', 'saveDay'];
    for (const rota of rotas) {
      expect(exigidaPara(rota).length).toBeGreaterThan(0);
    }
  });
});
