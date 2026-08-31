import { RouterProvider } from 'react-router';

import { router } from '@/router';

/// Casca do ERP. Existe como arquivo próprio para o `App` poder carregá-la
/// sob demanda: sem isso, abrir o Diário no celular baixaria junto o layout,
/// a sidebar e o mapa de rotas do sistema administrativo inteiro — telas que
/// aquele usuário não vai abrir naquela sessão.
export function ErpApp() {
  return <RouterProvider router={router} />;
}
