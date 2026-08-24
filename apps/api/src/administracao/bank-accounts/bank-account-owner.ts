/// A quem uma conta bancária pertence.
///
/// Espelha o arco exclusivo de `BankAccount` (userId | employeeId |
/// contractorId): o cliente diz o TIPO e o id, e o service traduz para a
/// coluna certa. O par (tipo, id) é o que aparece na URL e no corpo — nunca o
/// nome da coluna, que é detalhe do banco.
///
/// Só `USER` tem tela hoje. Os outros dois existem porque o modelo já os
/// sustenta e porque deixá-los de fora obrigaria a mexer no contrato da API
/// quando o RH ou Terceiros ligarem os deles.
export const BANK_ACCOUNT_OWNER_TYPES = ['USER', 'EMPLOYEE', 'CONTRACTOR'] as const;

export type BankAccountOwnerType = (typeof BANK_ACCOUNT_OWNER_TYPES)[number];
