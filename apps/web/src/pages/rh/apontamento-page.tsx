import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableSkeleton,
} from '@repo/ui';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { useAttendanceDay, useSaveAttendanceDay } from '@/features/rh/hooks/use-attendance';
import type { AttendanceRow } from '@/features/rh/types';
import { ApiError } from '@/lib/api-client';

/// Apontamento diário: quem efetivamente trabalhou nesta obra neste dia.
///
/// Tela operacional, usada pelo mestre de obras — escolher obra e data, marcar
/// e salvar. Não é folha de ponto: não há entrada, saída nem intervalo, porque
/// a demanda é presença diária. Quem precisa de jornada usa a tela de Ponto,
/// que continua existindo e não foi tocada.
///
/// A lista sai da ALOCAÇÃO daquela data — nunca do cadastro inteiro da empresa.

const hojeISO = () => new Date().toISOString().slice(0, 10);

export function ApontamentoPage() {
  const [constructionSiteId, setConstructionSiteId] = useState<string | null>(null);
  const [date, setDate] = useState(hojeISO);

  const { data: sitesData } = useConstructionSites({ limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Apontamento diário
        </h1>
        <p className="text-sm text-muted-foreground">
          Quem efetivamente trabalhou na obra no dia. A lista vem de quem estava alocado.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={constructionSiteId ?? ''}
          onValueChange={(value) => setConstructionSiteId(value)}
        >
          <SelectTrigger className="sm:w-[240px]" aria-label="Obra">
            <SelectValue placeholder="Escolha a obra" />
          </SelectTrigger>
          <SelectContent>
            {sitesData?.data.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          aria-label="Data"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="sm:w-[180px]"
        />
      </div>

      {!constructionSiteId ? (
        <EmptyState
          icon={CalendarCheck}
          title="Escolha a obra e o dia"
          description="A chamada mostra quem estava alocado naquela obra naquela data."
        />
      ) : (
        // `key` com obra e data: trocar qualquer um dos dois REMONTA a chamada
        // e descarta o rascunho, que pertencia a outra pergunta. É isso, e não
        // um efeito de sincronização, que mantém o estado local honesto.
        <ChamadaDoDia
          key={`${constructionSiteId}-${date}`}
          constructionSiteId={constructionSiteId}
          date={date}
        />
      )}
    </div>
  );
}

/// A chamada de uma obra num dia.
///
/// Componente separado para poder ser REMONTADO por `key` quando a obra ou a
/// data mudam — o rascunho de marcações morre junto, sem efeito nenhum
/// sincronizando estado.
function ChamadaDoDia({
  constructionSiteId,
  date,
}: {
  constructionSiteId: string;
  date: string;
}) {
  const { data, isLoading, isError } = useAttendanceDay(constructionSiteId, date);
  const saveMutation = useSaveAttendanceDay();
  const [erro, setErro] = useState<string | null>(null);

  /// Marcações em edição, à parte do que veio do servidor: o mestre marca a
  /// equipe toda e salva UMA vez. Um pedido por pessoa, numa obra com sinal
  /// ruim, viraria meia chamada gravada.
  const [marcacoes, setMarcacoes] = useState<Record<string, boolean>>({});

  const linhas = data?.rows ?? [];
  const marcado = (linha: AttendanceRow): boolean =>
    marcacoes[linha.employeeId] ?? linha.situacao === 'PRESENTE';

  const alterados = linhas.filter(
    (linha) => marcado(linha) !== (linha.situacao === 'PRESENTE'),
  ).length;
  const naoApontados = linhas.filter((l) => l.situacao === 'NAO_APONTADO').length;

  async function salvar() {
    setErro(null);
    try {
      // Manda a chamada INTEIRA, não só o que mudou: o corpo descreve o estado
      // do dia, e quem ficou sem marca é gravado como ausente — informação,
      // diferente de "ainda não apontado".
      await saveMutation.mutateAsync({
        constructionSiteId,
        date,
        entries: linhas.map((linha) => ({
          employeeId: linha.employeeId,
          present: marcado(linha),
        })),
      });
      setMarcacoes({});
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar o apontamento.');
    }
  }

  if (isError) {
    return <ErrorState message="Não foi possível carregar a chamada. Tente novamente." />;
  }

  if (isLoading && !data) {
    return <TableSkeleton columns={3} rows={5} message="Carregando a equipe do dia..." />;
  }

  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Ninguém alocado nesta obra neste dia"
        description="Aloque a equipe em Funcionários → Alocações antes de apontar."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      <ul className="flex flex-col gap-2">
        {linhas.map((linha) => {
          const presente = marcado(linha);
          return (
            <li key={linha.employeeId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-4 py-3 transition-colors hover:bg-accent">
                <input
                  type="checkbox"
                  checked={presente}
                  onChange={() =>
                    setMarcacoes((antes) => ({ ...antes, [linha.employeeId]: !presente }))
                  }
                  className="size-4 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{linha.name}</p>
                  <p className="text-xs text-muted-foreground">{linha.position}</p>
                </div>
                {/* "Não apontado" precisa ser visível: é o que diz ao mestre que
                    ele ainda não passou por aquela pessoa naquele dia. */}
                {linha.situacao === 'NAO_APONTADO' && <Badge variant="secondary">Não apontado</Badge>}
                {linha.situacao === 'AUSENTE' && <Badge variant="warning">Ausente</Badge>}
                {linha.situacao === 'PRESENTE' && <Badge variant="success">Presente</Badge>}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Salvando...' : 'Salvar o dia'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {naoApontados > 0 ? `${naoApontados} ainda sem apontamento` : 'Dia apontado por completo'}
          {alterados > 0 && ` · ${alterados} alteração(ões) por salvar`}
        </span>
      </div>
    </div>
  );
}
