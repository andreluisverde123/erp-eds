import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { CatalogItemsController } from './catalog-items.controller';

const reflector = new Reflector();

function exigidaPara(metodo: keyof CatalogItemsController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    CatalogItemsController.prototype[metodo] as unknown as () => void,
    CatalogItemsController,
  ]);
}

/// `catalogo.*` e não `engenharia.*`: o insumo é cadastro da EMPRESA, consumido
/// por Compras hoje e por Orçamento amanhã.
describe('Permissões do catálogo de insumos', () => {
  it('consultar exige apenas catalogo.view', () => {
    expect(exigidaPara('findAll')).toEqual(['catalogo.view']);
    expect(exigidaPara('findOne')).toEqual(['catalogo.view']);
    expect(exigidaPara('units')).toEqual(['catalogo.view']);
    expect(exigidaPara('categories')).toEqual(['catalogo.view']);
  });

  it('criar, editar e excluir exigem catalogo.manage', () => {
    // Quem só consulta não pode alterar a identidade de um insumo que
    // solicitações e, no futuro, composições apontam.
    expect(exigidaPara('create')).toEqual(['catalogo.manage']);
    expect(exigidaPara('update')).toEqual(['catalogo.manage']);
    expect(exigidaPara('remove')).toEqual(['catalogo.manage']);
  });

  it('nenhuma rota fica sem exigência declarada', () => {
    // Uma rota nova sem decoration herdaria `catalogo.view` da classe e
    // passaria a escrever com permissão de leitura.
    const rotas: (keyof CatalogItemsController)[] = [
      'findAll',
      'units',
      'categories',
      'findOne',
      'create',
      'update',
      'remove',
    ];

    for (const rota of rotas) {
      expect(exigidaPara(rota).length).toBeGreaterThan(0);
    }
  });
});
