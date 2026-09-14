import { describe, expect, it } from 'vitest';

import {
  EMPTY_ITEM_ROW,
  requestToFormValues,
  toPurchaseRequestInput,
  type PurchaseRequestFormValues,
} from './purchase-request-form-schema';
import type { PurchaseRequestDetail } from './types';

const base: PurchaseRequestFormValues = {
  constructionSiteId: 'obra-1',
  costCenterId: '',
  notes: '',
  items: [],
};

/// O VÍNCULO com o cadastro de insumos atravessando o formulário.
describe('Formulário de solicitação e o cadastro de insumos', () => {
  it('linha do cadastro vai com o insumo; o código fica só na tela', () => {
    const entrada = toPurchaseRequestInput({
      ...base,
      items: [
        {
          ...EMPTY_ITEM_ROW,
          catalogItemId: 'insumo-1',
          catalogItemCode: 'MAT-0001',
          description: 'Cimento CP II 50kg',
          unit: 'SC',
          quantity: '10',
        },
      ],
    });

    expect(entrada.items[0]).toMatchObject({
      catalogItemId: 'insumo-1',
      description: 'Cimento CP II 50kg',
      unit: 'SC',
      quantity: 10,
    });
    expect(entrada.items[0]).not.toHaveProperty('catalogItemCode');
  });

  it('linha de texto livre não manda insumo nenhum', () => {
    const entrada = toPurchaseRequestInput({
      ...base,
      items: [{ ...EMPTY_ITEM_ROW, description: 'Torneira', unit: 'UN', quantity: '2' }],
    });

    expect(entrada.items[0]!.catalogItemId).toBeUndefined();
  });

  it('editar um rascunho traz o vínculo de volta, com a descrição DA LINHA', () => {
    // A edição substitui a lista inteira: sem o vínculo no formulário, salvar
    // apagaria o insumo da linha. E a descrição é a gravada, não a do catálogo.
    const valores = requestToFormValues({
      constructionSite: { id: 'obra-1' },
      costCenter: null,
      notes: null,
      items: [
        {
          catalogItemId: 'insumo-1',
          catalogItem: { code: 'MAT-0001' },
          description: 'Cimento CP II 50kg',
          unit: 'SC',
          quantity: '10',
          estimatedUnitPrice: null,
          notes: null,
        },
        {
          catalogItemId: null,
          catalogItem: null,
          description: 'Torneira',
          unit: 'UN',
          quantity: '2',
          estimatedUnitPrice: null,
          notes: null,
        },
      ],
    } as unknown as PurchaseRequestDetail);

    expect(valores.items[0]).toMatchObject({
      catalogItemId: 'insumo-1',
      catalogItemCode: 'MAT-0001',
      description: 'Cimento CP II 50kg',
    });
    expect(valores.items[1]).toMatchObject({ catalogItemId: '', catalogItemCode: '' });
    expect(toPurchaseRequestInput(valores).items.map((item) => item.catalogItemId)).toEqual([
      'insumo-1',
      undefined,
    ]);
  });
});
