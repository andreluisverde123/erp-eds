import { normalizeCatalogKey } from './catalog-key';

/// A chave normalizada tem DOIS papéis: é o que a busca consulta e é o que
/// define duplicidade (`@@unique([companyId, searchKey])`). O segundo papel é
/// o que exige colapsar espaços.
describe('Chave do insumo', () => {
  it('ignora caixa', () => {
    expect(normalizeCatalogKey('CIMENTO CP II')).toBe(normalizeCatalogKey('cimento cp ii'));
  });

  it('ignora acento', () => {
    expect(normalizeCatalogKey('Areia média')).toBe('areia media');
  });

  it('colapsa espaço interno e apara as pontas', () => {
    // Com dois espaços, "Cimento  CP II" entraria como um segundo cadastro —
    // exatamente o que a unique existe para impedir.
    expect(normalizeCatalogKey('  Cimento   CP  II  ')).toBe('cimento cp ii');
  });

  it('NÃO remove pontuação, de propósito', () => {
    // "Cimento CP-II" e "Cimento CP II" continuam sendo dois cadastros. Remover
    // pontuação seria um passo em direção a casamento por similaridade, e quem
    // decide se dois nomes parecidos são o mesmo material é o operador.
    expect(normalizeCatalogKey('Cimento CP-II')).not.toBe(normalizeCatalogKey('Cimento CP II'));
  });

  it('é estável — normalizar duas vezes dá o mesmo', () => {
    const uma = normalizeCatalogKey('Aço CA-50 10mm');
    expect(normalizeCatalogKey(uma)).toBe(uma);
  });
});
