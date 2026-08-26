import { z } from 'zod';

import type { PurchaseRequestDetail, PurchaseRequestInput } from './types';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

/// A linha em branco que a grade mantém no final não é um item pela metade —
/// é o "próximo item" que o usuário pode nunca preencher. Por isso a validação
/// de cada campo roda dentro de um superRefine que sai cedo quando a linha
/// inteira está vazia, em vez de o formulário apagar essa linha do estado
/// antes de validar (o que dessincronizava o `useFieldArray` da grade).
/// `estimatedUnitPrice` não é mais um campo do formulário — quem abre a
/// solicitação não conhece o preço, que passa a ser informado pelo setor de
/// Compras na cotação. Ele continua aqui só como carona: uma solicitação em
/// rascunho que já tenha valores não pode perdê-los ao ser editada.
export const purchaseRequestItemFormSchema = z
  .object({
    description: z.string().trim(),
    unit: z.string().trim(),
    quantity: z.string(),
    estimatedUnitPrice: z.string().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((item, ctx) => {
    if (isBlankItemRow(item)) return;

    if (!item.description.trim()) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Informe o item.' });
    }
    if (!item.unit.trim()) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Informe a unidade.' });
    }
    if (!isValidNumber(item.quantity)) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantidade inválida.' });
    } else if (Number(item.quantity) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Deve ser maior que zero.' });
    }
  });

/// A obra é o destino da solicitação e o primeiro campo do formulário; o
/// centro de custo é complemento opcional, que Compras informa na emissão da
/// Ordem quando o solicitante não souber. Inverso do que era antes, quando só
/// o centro de custo vinha daqui e a obra saía dele por derivação.
export const purchaseRequestFormSchema = z.object({
  constructionSiteId: z.string().min(1, 'Selecione a obra.'),
  costCenterId: z.string().optional(),
  notes: z.string().trim().optional(),
  items: z
    .array(purchaseRequestItemFormSchema)
    .refine((items) => items.some((item) => !isBlankItemRow(item)), 'Adicione ao menos um item.'),
});

export type PurchaseRequestFormValues = z.infer<typeof purchaseRequestFormSchema>;
export type PurchaseRequestItemFormValues = z.infer<typeof purchaseRequestItemFormSchema>;

export const EMPTY_ITEM_ROW: PurchaseRequestItemFormValues = {
  description: '',
  unit: '',
  quantity: '',
  estimatedUnitPrice: '',
  notes: '',
};

export const PURCHASE_REQUEST_FORM_DEFAULTS: PurchaseRequestFormValues = {
  constructionSiteId: '',
  costCenterId: '',
  notes: '',
  items: [{ ...EMPTY_ITEM_ROW }],
};

/// O Select do Radix não aceita item com `value=""` — ele reserva a string
/// vazia para "nada selecionado". Como o centro de custo é opcional e precisa
/// de uma opção explícita para limpar a escolha, ela carrega este sentinela,
/// convertido de volta para "sem centro de custo" na saída do formulário.
export const SEM_CENTRO_DE_CUSTO = '__sem__';

/// A grade sempre mantém uma linha em branco no final pra continuar digitando
/// (ver PurchaseRequestItemsGrid). Essa linha não conta como "item inválido"
/// na validação nem é enviada pra API.
///
/// O parâmetro é tipado estruturalmente (e não como
/// `PurchaseRequestItemFormValues`) porque o próprio schema usa esta função:
/// referenciar o tipo inferido dele aqui criaria uma circularidade de tipos.
export function isBlankItemRow(item: {
  description: string;
  unit: string;
  quantity: string;
}): boolean {
  return !item.description.trim() && !item.unit.trim() && !item.quantity.trim();
}

export function requestToFormValues(request: PurchaseRequestDetail): PurchaseRequestFormValues {
  return {
    constructionSiteId: request.constructionSite.id,
    costCenterId: request.costCenter?.id ?? '',
    notes: request.notes ?? '',
    items: request.items.map((item) => ({
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      estimatedUnitPrice: item.estimatedUnitPrice ?? '',
      notes: item.notes ?? '',
    })),
  };
}

export function toPurchaseRequestInput(values: PurchaseRequestFormValues): PurchaseRequestInput {
  // `null` e não `undefined`: na edição de um rascunho, omitir o campo diz à
  // API "mantenha como está", e é justamente o contrário do que o usuário fez
  // ao escolher "Sem centro de custo".
  const costCenterId =
    !values.costCenterId || values.costCenterId === SEM_CENTRO_DE_CUSTO
      ? null
      : values.costCenterId;

  return {
    constructionSiteId: values.constructionSiteId,
    costCenterId,
    notes: values.notes ? values.notes : undefined,
    // A linha em branco final da grade nunca vai pra API.
    items: values.items
      .filter((item) => !isBlankItemRow(item))
      .map((item) => ({
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity),
        estimatedUnitPrice:
          item.estimatedUnitPrice && item.estimatedUnitPrice.trim() !== ''
            ? Number(item.estimatedUnitPrice)
            : undefined,
        notes: item.notes ? item.notes : undefined,
      })),
  };
}
