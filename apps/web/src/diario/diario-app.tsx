import { useMemo } from 'react';
import { RouterProvider } from 'react-router';

import { createDiarioRouter } from './router';

/// Casca do Diário. O router é criado uma vez (`useMemo`): recriá-lo a cada
/// render descartaria o histórico de navegação a cada mudança de estado do pai.
export function DiarioApp({ basename }: { basename: string }) {
  const router = useMemo(() => createDiarioRouter(basename), [basename]);
  return <RouterProvider router={router} />;
}
