import { z } from 'zod';

function isValidNumber(value: string) {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

/// Campo que pode ficar em branco. Branco é DESCONHECIDO, não zero.
function isOptionalNumber(value: string | undefined) {
  return !value || value.trim() === '' || !Number.isNaN(Number(value));
}

export const contractFormSchema = z
  .object({
    contractorId: z.string().min(1, 'Selecione a contratada.'),
    constructionSiteId: z.string().min(1, 'Selecione a obra.'),
    scope: z
      .string()
      .trim()
      .min(1, 'Informe o objeto do contrato.')
      .max(2000, 'Máximo de 2000 caracteres.'),
    /// Obrigatória no contrato novo: é a cláusula que mais muda de um contrato
    /// para outro, e o PDF sairia com a linha em branco.
    paymentTerms: z
      .string()
      .trim()
      .min(1, 'Informe a forma de pagamento.')
      .max(2000, 'Máximo de 2000 caracteres.'),
    totalValue: z
      .string()
      .refine(isValidNumber, 'Valor inválido.')
      .refine((value) => Number(value) > 0, 'Deve ser maior que zero.'),
    startDate: z.string().min(1, 'Informe a data de início.'),
    endDate: z.string().min(1, 'Informe a data de fim.'),
    pricingType: z.enum(['GLOBAL', 'UNIT']),
    unitPrice: z.string().refine(isOptionalNumber, 'Valor inválido.').optional(),
    unitLabel: z.string().max(20, 'Máximo de 20 caracteres.').optional(),
    measuredQuantity: z.string().refine(isOptionalNumber, 'Quantidade inválida.').optional(),
  })
  /// No modelo unitário o preço por unidade é o que define o custo — sem ele
  /// não há como calcular nada. A MEDIÇÃO continua opcional de propósito: um
  /// contrato recém-assinado ainda não tem produção, e o custo dele é
  /// legitimamente desconhecido até a primeira medição.
  .superRefine((values, ctx) => {
    if (values.pricingType !== 'UNIT') return;

    if (!values.unitPrice?.trim() || Number(values.unitPrice) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitPrice'],
        message: 'Informe o preço por unidade.',
      });
    }
    if (!values.unitLabel?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitLabel'],
        message: 'Informe a unidade (m², un, kg...).',
      });
    }
  });

export type ContractFormValues = z.infer<typeof contractFormSchema>;

export const CONTRACT_FORM_DEFAULTS: ContractFormValues = {
  contractorId: '',
  constructionSiteId: '',
  scope: '',
  paymentTerms: '',
  totalValue: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  // `GLOBAL` como padrão: é o modelo da maioria dos contratos da EDS e o de
  // todo contrato já cadastrado.
  pricingType: 'GLOBAL',
  unitPrice: '',
  unitLabel: '',
  measuredQuantity: '',
};
