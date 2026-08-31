import { createBrowserRouter, Navigate } from 'react-router';

import { DiarioGuard } from './layout/diario-guard';
import { DiarioLayout } from './layout/diario-layout';
import {
  DiarioHomePage,
  DiarioLoginPage,
  DiarioNovoRelatorioPage,
  DiarioObraDetailPage,
  DiarioObrasPage,
  DiarioPerfilPage,
  DiarioRdoPage,
  DiarioRelatoriosPage,
  Screen,
  SenhaTemporariaPage,
} from './router-pages';

/// Rotas do Diário. Curtas de propósito — `/obras`, `/relatorios`, `/perfil` —
/// porque no subdomínio elas já nascem sob `diario.gestaoeds.com.br`, e
/// repetir "diario" no caminho seria dizer a mesma coisa duas vezes.
///
/// O `basename` vem de `resolveAppEnvironment()`: `/` quando a entrada é o
/// subdomínio, `/diario` quando é o prefixo de caminho. Nenhum `<Link>` deste
/// arquivo precisa saber qual dos dois está valendo.
export function createDiarioRouter(basename: string) {
  return createBrowserRouter(
    [
      {
        path: '/entrar',
        element: (
          <Screen>
            <DiarioLoginPage />
          </Screen>
        ),
      },
      {
        path: '/senha-temporaria',
        element: (
          <Screen>
            <SenhaTemporariaPage />
          </Screen>
        ),
      },
      {
        element: <DiarioGuard />,
        children: [
          {
            path: '/',
            element: <DiarioLayout />,
            children: [
              {
                index: true,
                element: (
                  <Screen>
                    <DiarioHomePage />
                  </Screen>
                ),
              },
              {
                path: 'obras',
                element: (
                  <Screen>
                    <DiarioObrasPage />
                  </Screen>
                ),
              },
              {
                path: 'obras/:id',
                element: (
                  <Screen>
                    <DiarioObraDetailPage />
                  </Screen>
                ),
              },
              {
                path: 'relatorios',
                element: (
                  <Screen>
                    <DiarioRelatoriosPage />
                  </Screen>
                ),
              },
              {
                path: 'relatorios/novo',
                element: (
                  <Screen>
                    <DiarioNovoRelatorioPage />
                  </Screen>
                ),
              },
              // `relatorios/novo` ANTES de `relatorios/:id`: como rota
              // estática ela vence o parâmetro, mas a ordem explícita evita a
              // dúvida de quem for mexer aqui depois.
              {
                path: 'relatorios/:id',
                element: (
                  <Screen>
                    <DiarioRdoPage />
                  </Screen>
                ),
              },
              {
                path: 'perfil',
                element: (
                  <Screen>
                    <DiarioPerfilPage />
                  </Screen>
                ),
              },
              { path: '*', element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
    { basename },
  );
}
