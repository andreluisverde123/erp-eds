import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 5173,
    // O Diário de Obras é servido por subdomínio (`diario.gestaoeds.com.br`).
    // Para exercitar esse caminho localmente basta abrir
    // `http://diario.localhost:5173` — navegadores resolvem qualquer
    // `*.localhost` para 127.0.0.1 sozinhos, sem mexer em `/etc/hosts`. Sem
    // esta lista o Vite recusaria o host com "Blocked request".
    allowedHosts: ['localhost', 'diario.localhost'],
    // Repasse opcional da API na MESMA origem, espelhando o que o nginx faz
    // nos ambientes publicados. Fica desligado por padrão: `.env.development`
    // aponta `VITE_API_URL` para `http://localhost:3000`, então nada é
    // enviado para `/api` no dia a dia.
    //
    // Serve para reproduzir localmente o comportamento de produção sem
    // adivinhação — em particular o cookie do refresh token, que só se
    // comporta igual quando front e API compartilham a origem. Para ligar:
    // `VITE_API_URL=/api` em `.env.development.local` e
    // `REFRESH_COOKIE_PATH=/api/auth` na API.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
