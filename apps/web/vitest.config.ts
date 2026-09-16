import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

import { DEFAULT_BRAND_ID, loadBrand, publicBrand } from './brand/brand.ts';

/// Configuração PRÓPRIA, separada de `vite.config.ts`.
///
/// Juntar as duas exigiria que o config do app carregasse tipos do Vitest para
/// o `tsc -b` do build passar — a configuração de teste passaria a ser
/// pré-requisito da configuração de produção. Aqui elas são independentes:
/// o `vite build` não sabe que testes existem.
export default defineConfig({
  plugins: [react()],
  // Os testes rodam sempre com a marca padrão, para as asserções de texto não
  // dependerem de qual `VITE_BRAND` está no ambiente de quem os executa.
  define: { __APP_BRAND__: JSON.stringify(publicBrand(loadBrand(DEFAULT_BRAND_ID))) },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  test: {
    // jsdom, e não `happy-dom`: as telas do Diário dependem de
    // `document.visibilityState` e dos eventos de saída de página (o autosave
    // descarrega neles), e o jsdom os implementa com mais fidelidade.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'brand/**/*.test.ts'],
  },
});
