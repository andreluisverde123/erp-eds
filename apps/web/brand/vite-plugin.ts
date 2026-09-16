import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv, type Plugin } from 'vite';

import {
  BRAND_ASSETS,
  BRAND_PUBLIC_PATHS,
  DEFAULT_BRAND_ID,
  brandManifest,
  loadBrand,
  publicBrand,
  renderBrandHtml,
  type Brand,
} from './brand.ts';

/// Qual marca este build usa.
///
/// `VITE_BRAND` do ambiente do processo (build arg do Docker/Railway) ou dos
/// `.env*` do app. Sem nenhuma, a marca padrão — o que mantém `npm run dev`, os
/// testes e o build do CI funcionando sem configuração. Quem impede uma
/// instalação publicada de sair sem marca escolhida é o `web.Dockerfile`, que
/// exige a variável.
export function resolveBrandId(mode: string, root: string): string {
  const env = loadEnv(mode, root, 'VITE_');
  return process.env.VITE_BRAND?.trim() || env.VITE_BRAND?.trim() || DEFAULT_BRAND_ID;
}

/// Aplica a marca da instalação:
///
/// - `__APP_BRAND__` no bundle (nomes, caminhos e cores);
/// - marcadores `%BRAND_*%` do `index.html` (título, descrição, cor, splash e
///   as variáveis CSS de cor);
/// - `/manifest.webmanifest`, `/brand/logo.svg` e `/brand/favicon.svg`,
///   servidos em desenvolvimento e publicados no build.
export function brandPlugin(): Plugin {
  let brand: Brand;

  const arquivos = (): Record<string, { source: string | Buffer; type: string }> => ({
    [BRAND_PUBLIC_PATHS.manifest]: {
      source: brandManifest(brand),
      type: 'application/manifest+json',
    },
    [BRAND_PUBLIC_PATHS.logo]: {
      source: readFileSync(join(brand.dir, BRAND_ASSETS.logo)),
      type: 'image/svg+xml',
    },
    [BRAND_PUBLIC_PATHS.favicon]: {
      source: readFileSync(join(brand.dir, BRAND_ASSETS.favicon)),
      type: 'image/svg+xml',
    },
  });

  return {
    name: 'erp-brand',

    config(userConfig, { mode }) {
      brand = loadBrand(resolveBrandId(mode, userConfig.root ?? process.cwd()));
      return {
        define: { __APP_BRAND__: JSON.stringify(publicBrand(brand)) },
      };
    },

    configResolved(config) {
      config.logger.info(`Marca da instalação: ${brand.id} (${brand.appName})`);
    },

    transformIndexHtml: {
      order: 'pre',
      handler: (html) => renderBrandHtml(html, brand),
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const caminho = req.url?.split('?')[0] ?? '';
        const arquivo = arquivos()[caminho];
        if (!arquivo) return next();
        res.setHeader('Content-Type', arquivo.type);
        res.end(arquivo.source);
      });
    },

    generateBundle() {
      for (const [caminho, arquivo] of Object.entries(arquivos())) {
        this.emitFile({
          type: 'asset',
          fileName: caminho.replace(/^\//, ''),
          source: arquivo.source,
        });
      }
    },
  };
}
