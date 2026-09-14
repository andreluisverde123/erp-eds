import { z } from 'zod';

export const catalogItemFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do insumo.').max(150, 'Máximo de 150 caracteres.'),
  /// Validado como "escolheu alguma coisa". Qual código é válido, quem sabe é a
  /// API — e a lista da tela vem dela, então não há como escolher um inválido.
  unit: z.string().min(1, 'Escolha a unidade.'),
  category: z.string().trim().max(60, 'Máximo de 60 caracteres.').optional(),
  description: z.string().trim().max(500, 'Máximo de 500 caracteres.').optional(),
  type: z.enum(['MATERIAL', 'LABOR', 'EQUIPMENT']),
  active: z.boolean(),
});

export type CatalogItemFormValues = z.infer<typeof catalogItemFormSchema>;

export const CATALOG_ITEM_FORM_DEFAULTS: CatalogItemFormValues = {
  name: '',
  unit: '',
  category: '',
  description: '',
  type: 'MATERIAL',
  active: true,
};
