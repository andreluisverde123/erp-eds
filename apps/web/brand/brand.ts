import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  escurecerAteLer,
  misturar,
  normalizarHex,
  textoSobre,
} from '../src/features/demo-brand/brand-tokens.ts';

/// A MARCA de uma instalação: nome, textos, cores e os arquivos de logo.
///
/// O sistema é o mesmo para todas as construtoras; cada instalação escolhe a
/// sua pasta em `apps/web/brands/<id>/` pela variável de build `VITE_BRAND`.
/// Vender para um cliente novo é criar uma pasta, não editar código.
///
/// A pasta tem três arquivos, todos obrigatórios:
///
/// - `brand.json`  — nomes, descrição e cores (ver `BrandFile`);
/// - `logo.svg`    — assinatura horizontal: barra lateral, login, splash;
/// - `favicon.svg` — símbolo quadrado: aba do navegador e ícone do app.
///
/// Este módulo roda no NODE, na configuração do Vite: o que ele produz entra no
/// `index.html`, no `manifest.webmanifest` e numa constante do bundle
/// (`__APP_BRAND__`). Nada disso depende de sessão nem de banco — é o que o
/// usuário vê antes de fazer login.
///
/// O logo e o nome que a empresa grava em Configurações continuam valendo por
/// cima disto depois do login (`useBrand`).

export const DEFAULT_BRAND_ID = 'eds';

export const BRANDS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../brands');

export const BRAND_ASSETS = {
  logo: 'logo.svg',
  favicon: 'favicon.svg',
} as const;

/// Caminhos PÚBLICOS dos arquivos da marca, iguais em toda instalação. O
/// plugin serve (dev) e publica (build) cada arquivo da pasta nesses endereços.
export const BRAND_PUBLIC_PATHS = {
  logo: '/brand/logo.svg',
  favicon: '/brand/favicon.svg',
  manifest: '/manifest.webmanifest',
} as const;

/// Formato do `brand.json`.
interface BrandFile {
  /// Nome do sistema: aba do navegador, login, splash, manifest.
  appName: string;
  /// Nome curto: ícone do app instalado no celular.
  shortName: string;
  /// Nome da construtora: rodapé da barra lateral antes de a empresa gravar o
  /// dela em Configurações.
  companyName: string;
  /// Descrição institucional: meta description e manifest.
  description: string;
  colors: {
    /// Cor da marca. Botões, item ativo do menu, foco.
    primary: string;
    /// Texto sobre a cor da marca. Opcional: sem ele, o sistema escolhe entre
    /// branco e o tom escuro pelo contraste real.
    primaryForeground?: string;
    /// Fundo das etiquetas de pendência. Opcional: sem ele, é um lavado da
    /// cor da marca.
    pending?: string;
    /// Texto das etiquetas de pendência. Opcional: sem ele, a cor da marca
    /// escurecida até ser legível sobre o lavado.
    pendingForeground?: string;
  };
}

export interface BrandColors {
  primary: string;
  primaryForeground: string;
  pending: string;
  pendingForeground: string;
}

/// O que o bundle do navegador recebe (`__APP_BRAND__`).
export interface PublicBrand {
  id: string;
  appName: string;
  shortName: string;
  companyName: string;
  description: string;
  logo: string;
  favicon: string;
  colors: BrandColors;
}

export interface Brand extends PublicBrand {
  /// Pasta da marca no disco.
  dir: string;
}

const ID_VALIDO = /^[a-z0-9][a-z0-9-]*$/;

/// Carrega e valida a marca. Qualquer problema é ERRO, com a causa: uma
/// instalação publicada com a marca errada ou pela metade é pior que um build
/// que não termina — e um build que falha no Railway mantém no ar a versão
/// anterior.
export function loadBrand(id: string, brandsDir: string = BRANDS_DIR): Brand {
  const marca = id.trim();
  if (!ID_VALIDO.test(marca)) {
    throw new Error(
      `VITE_BRAND inválida: "${id}". Use o nome da pasta em apps/web/brands/ ` +
        '(letras minúsculas, números e hífen).',
    );
  }

  const dir = join(brandsDir, marca);
  if (!existsSync(dir)) {
    throw new Error(`Marca "${marca}" não encontrada: a pasta ${dir} não existe.`);
  }

  for (const arquivo of ['brand.json', BRAND_ASSETS.logo, BRAND_ASSETS.favicon]) {
    if (!existsSync(join(dir, arquivo))) {
      throw new Error(`Marca "${marca}": falta o arquivo ${arquivo} em ${dir}.`);
    }
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(join(dir, 'brand.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Marca "${marca}": brand.json não é um JSON válido (${String(error)}).`, {
      cause: error,
    });
  }

  const arquivo = validarArquivo(marca, bruto);

  return {
    id: marca,
    dir,
    appName: arquivo.appName,
    shortName: arquivo.shortName,
    companyName: arquivo.companyName,
    description: arquivo.description,
    logo: BRAND_PUBLIC_PATHS.logo,
    favicon: BRAND_PUBLIC_PATHS.favicon,
    colors: resolverCores(marca, arquivo.colors),
  };
}

function validarArquivo(marca: string, bruto: unknown): BrandFile {
  const erro = (campo: string) =>
    new Error(`Marca "${marca}": o campo "${campo}" do brand.json está ausente ou vazio.`);

  if (typeof bruto !== 'object' || bruto === null) throw erro('(raiz)');
  const dados = bruto as Record<string, unknown>;

  for (const campo of ['appName', 'shortName', 'companyName', 'description'] as const) {
    if (typeof dados[campo] !== 'string' || (dados[campo] as string).trim() === '') {
      throw erro(campo);
    }
  }

  const cores = dados.colors as Record<string, unknown> | undefined;
  if (typeof cores !== 'object' || cores === null) throw erro('colors');
  if (typeof cores.primary !== 'string') throw erro('colors.primary');

  return {
    appName: (dados.appName as string).trim(),
    shortName: (dados.shortName as string).trim(),
    companyName: (dados.companyName as string).trim(),
    description: (dados.description as string).trim(),
    colors: cores as BrandFile['colors'],
  };
}

/// As quatro cores de marca. As opcionais são derivadas da principal pela mesma
/// aritmética do painel de demonstração, que já garante contraste legível.
export function resolverCores(marca: string, cores: BrandFile['colors']): BrandColors {
  const hex = (campo: string, valor: string): string => {
    const normalizado = normalizarHex(valor);
    if (!normalizado) {
      throw new Error(
        `Marca "${marca}": "colors.${campo}" precisa ser uma cor hexadecimal (ex.: #1E5AA8), ` +
          `e veio "${valor}".`,
      );
    }
    return normalizado;
  };

  const opcional = (campo: string, valor: unknown): string | null => {
    if (valor === undefined || valor === null || valor === '') return null;
    if (typeof valor !== 'string') return hex(campo, String(valor));
    return hex(campo, valor);
  };

  const primary = hex('primary', cores.primary);
  const pending = opcional('pending', cores.pending) ?? misturar(primary, '#ffffff', 0.92);

  return {
    primary,
    primaryForeground:
      opcional('primaryForeground', cores.primaryForeground) ?? textoSobre(primary),
    pending,
    pendingForeground:
      opcional('pendingForeground', cores.pendingForeground) ?? escurecerAteLer(primary, pending),
  };
}

export function publicBrand(brand: Brand): PublicBrand {
  // Sem `dir`: caminho de disco da máquina de build não tem o que fazer no
  // bundle.
  const { dir: _dir, ...publica } = brand;
  return publica;
}

/// Variáveis CSS lidas por `packages/ui/src/styles/globals.css`. Nomes
/// `--brand-*`, e não os tokens do design system: a folha de estilo continua
/// sendo a dona de `--primary` e companhia, e só busca o VALOR aqui.
export function brandCss(brand: Brand): string {
  const { colors } = brand;
  return (
    ':root{' +
    `--brand-primary:${colors.primary};` +
    `--brand-primary-foreground:${colors.primaryForeground};` +
    `--brand-pending:${colors.pending};` +
    `--brand-pending-foreground:${colors.pendingForeground};` +
    '}'
  );
}

export function brandManifest(brand: Brand): string {
  const manifest = {
    name: brand.appName,
    short_name: brand.shortName,
    description: brand.description,
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: brand.colors.primary,
    categories: ['business', 'productivity'],
    icons: [
      { src: brand.favicon, type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: brand.logo, type: 'image/svg+xml', sizes: 'any', purpose: 'maskable' },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/// Preenche os marcadores `%BRAND_*%` do `index.html`. Um marcador que sobrar
/// é erro: significa que alguém acrescentou um no HTML sem ensiná-lo aqui, e a
/// página sairia com o texto cru.
export function renderBrandHtml(html: string, brand: Brand): string {
  const valores: Record<string, string> = {
    BRAND_APP_NAME: escaparHtml(brand.appName),
    BRAND_SHORT_NAME: escaparHtml(brand.shortName),
    BRAND_COMPANY_NAME: escaparHtml(brand.companyName),
    BRAND_DESCRIPTION: escaparHtml(brand.description),
    BRAND_COLOR: brand.colors.primary,
    BRAND_LOGO: brand.logo,
    BRAND_FAVICON: brand.favicon,
    BRAND_MANIFEST: BRAND_PUBLIC_PATHS.manifest,
    BRAND_CSS: brandCss(brand),
  };

  return html.replace(/%(BRAND_[A-Z_]+)%/g, (marcador, nome: string) => {
    const valor = valores[nome];
    if (valor === undefined) {
      throw new Error(`index.html usa o marcador ${marcador}, que não existe.`);
    }
    return valor;
  });
}
