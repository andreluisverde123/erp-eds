import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserX, Users } from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import {
  getSiteTeam,
  listSiteTeamCandidates,
  replaceSiteTeam,
  SITE_ROLE_LABEL,
  type SiteAssignmentRole,
  type SiteTeamMember,
} from '../site-team';

const ROLES = Object.entries(SITE_ROLE_LABEL) as [SiteAssignmentRole, string][];

/// EQUIPE NO DIÁRIO: quem enxerga esta obra no Diário de Obras, e como
/// (engenheiro ou fiscal).
///
/// Antes só dava para pôr alguém na obra escolhendo-o como Responsável, que
/// entra como engenheiro e é uma pessoa só. Fiscal, e qualquer segunda
/// pessoa, dependia de script. A API (`/diario/acessos`) já existia; faltava a
/// tela.
///
/// Cada mudança salva na hora. A API SUBSTITUI a equipe inteira, então todo
/// salvamento manda a lista completa, a partir do que está na tela.
export function SiteTeamCard({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const teamKey = ['diario', 'acessos', 'obra', siteId];

  const {
    data: team,
    isLoading,
    isError,
  } = useQuery({
    queryKey: teamKey,
    queryFn: () => getSiteTeam(siteId),
  });
  const { data: candidates } = useQuery({
    queryKey: ['diario', 'acessos', 'candidatos'],
    queryFn: listSiteTeamCandidates,
    staleTime: 60_000,
  });

  const [novoUsuario, setNovoUsuario] = useState('');
  const [novoPapel, setNovoPapel] = useState<SiteAssignmentRole>('INSPECTOR');
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (members: SiteTeamMember[]) =>
      replaceSiteTeam(
        siteId,
        members.map(({ userId, role }) => ({ userId, role })),
      ),
    onSuccess: (atualizada) => queryClient.setQueryData(teamKey, atualizada),
    onError: (error) =>
      setErro(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a equipe. Tente de novo.',
      ),
  });

  const membros = team ?? [];
  const naEquipe = new Set(membros.map((m) => m.userId));
  const disponiveis = (candidates ?? []).filter((c) => !naEquipe.has(c.id));

  function gravar(members: SiteTeamMember[]) {
    setErro(null);
    salvar.mutate(members);
  }

  function adicionar() {
    const pessoa = disponiveis.find((c) => c.id === novoUsuario);
    if (!pessoa) return;
    gravar([
      ...membros,
      {
        userId: pessoa.id,
        name: pessoa.name,
        email: pessoa.email,
        isActive: true,
        role: novoPapel,
      },
    ]);
    setNovoUsuario('');
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">Equipe no Diário</h2>
          <p className="text-sm text-muted-foreground">
            Quem enxerga esta obra no Diário de Obras. O fiscal preenche e acompanha os RDOs, mas só
            entra no Diário.
          </p>
        </div>

        {erro && (
          <Alert variant="destructive">
            <AlertTitle>{erro}</AlertTitle>
          </Alert>
        )}

        {isError && (
          <p className="text-sm text-destructive">Não foi possível carregar a equipe da obra.</p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Carregando a equipe...</p>}

        {team && membros.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            <Users className="size-4" />
            Ninguém acompanha esta obra no Diário ainda.
          </div>
        )}

        {membros.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {membros.map((membro) => (
              <li
                key={membro.userId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {membro.name}
                    {!membro.isActive && <Badge variant="secondary">Desativado</Badge>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{membro.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={membro.role}
                    disabled={salvar.isPending}
                    onValueChange={(role) =>
                      gravar(
                        membros.map((m) =>
                          m.userId === membro.userId
                            ? { ...m, role: role as SiteAssignmentRole }
                            : m,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-[150px]" aria-label={`Papel de ${membro.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={salvar.isPending}
                    onClick={() => gravar(membros.filter((m) => m.userId !== membro.userId))}
                    aria-label={`Tirar ${membro.name} da obra`}
                  >
                    <UserX />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {team && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={novoUsuario} onValueChange={setNovoUsuario}>
              <SelectTrigger className="sm:flex-1" aria-label="Pessoa">
                <SelectValue
                  placeholder={
                    disponiveis.length === 0
                      ? 'Ninguém mais com acesso ao Diário'
                      : 'Adicionar pessoa à equipe'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={novoPapel}
              onValueChange={(role) => setNovoPapel(role as SiteAssignmentRole)}
            >
              <SelectTrigger className="sm:w-[150px]" aria-label="Papel na obra">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={adicionar} disabled={!novoUsuario || salvar.isPending}>
              <Plus />
              Adicionar
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Só aparece aqui quem tem o Diário liberado: perfil com acesso ao Diário e o interruptor
          “Diário de Obras” ligado em Administração → Usuários.
        </p>
      </CardContent>
    </Card>
  );
}
