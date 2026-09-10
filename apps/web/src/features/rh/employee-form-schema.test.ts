import { describe, expect, it } from 'vitest';

import {
  EMPLOYEE_FORM_DEFAULTS,
  employeeFormSchema,
  type EmployeeFormValues,
} from './employee-form-schema';
import { exigeDiaria, getCompensationTypeLabel, getEmploymentTypeLabel } from './employee-compensation';

const valido = (extra: Partial<EmployeeFormValues> = {}): EmployeeFormValues => ({
  ...EMPLOYEE_FORM_DEFAULTS,
  name: 'André',
  cpf: '12345678901',
  position: 'Pedreiro',
  ...extra,
});

const erroDe = (values: EmployeeFormValues, campo: string) => {
  const resultado = employeeFormSchema.safeParse(values);
  if (resultado.success) return null;
  return resultado.error.issues.find((i) => i.path[0] === campo)?.message ?? null;
};

/// A diária é exigida pelo TIPO DE REMUNERAÇÃO, não por si mesma. É a mesma
/// regra que a API aplica; aqui ela existe para o erro aparecer embaixo do
/// campo, antes de o pedido sair — e não como substituta da validação do
/// servidor.
describe('Regra da diária no formulário', () => {
  it('o cadastro padrão é próprio e CLT, e não pede diária', () => {
    // Descreve o colaborador que a base inteira já tinha antes deste campo.
    expect(EMPLOYEE_FORM_DEFAULTS.employmentType).toBe('OWN');
    expect(EMPLOYEE_FORM_DEFAULTS.compensationType).toBe('CLT');
    expect(employeeFormSchema.safeParse(valido()).success).toBe(true);
  });

  it('diarista sem diária é recusado', () => {
    expect(erroDe(valido({ compensationType: 'DAILY', dailyRate: '' }), 'dailyRate')).toBe(
      'Informe o valor da diária.',
    );
  });

  it('diária zero ou negativa é recusada', () => {
    for (const valor of ['0', '-1']) {
      expect(erroDe(valido({ compensationType: 'DAILY', dailyRate: valor }), 'dailyRate')).toBe(
        'A diária deve ser maior que zero.',
      );
    }
  });

  it('diarista com diária passa', () => {
    // O exemplo do enunciado: André, pedreiro, próprio, diarista, R$ 180,00.
    const valores = valido({
      employmentType: 'OWN',
      compensationType: 'DAILY',
      dailyRate: '180',
    });

    expect(employeeFormSchema.safeParse(valores).success).toBe(true);
  });

  it('CLT com diária preenchida NÃO é bloqueado', () => {
    // Acontece ao trocar de diarista para CLT com o campo já preenchido. Barrar
    // aqui deixaria a pessoa presa num erro sobre um campo que a tela nem
    // mostra mais — a API descarta o valor, que é o comportamento certo.
    expect(employeeFormSchema.safeParse(valido({ dailyRate: '180' })).success).toBe(true);
  });

  it('terceirizado é vínculo, não forma de pagamento', () => {
    // Um terceirizado pode ser mensalista e um próprio pode ser diarista: as
    // duas escolhas são independentes, e o formulário não pode acoplá-las.
    const valores = valido({ employmentType: 'OUTSOURCED', compensationType: 'CLT' });

    expect(employeeFormSchema.safeParse(valores).success).toBe(true);
  });
});

describe('Rótulos de vínculo e remuneração', () => {
  it('traduzem os valores do banco para o que a obra fala', () => {
    expect(getEmploymentTypeLabel('OWN')).toBe('Próprio');
    expect(getEmploymentTypeLabel('OUTSOURCED')).toBe('Terceirizado');
    expect(getCompensationTypeLabel('DAILY')).toBe('Diarista');
  });

  it('só diarista pede diária', () => {
    expect(exigeDiaria('DAILY')).toBe(true);
    expect(exigeDiaria('CLT')).toBe(false);
  });
});
