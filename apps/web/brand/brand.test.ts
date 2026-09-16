import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contraste } from '../src/features/demo-brand/brand-tokens.ts';
import {
  BRANDS_DIR,
  DEFAULT_BRAND_ID,
  brandCss,
  brandManifest,
  loadBrand,
  publicBrand,
  renderBrandHtml,
} from './brand.ts';

function criarMarca(
  dir: string,
  id: string,
  json: unknown,
  arquivos = ['logo.svg', 'favicon.svg'],
) {
  const pasta = join(dir, id);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'brand.json'), typeof json === 'string' ? json : JSON.stringify(json));
  for (const arquivo of arquivos) writeFileSync(join(pasta, arquivo), '<svg/>');
}

const MARCA_VALIDA = {
  appName: 'Gestão Construtora X',
  shortName: 'CX',
  companyName: 'Construtora X',
  description: 'Sistema da Construtora X.',
  colors: { primary: '#1E5AA8' },
};

describe('marca da EDS', () => {
  // A EDS precisa continuar IDÊNTICA depois de a marca sair do código. Estes são
  // os valores que estavam literais em globals.css, index.html e no manifest.
  it('reproduz exatamente as cores que estavam fixas no código', () => {
    const eds = loadBrand(DEFAULT_BRAND_ID);
    expect(eds.id).toBe('eds');
    expect(eds.colors).toEqual({
      primary: '#ed2124',
      primaryForeground: '#ffffff',
      pending: '#fff1ec',
      pendingForeground: '#ed2124',
    });
  });

  it('mantém os nomes e a descrição', () => {
    const eds = loadBrand(DEFAULT_BRAND_ID);
    expect(eds.appName).toBe('ERP EDS');
    expect(eds.shortName).toBe('EDS');
    expect(eds.companyName).toBe('EDS Construtora');
    expect(eds.description).toBe(
      'Sistema de gestão da construtora EDS — obras, compras, financeiro e pessoal.',
    );
  });
});

describe('toda marca versionada', () => {
  // Uma pasta nova com erro quebraria o build daquele cliente só na hora do
  // deploy. Aqui quebra no CI.
  for (const id of readdirSync(BRANDS_DIR)) {
    it(`"${id}" carrega sem erro`, () => {
      expect(() => loadBrand(id)).not.toThrow();
    });
  }
});

describe('loadBrand', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marcas-'));

  it('deriva as cores opcionais com contraste legível', () => {
    criarMarca(dir, 'amarela', { ...MARCA_VALIDA, colors: { primary: '#FFD600' } });
    const { colors } = loadBrand('amarela', dir);
    expect(colors.primary).toBe('#ffd600');
    // Amarelo pede texto escuro.
    expect(colors.primaryForeground).toBe('#212121');
    expect(contraste(colors.pendingForeground, colors.pending)).toBeGreaterThanOrEqual(4.5);
  });

  it('recusa marca inexistente', () => {
    expect(() => loadBrand('nao-existe', dir)).toThrow(/não encontrada/);
  });

  it('recusa nome de pasta fora do padrão', () => {
    expect(() => loadBrand('../eds', dir)).toThrow(/VITE_BRAND inválida/);
    expect(() => loadBrand('EDS', dir)).toThrow(/VITE_BRAND inválida/);
  });

  it('recusa pasta sem logo ou sem favicon', () => {
    criarMarca(dir, 'sem-logo', MARCA_VALIDA, ['favicon.svg']);
    expect(() => loadBrand('sem-logo', dir)).toThrow(/logo\.svg/);
    criarMarca(dir, 'sem-favicon', MARCA_VALIDA, ['logo.svg']);
    expect(() => loadBrand('sem-favicon', dir)).toThrow(/favicon\.svg/);
  });

  it('recusa JSON inválido e campo vazio', () => {
    criarMarca(dir, 'json-quebrado', '{ appName: ');
    expect(() => loadBrand('json-quebrado', dir)).toThrow(/JSON válido/);
    criarMarca(dir, 'sem-nome', { ...MARCA_VALIDA, appName: '  ' });
    expect(() => loadBrand('sem-nome', dir)).toThrow(/appName/);
  });

  it('recusa cor que não é hexadecimal', () => {
    criarMarca(dir, 'cor-errada', { ...MARCA_VALIDA, colors: { primary: 'azul' } });
    expect(() => loadBrand('cor-errada', dir)).toThrow(/colors\.primary/);
    criarMarca(dir, 'cor-errada-2', {
      ...MARCA_VALIDA,
      colors: { primary: '#123456', pending: 'rgb(1,2,3)' },
    });
    expect(() => loadBrand('cor-errada-2', dir)).toThrow(/colors\.pending/);
  });

  it('não leva o caminho de disco para o bundle', () => {
    criarMarca(dir, 'publica', MARCA_VALIDA);
    const publica = publicBrand(loadBrand('publica', dir));
    expect(publica).not.toHaveProperty('dir');
    expect(publica.logo).toBe('/brand/logo.svg');
  });
});

describe('saídas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marcas-'));
  criarMarca(dir, 'x', { ...MARCA_VALIDA, companyName: 'Irmãos <Silva> & "Filhos"' });
  const marca = loadBrand('x', dir);

  it('preenche todos os marcadores do index.html e escapa o texto', () => {
    const html = renderBrandHtml(
      '<title>%BRAND_APP_NAME%</title><meta content="%BRAND_COMPANY_NAME%">' +
        '<style>%BRAND_CSS%</style><img src="%BRAND_LOGO%">',
      marca,
    );
    expect(html).toContain('<title>Gestão Construtora X</title>');
    expect(html).toContain('Irmãos &lt;Silva&gt; &amp; &quot;Filhos&quot;');
    expect(html).toContain('--brand-primary:#1e5aa8;');
    expect(html).toContain('src="/brand/logo.svg"');
    expect(html).not.toMatch(/%BRAND_/);
  });

  it('recusa marcador desconhecido', () => {
    expect(() => renderBrandHtml('%BRAND_INEXISTENTE%', marca)).toThrow(/não existe/);
  });

  it('a folha de cores declara as quatro variáveis', () => {
    const css = brandCss(marca);
    for (const nome of [
      '--brand-primary:',
      '--brand-primary-foreground:',
      '--brand-pending:',
      '--brand-pending-foreground:',
    ]) {
      expect(css).toContain(nome);
    }
  });

  it('o manifest usa o nome, a cor e os ícones da marca', () => {
    const manifest = JSON.parse(brandManifest(marca));
    expect(manifest.name).toBe('Gestão Construtora X');
    expect(manifest.short_name).toBe('CX');
    expect(manifest.theme_color).toBe('#1e5aa8');
    expect(manifest.icons.map((icone: { src: string }) => icone.src)).toEqual([
      '/brand/favicon.svg',
      '/brand/logo.svg',
    ]);
  });
});
