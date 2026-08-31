import { effectivePermissions } from './effective-permissions';

const DO_PAPEL_ENGENHARIA = [
  'dashboard.view',
  'engenharia.view',
  'compras.request',
  'diario.access',
  'diario.report.manage',
];

describe('effectivePermissions', () => {
  it('com o interruptor ligado, entrega o que o papel concede', () => {
    expect(effectivePermissions(DO_PAPEL_ENGENHARIA, { diarioEnabled: true })).toEqual(
      DO_PAPEL_ENGENHARIA,
    );
  });

  it('com o interruptor desligado, tira SÓ o Diário', () => {
    const efetivas = effectivePermissions(DO_PAPEL_ENGENHARIA, { diarioEnabled: false });

    // O resto do ERP não pode ser afetado: quem trabalha em compras e
    // engenharia continua trabalhando.
    expect(efetivas).toEqual(['dashboard.view', 'engenharia.view', 'compras.request']);
  });

  it('tira TODAS as permissões do Diário, não só a de entrar', () => {
    const efetivas = effectivePermissions(
      ['diario.access', 'diario.report.manage', 'diario.manage_access'],
      { diarioEnabled: false },
    );

    // Deixar `diario.report.manage` para trás seria pior que inútil: a pessoa
    // não entraria pela tela, mas a rota de escrita continuaria aceitando.
    expect(efetivas).toEqual([]);
  });

  it('ligado NÃO concede o que o papel não deu', () => {
    const semDiario = ['dashboard.view', 'financeiro.view'];

    // A direção única é o que impede este campo de virar uma segunda tabela de
    // permissões, invisível na tela de perfis.
    expect(effectivePermissions(semDiario, { diarioEnabled: true })).toEqual(semDiario);
  });

  it('não confunde prefixo parecido com o do Diário', () => {
    const parecidas = ['diarios.view', 'diario_extra.view', 'relatorio.diario.view'];

    expect(effectivePermissions(parecidas, { diarioEnabled: false })).toEqual(parecidas);
  });

  it('remove duplicatas vindas de papéis diferentes', () => {
    const doisPapeis = ['dashboard.view', 'dashboard.view', 'diario.access'];

    expect(effectivePermissions(doisPapeis, { diarioEnabled: true })).toEqual([
      'dashboard.view',
      'diario.access',
    ]);
  });
});
