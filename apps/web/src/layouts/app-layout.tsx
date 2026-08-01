import { Outlet } from 'react-router';

import { SidebarProvider } from '@/components/sidebar/sidebar-provider';
import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { MobileSidebar } from '@/components/sidebar/mobile-sidebar';
import { SiteHeader } from '@/components/layout/site-header';

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-background">
        <AppSidebar />
        <MobileSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <SiteHeader />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
