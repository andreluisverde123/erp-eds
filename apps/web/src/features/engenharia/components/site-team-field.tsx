import { useQuery } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import {
  listSiteTeamCandidates,
  SITE_ROLE_LABEL,
  type SiteAssignmentRole,
} from '../site-team';

export interface SiteTeamEntry {
  userId: string;
  role: SiteAssignmentRole;
}

/// Quem acompanha esta obra no Diário de Obras.
///
/// **Por que aqui, e não só dentro do Diário.** A API de acesso existia desde
/// o começo, mas nenhuma tela a consumia — os vínculos só nasciam por script.
/// A obra é onde a pessoa naturalmente pensa "quem trabalha nisso", e é no
/// cadastro dela que a equipe faz sentido.
///
/// A lista de candidatos vem da API e já está filtrada: só aparece quem passa
/// pelas DUAS portas do Diário — o papel concede `diario.access` e o
/// interruptor da pessoa está ligado. Oferecer alguém fora disso criaria um
/// vínculo que não funciona.
export function SiteTeamField({
  value,
  onChange,
  disabled = false,
}: {
  value: SiteTeamEntry[];
  onChange: (entries: SiteTeamEntry[]) => void;
  disabled?: boolean;
}) {
  const { data: candidatos, isLoading } = useQuery({
    queryKey: ['diario', 'acessos', 'candidatos'],
    queryFn: listSiteTeamCandidates,
    staleTime: 60_000,
  });

  const porId = new Map((candidatos ?? []).map((c) => [c.id, c]));
  const disponiveis = (candidatos ?? []).filter(
    (c) => !value.some((entrada) => entrada.userId === c.id),
  );

  function adicionar(userId: string) {
    // ENGINEER como padrão: é o vínculo mais comum, e trocar para fiscal é um
    // toque. Nascer sem papel obrigaria dois passos para o caso frequente.
    onChange([...value, { userId, role: 'ENGINEER' }]);
  }

  function trocarPapel(userId: string, role: SiteAssignmentRole) {
    onChange(value.map((e) => (e.userId === userId ? { ...e, role } : e)));
  }

  function remover(userId: string) {
    onChange(value.filter((e) => e.userId !== userId));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Equipe no Diário de Obras</Label>
      <p className="-mt-1 text-xs text-muted-foreground">
        Quem enxerga esta obra e preenche os relatórios diários. Sem ninguém aqui, a obra não
        aparece para nenhum usuário no Diário.
      </p>

      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {value.map((entrada) => {
            const pessoa = porId.get(entrada.userId);
            return (
              <li
                key={entrada.userId}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {/* Nome ausente da lista de candidatos: a pessoa perdeu o
                        acesso ao Diário depois de ter sido vinculada. O
                        vínculo continua no banco e precisa ficar visível —
                        escondê-lo faria o formulário salvar uma equipe
                        diferente da que a tela mostra. */}
                    {pessoa?.name ?? 'Usuário sem acesso ao Diário'}
                  </p>
                  {pessoa && (
                    <p className="truncate text-xs text-muted-foreground">{pessoa.email}</p>
                  )}
                </div>

                <Select
                  value={entrada.role}
                  onValueChange={(papel) => trocarPapel(entrada.userId, papel as SiteAssignmentRole)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 w-[150px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SITE_ROLE_LABEL).map(([papel, rotulo]) => (
                      <SelectItem key={papel} value={papel}>
                        {rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  aria-label={`Remover ${pessoa?.name ?? 'usuário'} da equipe`}
                  onClick={() => remover(entrada.userId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Select
        // `key` força o gatilho a voltar para o placeholder depois de cada
        // escolha: sem isso ele ficaria mostrando o último nome adicionado,
        // como se aquela pessoa estivesse selecionada.
        key={value.length}
        value=""
        onValueChange={adicionar}
        disabled={disabled || isLoading || disponiveis.length === 0}
      >
        <SelectTrigger className="w-full">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UserPlus className="size-4" />
            <SelectValue
              placeholder={
                isLoading
                  ? 'Carregando…'
                  : disponiveis.length === 0
                    ? candidatos?.length
                      ? 'Todos já estão na equipe'
                      : 'Ninguém com acesso ao Diário'
                    : 'Adicionar pessoa à equipe'
              }
            />
          </span>
        </SelectTrigger>
        <SelectContent>
          {disponiveis.map((pessoa) => (
            <SelectItem key={pessoa.id} value={pessoa.id}>
              <span>{pessoa.name}</span>
              <span className="text-muted-foreground">{pessoa.email}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {candidatos?.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Ninguém tem acesso ao Diário ainda. Libere em Administração → Usuários, no interruptor
          “Diário de Obras”.
        </p>
      )}
    </div>
  );
}
