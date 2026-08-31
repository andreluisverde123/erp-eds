import { LogOut, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';

import { CompanyLogo } from '@/components/company-logo';
import { useAuth } from '@/features/auth/context';

import { initialsOf } from '../components/initials';

/// Cabeçalho fixo. Deliberadamente magro: numa tela de 375×667 cada pixel de
/// cromo é um pixel a menos de obra na lista. Só marca, título e a porta de
/// saída da conta.
export function DiarioHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/entrar', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
        <CompanyLogo className="h-6 w-auto max-w-none shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            Diário de Obras
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Conta"
            className="flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {user ? initialsOf(user.name) : <UserRound className="size-4" />}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void onLogout()}>
              <LogOut className="size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
