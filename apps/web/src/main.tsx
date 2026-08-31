import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerStaleBundleReload } from './lib/stale-bundle-reload';

// Antes de montar: o pedaço que falha pode ser o da primeira rota, e o ouvinte
// precisa já estar de pé quando isso acontecer.
registerStaleBundleReload();

const container = document.getElementById('root')!;

// O splash do index.html mora dentro de #root e é retirado aqui, na mesma
// tarefa síncrona em que o React monta. Não há piscada branca entre uma coisa
// e outra: o navegador só pinta quando esta função termina, e aí a árvore do
// React já está no lugar.
//
// A remoção é explícita em vez de confiar no createRoot limpar o container
// sozinho — o comportamento existe, mas é detalhe interno, e depender dele
// deixaria o splash preso na tela se mudasse.
container.querySelector('#app-splash')?.remove();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
