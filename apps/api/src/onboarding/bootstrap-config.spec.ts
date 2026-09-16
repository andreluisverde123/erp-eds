import { readBootstrapConfig, slugify } from '../../prisma/seed/bootstrap';

/// O seed de instalação nova (`prisma/seed/bootstrap.ts`). O mesmo sistema é
/// instalado para várias construtoras, então ele não pode assumir nome de
/// nenhuma.
describe('readBootstrapConfig', () => {
  const base = {
    BOOTSTRAP_ADMIN_EMAIL: 'Admin@Construtora.com.br',
    BOOTSTRAP_ADMIN_PASSWORD: 'senha-forte-2026',
    BOOTSTRAP_COMPANY_NAME: 'Construtora São João Ltda.',
  };

  it('não faz nada quando o bootstrap não foi pedido', () => {
    expect(readBootstrapConfig({})).toBeNull();
  });

  it('usa o nome informado e deriva o slug dele', () => {
    expect(readBootstrapConfig(base)).toEqual({
      email: 'admin@construtora.com.br',
      password: 'senha-forte-2026',
      name: 'Administrador',
      companyName: 'Construtora São João Ltda.',
      companySlug: 'construtora-sao-joao-ltda',
    });
  });

  it('exige o nome da construtora — não existe nome padrão', () => {
    const { BOOTSTRAP_COMPANY_NAME: _nome, ...semNome } = base;
    expect(() => readBootstrapConfig(semNome)).toThrow(/BOOTSTRAP_COMPANY_NAME/);
    expect(() => readBootstrapConfig({ ...base, BOOTSTRAP_COMPANY_NAME: '   ' })).toThrow(
      /BOOTSTRAP_COMPANY_NAME/,
    );
  });

  it('aceita slug explícito e recusa slug fora do padrão', () => {
    expect(readBootstrapConfig({ ...base, BOOTSTRAP_COMPANY_SLUG: 'eds' })?.companySlug).toBe(
      'eds',
    );
    expect(() => readBootstrapConfig({ ...base, BOOTSTRAP_COMPANY_SLUG: 'EDS Ltda' })).toThrow(
      /BOOTSTRAP_COMPANY_SLUG/,
    );
  });

  it('recusa nome que não gera slug', () => {
    expect(() => readBootstrapConfig({ ...base, BOOTSTRAP_COMPANY_NAME: '!!!' })).toThrow(
      /BOOTSTRAP_COMPANY_SLUG/,
    );
  });
});

describe('slugify', () => {
  it('tira acento, pontuação e espaços das pontas', () => {
    expect(slugify('  Irmãos Araújo & Cia.  ')).toBe('irmaos-araujo-cia');
    expect(slugify('EDS Construtora')).toBe('eds-construtora');
  });
});
