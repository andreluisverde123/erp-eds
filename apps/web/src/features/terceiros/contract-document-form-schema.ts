import { z } from 'zod';

export const contractDocumentFormSchema = z.object({
  contractId: z.string().min(1, 'Selecione o contrato.'),
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome do documento.')
    .max(150, 'Máximo de 150 caracteres.'),
  issueDate: z.string().optional(),
  expiresAt: z.string().min(1, 'Informe a validade.'),
});

export type ContractDocumentFormValues = z.infer<typeof contractDocumentFormSchema>;

export const CONTRACT_DOCUMENT_FORM_DEFAULTS: ContractDocumentFormValues = {
  contractId: '',
  name: '',
  issueDate: '',
  expiresAt: '',
};

export const DOCUMENT_NAME_SUGGESTIONS = [
  'Apólice de Seguro',
  'ART de Responsabilidade Técnica',
  'Certidão Negativa de Débitos',
  'Alvará de Funcionamento',
  'Certificado de Regularidade do FGTS',
];
