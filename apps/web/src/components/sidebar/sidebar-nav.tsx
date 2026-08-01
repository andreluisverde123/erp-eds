import { Separator } from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { navEntries, type NavLink } from '@/config/nav';
import { SidebarNavLink } from '@/components/sidebar/sidebar-nav-link';

export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useAuth();

  function isVisible(item: NavLink) {
    return !item.permission || (user?.permissions.includes(item.permission) ?? false);
  }

  return (
    <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
      {navEntries.map((entry, index) => {
        if (entry.type === 'link') {
          return isVisible(entry) ? (
            <SidebarNavLink key={entry.path} item={entry} collapsed={collapsed} />
          ) : null;
        }

        const items = entry.items.filter(isVisible);
        if (items.length === 0) return null;

        return (
          <div key={entry.label} className="flex flex-col gap-3">
            {collapsed ? (
              index > 0 && <Separator />
            ) : (
              <div className="flex items-center gap-2 px-2.5">
                <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {entry.label}
                </span>
                <Separator className="flex-1" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <SidebarNavLink key={item.path} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
