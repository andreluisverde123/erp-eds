import { useState } from 'react';
import { PlugZap, RefreshCw } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { CertificateCard } from '@/features/integracao-fiscal/components/certificate-card';
import {
  useIntegrationStatus,
  useSyncNow,
  useSyncRuns,
  useTestConnection,
} from '@/features/integracao-fiscal/hooks';
import {
  formatDateTime,
  formatDuration,
  getConnectionLabel,
  getConnectionVariant,
  getSyncLabel,
  getSyncVariant,
  getTriggerLabel,
} from '@/features/integracao-fiscal/status-labels';
import { ApiError } from '@/lib/api-client';

const RUNS_PAGE_SIZE = 10;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function IntegracaoFiscalPage() {
  const { data, isLoading, isError } = useIntegrationStatus();
  const { data: runs } = useSyncRuns(1, RUNS_PAGE_SIZE);

  const testMutation = useTestConnection();
  const syncMutation = useSyncNow();

  const [feedback, setFeedback] = useState<{ ok: boolean; texto: string } | null>(null);

  async function handleTest() {
    setFeedback(null);
    try {
      const resultado = await testMutation.mutateAsync();
      setFeedback({ ok: resultado.ok, texto: `${resultado.mensagem} (${resultado.tempoMs}ms)` });
    } catch (error) {
      setFeedback({
        ok: false,
        texto: error instanceof ApiError ? error.message : 'Falha ao testar a conexão.',
      });
    }
  }

  async function handleSync() {
    setFeedback(null);
    try {
      const r = await syncMutation.mutateAsync();
      setFeedback({
        ok: r.status !== 'ERROR',
        texto:
          r.status === 'EMPTY'
            ? 'Nenhum documento novo na SEFAZ.'
            : `${getSyncLabel(r.status)} — ${r.documentsImported} documento(s) importado(s) em ${formatDuration(r.durationMs)}.` +
              (r.message ? ` ${r.message}` : ''),
      });
    } catch (error) {
      setFeedback({
        ok: false,
        texto: error instanceof ApiError ? error.message : 'Falha ao sincronizar.',
      });
    }
  }

  if (isError) {
    return <ErrorState message="Não foi possível carregar a Integração Fiscal." />;
  }
  if (isLoading || !data) {
    return <LoadingState message="Carregando integração fiscal..." />;
  }

  const { connection, certificate, sync, documents } = data;
  const podeAgir = Boolean(certificate) && !certificate?.expirado;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Integração Fiscal
            </h1>
            <Badge variant={getConnectionVariant(connection.status)}>
              {getConnectionLabel(connection.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Busca automática das notas fiscais emitidas contra o CNPJ da empresa, direto na SEFAZ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!podeAgir || testMutation.isPending}
            onClick={handleTest}
          >
            <PlugZap />
            {testMutation.isPending ? 'Testando...' : 'Testar Conexão'}
          </Button>
          <Button disabled={!podeAgir || syncMutation.isPending} onClick={handleSync}>
            <RefreshCw />
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Agora'}
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.ok ? 'default' : 'destructive'}>
          <AlertTitle>{feedback.texto}</AlertTitle>
        </Alert>
      )}

      {/* O bloqueio da SEFAZ merece destaque: durante ele, cada nova tentativa
          REINICIA a contagem de 1 hora — então avisar é o que impede o usuário
          de piorar a situação clicando de novo. */}
      {connection.bloqueadoAte && (
        <Alert variant="destructive">
          <AlertTitle>
            Consultas bloqueadas pela SEFAZ até {formatDateTime(connection.bloqueadoAte)}
          </AlertTitle>
          <AlertDescription>
            {connection.motivoBloqueio ?? 'Consumo indevido.'} Não tente sincronizar antes disso:
            cada tentativa reinicia a contagem de 1 hora.
          </AlertDescription>
        </Alert>
      )}

      {!connection.agendamentoAtivo && (
        <Alert>
          <AlertTitle>Sincronização automática desligada neste ambiente</AlertTitle>
          <AlertDescription>
            O job horário só roda com <code>FISCAL_SYNC_ENABLED=true</code>. O botão “Sincronizar
            Agora” continua funcionando.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sincronização</CardTitle>
          <CardDescription>
            O NSU é o contador de documentos da SEFAZ para este CNPJ — a sincronização avança a
            partir do último lido.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Último NSU" value={sync.lastNSU} />
          <Metric
            label="Na fila da SEFAZ"
            value={String(sync.pendentesNaFila)}
            hint={sync.pendentesNaFila > 0 ? 'documentos a buscar' : 'em dia'}
          />
          <Metric label="Documentos importados" value={String(documents.total)} />
          <Metric label="Última sincronização" value={formatDateTime(sync.lastSyncAt)} />
          <Metric label="Último sucesso" value={formatDateTime(sync.lastSuccessAt)} />
          <Metric
            label="Próxima execução"
            value={connection.proximaExecucao ? formatDateTime(connection.proximaExecucao) : '—'}
            hint={connection.agendamentoAtivo ? 'a cada 1 hora' : 'desligada'}
          />
        </CardContent>
      </Card>

      <CertificateCard certificate={certificate} />

      <Card>
        <CardHeader>
          <CardTitle>Histórico de sincronizações</CardTitle>
          <CardDescription>
            Últimas {RUNS_PAGE_SIZE} execuções, automáticas e manuais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!runs || runs.data.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhuma sincronização executada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Encontrados</TableHead>
                  <TableHead>Importados</TableHead>
                  <TableHead>NSU</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatDateTime(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getTriggerLabel(run.trigger)}
                      {run.triggeredBy && ` · ${run.triggeredBy.name}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getSyncVariant(run.status)}>{getSyncLabel(run.status)}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {run.documentsFound}
                    </TableCell>
                    <TableCell className="tabular-nums text-foreground">
                      {run.documentsImported}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {run.nsuTo ?? '—'}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatDuration(run.durationMs)}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {run.errorMessage ?? run.xMotivo ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
