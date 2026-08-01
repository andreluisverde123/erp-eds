import { PanelLeft } from 'lucide-react';
import { Button, useIsMobile } from '@repo/ui';

import { useSidebar } from '@/components/sidebar/sidebar-context';
import { PageHeading } from '@/components/layout/page-heading';
import { GlobalSearch } from '@/components/layout/global-search';
import { CommandPalette } from '@/components/layout/command-palette';
import { HeaderCta } from '@/components/layout/header-cta';
import { UserMenu } from '@/components/layout/user-menu';

export function SiteHeader() {
  const { toggleCollapsed, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-5 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => (isMobile ? setMobileOpen(true) : toggleCollapsed())}
        >
          <PanelLeft className="size-[18px]" strokeWidth={1.75} />
          <span className="sr-only">Alternar menu lateral</span>
        </Button>

        <PageHeading />
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        {!isMobile && <GlobalSearch />}
        {!isMobile && <HeaderCta />}
        <UserMenu />
      </div>

      <CommandPalette />
    </header>
  );
}
