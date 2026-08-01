import { useLocation } from 'react-router';

import { useAuth } from '@/features/auth/context';
import { getBreadcrumbTrail } from '@/config/nav';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function PageHeading() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  if (pathname === '/dashboard') {
    const firstName = user?.name.split(' ')[0] ?? '';
    return (
      <p className="truncate text-[18px] font-medium text-foreground">
        {getGreeting()}, <span className="font-bold">{firstName}</span>
      </p>
    );
  }

  const trail = getBreadcrumbTrail(pathname);
  const title = trail[trail.length - 1]?.title ?? '';

  return <p className="truncate text-[18px] font-medium text-foreground">{title}</p>;
}
