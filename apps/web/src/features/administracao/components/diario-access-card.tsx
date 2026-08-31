import { HardHat } from 'lucide-react';
import { Card, CardContent, Switch } from '@repo/ui';

import { useUpdateSystemUserDiarioAccess } from '@/features/administracao/hooks/use-system-user-mutations';
import type { SystemUser } from '@/features/administracao/types';

/// Interruptor do Diário de Obras para UMA pessoa.
///
/// **Por que existe, e não bastava o perfil.** "Engenharia" é um papel
/// coletivo: a equipe inteira precisa das permissões do ERP, mas nem todo
/// engenheiro vai a campo preencher RDO. Sem este interruptor, liberar o
/// Diário para um significa liberar para todos, e o único ajuste possível
/// seria tirar a permissão do papel — derrubando quem depende dela.
///
/// Ele só tira. Ligar não concede nada a quem o perfil não deu, e o texto
/// abaixo do rótulo diz isso quando é o caso, em vez de deixar o admin achar
/// que resolveu.
export function DiarioAccessCard({ user }: { user: SystemUser }) {
  const alternar = useUpdateSystemUserDiarioAccess();
  // Enquanto a requisição está no ar, mostra o estado PEDIDO e não o do
  // servidor: sem isso o interruptor volta sozinho por um instante e parece
  // ter falhado.
  const ligado = alternar.isPending ? alternar.variables!.diarioEnabled : user.diarioEnabled;

  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <HardHat className="mt-0.5 size-5 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <label htmlFor="diario-access" className="text-sm font-medium">
            Diário de Obras
          </label>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ligado
              ? 'Esta pessoa pode entrar no Diário de Obras.'
              : 'Esta pessoa não entra no Diário de Obras, mesmo que o perfil permita.'}
          </p>
          {ligado && (
            // A segunda porta. Alguém liberado aqui e sem obra nenhuma entra e
            // vê uma tela vazia — e sem este aviso o admin conclui que o
            // interruptor não funcionou.
            <p className="mt-1 text-xs text-muted-foreground">
              As obras que ela acompanha são definidas dentro do Diário, em cada obra.
            </p>
          )}
          {alternar.isError && (
            <p className="mt-1 text-xs text-destructive">
              Não foi possível salvar. Tente novamente.
            </p>
          )}
        </div>

        <Switch
          id="diario-access"
          checked={ligado}
          disabled={alternar.isPending}
          onCheckedChange={(marcado) =>
            alternar.mutate({ id: user.id, diarioEnabled: marcado })
          }
        />
      </CardContent>
    </Card>
  );
}
