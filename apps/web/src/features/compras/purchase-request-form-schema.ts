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
    /// O insumo do cadastro, quando a linha foi ESCOLHIDA de lá. String vazia é
    /// "texto livre" — o caso comum, e continua válido.
    catalogItemId: z.string().optional(),
    /// Só para a tela mostrar o código na célula. Não vai para a API.
    catalogItemCode: z.string().optional(),
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

/// A validação da gaveta de INCLUIR ITENS, que valida SÓ as linhas.
///
/// Mesmo formato de valores do formulário de solicitação — a grade é a mesma
/// e precisa do mesmo `items` —, mas sem as exigências dos campos que a gaveta
/// não mostra. Validar o formulário inteiro ali reprovava em
/// `constructionSiteId`, um campo que não está na tela: o `handleSubmit`
/// engolia o envio, o erro ficava preso num campo que ninguém vê e o botão
/// "Incluir itens" não fazia NADA. Nenhuma mensagem, nenhum pedido.
///
/// A exigência de haver ao menos um item também sai daqui de propósito: a
/// gaveta trata esse caso no `onSubmit`, com um alerta visível. Deixá-la no
/// schema devolveria o mesmo silêncio, agora num erro de `items` que a grade
/// não desenha.
export const addRequestItemsFormSchema = z.object({
  constructionSiteId: z.string(),
  costCenterId: z.string().optional(),
  notes: z.string().trim().optional(),
  items: z.array(purchaseRequestItemFormSchema),
});

export type PurchaseRequestFormValues = z.infer<typeof purchaseRequestFormSchema>;
export type PurchaseRequestItemFormValues = z.infer<typeof purchaseRequestItemFormSchema>;

export const EMPTY_ITEM_ROW: PurchaseRequestItemFormValues = {
  catalogItemId: '',
  catalogItemCode: '',
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
      // O vínculo precisa voltar para o formulário: a edição de rascunho
      // substitui a lista inteira, e sem isto salvar apagaria o insumo da linha.
      catalogItemId: item.catalogItemId ?? '',
      catalogItemCode: item.catalogItem?.code ?? '',
      // A descrição é a da LINHA, e não a do catálogo de hoje: editar o
      // rascunho não pode reescrever o que foi pedido.
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
        catalogItemId: item.catalogItemId || undefined,
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
