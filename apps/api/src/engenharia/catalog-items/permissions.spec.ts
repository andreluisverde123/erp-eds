import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../common/tenancy/default-roles';

const codigos = DEFAULT_PERMISSIONS.map((p) => p.code);
const papel = (nome: string) => DEFAULT_ROLES.find((r) => r.name === nome)!;

/// As permissões do catálogo entram no catálogo padrão E nos papéis — os dois,
/// senão uma empresa criada pelo onboarding nasce sem acesso à tela nova.
describe('Permissões do catálogo no seed padrão', () => {
  it('as duas existem', () => {
    expect(codigos).toContain('catalogo.view');
    expect(codigos).toContain('catalogo.manage');
  });

  it('Administração tem tudo, por construção', () => {
    expect(papel('Administrador').permissionCodes).toContain('catalogo.manage');
  });

  it('Engenharia MANTÉM o catálogo', () => {
    // É quem conhece o material da obra.
    expect(papel('Engenharia').permissionCodes).toContain('catalogo.manage');
  });

  it('Compras CONSULTA, mas não mantém', () => {
    // Compras usa o insumo na solicitação; quem define o que existe é
    // Engenharia. Separar isso é o que impede o catálogo de virar depósito de
    // grafias de pedido.
    const compras = papel('Compras').permissionCodes;
    expect(compras).toContain('catalogo.view');
    expect(compras).not.toContain('catalogo.manage');
  });

  it('quem não precisa não recebe', () => {
    for (const nome of ['Financeiro', 'RH']) {
      expect(papel(nome).permissionCodes).not.toContain('catalogo.manage');
    }
  });
});
