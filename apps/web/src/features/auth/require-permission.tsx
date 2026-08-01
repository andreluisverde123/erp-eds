import { Navigate, Outlet } from 'react-router';

import { useAuth } from './context';

interface RequirePermissionProps {
  permission: string;
}

/// Guard de rota por permissão granular — complementa o `ProtectedRoute`
/// (que só checa autenticação). Usado hoje só em `/configuracoes`, mas
/// qualquer rota futura que precise restringir por papel/permissão pode
/// envolver seus filhos com `<RequirePermission permission="...">`.
export function RequirePermission({ permission }: RequirePermissionProps) {
  const { user } = useAuth();

  if (!user?.permissions.includes(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
