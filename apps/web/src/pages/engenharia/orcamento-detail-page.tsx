import { useState } from 'react';
import { ArrowLeft, BadgeCheck, CopyPlus, FileDown, FileSpreadsheet, Lock, Pencil, Percent, Trash2, Upload } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  ErrorState,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/features/auth/context';
import { formatDateOnly } from '@/features/catalogo/reference-date';
import { ApiError } from '@/lib/api-client';

import { downloadBudgetExport } from '@/features/orcamentos/api';
import { BudgetBdiDialog } from '@/features/orcamentos/components/budget-bdi-dialog';
import { BudgetEapEditor } from '@/features/orcamentos/components/budget-eap-editor';
import { BudgetFormDrawer } from '@/features/orcamentos/components/budget-form-drawer';
import { BudgetImportDialog } from '@/features/orcamentos/components/budget-import-dialog';
import { BUDGET_STATUS_LABELS, formatMoney, formatPercent } from '@/features/orcamentos/format';
import {
  useBudget,
  useBudgetVersions,
  useCloseBudget,
  useDeleteBudget,
  useReviseBudget,
  useSetOfficialBudget,
} from '@/features/orcamentos/hooks/use-budgets';

/// Editor de orçamento: resumo (custo direto, BDI, preço final), EAP com
/// itens e totais, versões, e as ações do documento — BDI, importação,
/// exportação, fechamento, revisão e orçamento oficial.
export function OrcamentoDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.permissions.includes('orcamentos.manage') ?? false;

  const { data: orcamento, isLoading, isError } = useBudget(id);
  const versoes = useBudgetVersions(id);
  const fechar = useCloseBudget(id);
  const excluir = useDeleteBudget();
  const revisar = useReviseBudget(id);
  const oficializar = useSetOfficialBudget(id);

  const [editando, setEditando] = useState(false);
  const [editandoBdi, setEditandoBdi] = useState(false);
  const [importando, setImportando] = useState(false);
  const [confirmarFechamento, setConfirmarFechamento] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [confirmarRevisao, setConfirmarRevisao] = useState(false);
  const [confirmarOficial, setConfirmarOficial] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const voltar = (
    <Button variant="ghost" size="sm" className="w-fit" onClick={() => navigate('/engenharia/orcamentos')}>
      <ArrowLeft />
      Orçamentos
    </Button>
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <ErrorState message="Orçamento não encontrado ou indisponível." />
      </div>
    );
  }

  if (isLoading || !orcamento) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <p className="text-sm text-muted-foreground">Carregando orçamento...</p>
      </div>
    );
  }

  const rascunho = orcamento.status === 'DRAFT';
  // Fechado continua editável (decisão da EDS): o que só vale para rascunho é
  // excluir e fechar. A API aplica a mesma regra.
  const podeEditar = canManage;

  async function executar(acao: () => Promise<unknown>, falha: string) {
    setErro(null);
    try {
      await acao();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : falha);
    }
  }

  const resumo: { rotulo: string; valor: string; testId?: string; destaque?: boolean }[] = [
    { rotulo: 'Custo direto', valor: formatMoney(orcamento.directCost ?? orcamento.totalCost), testId: 'total-do-orcamento' },
    { rotulo: `BDI (${formatPercent(orcamento.bdiPercent ?? '0')})`, valor: formatMoney(orcamento.bdiValue ?? '0'), testId: 'valor-do-bdi' },
    { rotulo: 'Preço final', valor: formatMoney(orcamento.finalPrice ?? orcamento.totalCost), testId: 'preco-final', destaque: true },
    { rotulo: 'Grupos da EAP', valor: String(orcamento.nodeCount ?? orcamento.nodes.length) },
    { rotulo: 'Itens', valor: String(orcamento.itemCount) },
    { rotulo: 'Data-base', valor: formatDateOnly(orcamento.referenceDate) },
  ];

  return (
    <div className="flex flex-col gap-6">
      {voltar}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {orcamento.code} · v{orcamento.version}
            </span>
            <Badge variant={rascunho ? 'secondary' : 'success'}>{BUDGET_STATUS_LABELS[orcamento.status]}</Badge>
            {orcamento.isOfficial && (
              <Badge variant="outline" data-testid="selo-oficial">
                <BadgeCheck className="size-3.5" />
                Orçamento oficial da obra
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{orcamento.name}</h1>
          <p className="text-sm text-muted-foreground">
            {orcamento.constructionSite.code} — {orcamento.constructionSite.name} · data-base{' '}
            {formatDateOnly(orcamento.referenceDate)}
            {orcamento.revisedFrom ? ` · revisão da v${orcamento.revisedFrom.version}` : ''}
            {orcamento.description ? ` · ${orcamento.description}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => executar(() => downloadBudgetExport(orcamento, 'xlsx'), 'Não foi possível exportar.')}>
            <FileSpreadsheet />
            Exportar XLSX
          </Button>
          <Button variant="outline" onClick={() => executar(() => downloadBudgetExport(orcamento, 'pdf'), 'Não foi possível exportar.')}>
            <FileDown />
            Exportar PDF
          </Button>
          {podeEditar && (
            <>
              <Button variant="outline" onClick={() => setEditando(true)}>
                <Pencil />
                Editar informações
              </Button>
              <Button variant="outline" onClick={() => setEditandoBdi(true)}>
                <Percent />
                BDI
              </Button>
              {orcamento.nodes.length === 0 && (
                <Button variant="outline" onClick={() => setImportando(true)}>
                  <Upload />
                  Importar planilha
                </Button>
              )}
            </>
          )}
          {podeEditar && rascunho && (
            <>
              <Button variant="outline" onClick={() => setConfirmarExclusao(true)}>
                <Trash2 />
                Excluir
              </Button>
              <Button onClick={() => setConfirmarFechamento(true)}>
                <Lock />
                Fechar orçamento
              </Button>
            </>
          )}
          {canManage && !rascunho && (
            <>
              {!orcamento.isOfficial && (
                <Button variant="outline" onClick={() => setConfirmarOficial(true)}>
                  <BadgeCheck />
                  Definir como orçamento oficial
                </Button>
              )}
              <Button onClick={() => setConfirmarRevisao(true)}>
                <CopyPlus />
                Nova revisão
              </Button>
            </>
          )}
        </div>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      {!rascunho && (
        <Alert>
          <Lock className="size-4" />
          <AlertTitle>Orçamento fechado</AlertTitle>
          <AlertDescription>
            Fechado{orcamento.closedAt ? ` em ${new Date(orcamento.closedAt).toLocaleDateString('pt-BR')}` : ''}
            {orcamento.closedBy ? ` por ${orcamento.closedBy.name}` : ''}. Ele continua editável, e cada
            alteração fica registrada no histórico. Para guardar esta versão como está, crie uma nova
            revisão antes de alterar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {resumo.map((cartao) => (
          <Card key={cartao.rotulo}>
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{cartao.rotulo}</span>
              <span
                className={`${cartao.destaque ? 'text-xl font-semibold' : 'text-lg font-medium'} tabular-nums text-foreground`}
                data-testid={cartao.testId}
              >
                {cartao.valor}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      {orcamento.bdiNote && <p className="-mt-3 text-xs text-muted-foreground">BDI: {orcamento.bdiNote}</p>}

      <BudgetEapEditor budget={orcamento} canEdit={podeEditar} />

      {versoes.data && versoes.data.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Versões">
          <h2 className="text-sm font-semibold text-foreground">Versões</h2>
          <ul className="flex flex-wrap gap-2">
            {versoes.data.map((versao) => (
              <li key={versao.id}>
                <Button
                  variant={versao.id === orcamento.id ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => navigate(`/engenharia/orcamentos/${versao.id}`)}
                >
                  v{versao.version} — {BUDGET_STATUS_LABELS[versao.status]}
                  {versao.isOfficial ? ' · oficial' : ''}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {podeEditar && (
        <>
          <BudgetFormDrawer open={editando} onOpenChange={setEditando} budget={orcamento} />
          <BudgetBdiDialog open={editandoBdi} onOpenChange={setEditandoBdi} budget={orcamento} />
          <BudgetImportDialog open={importando} onOpenChange={setImportando} budget={orcamento} />
        </>
      )}

      {podeEditar && rascunho && (
        <>
          <ConfirmDialog
            open={confirmarFechamento}
            onOpenChange={setConfirmarFechamento}
            title="Fechar orçamento"
            description="O orçamento fechado pode ser definido como oficial da obra e revisado. Ele continua editável, e as alterações ficam registradas no histórico."
            confirmLabel="Fechar orçamento"
            isLoading={fechar.isPending}
            onConfirm={async () => {
              // A recusa diz o que falta: "O orçamento não tem nenhum item."
              await executar(() => fechar.mutateAsync(), 'Não foi possível fechar o orçamento.');
              setConfirmarFechamento(false);
            }}
          />
          <ConfirmDialog
            open={confirmarExclusao}
            onOpenChange={setConfirmarExclusao}
            title="Excluir orçamento"
            description={`Excluir "${orcamento.name}"? Só rascunho pode ser excluído.`}
            confirmLabel="Excluir"
            isLoading={excluir.isPending}
            onConfirm={async () => {
              setErro(null);
              try {
                await excluir.mutateAsync(orcamento.id);
                navigate('/engenharia/orcamentos');
              } catch (error) {
                setErro(error instanceof ApiError ? error.message : 'Não foi possível excluir o orçamento.');
              }
              setConfirmarExclusao(false);
            }}
          />
        </>
      )}

      {canManage && !rascunho && (
        <>
          <ConfirmDialog
            open={confirmarRevisao}
            onOpenChange={setConfirmarRevisao}
            title="Nova revisão"
            description={`Criar a v${orcamento.version + 1} em rascunho, copiando a EAP, os itens, os valores e o BDI desta versão? A v${orcamento.version} continua fechada e não muda.`}
            confirmLabel="Criar revisão"
            isLoading={revisar.isPending}
            onConfirm={async () => {
              setErro(null);
              try {
                const nova = await revisar.mutateAsync();
                navigate(`/engenharia/orcamentos/${nova.id}`);
              } catch (error) {
                setErro(error instanceof ApiError ? error.message : 'Não foi possível criar a revisão.');
              }
              setConfirmarRevisao(false);
            }}
          />
          <ConfirmDialog
            open={confirmarOficial}
            onOpenChange={setConfirmarOficial}
            title="Definir como orçamento oficial"
            description={`O preço final desta versão (${formatMoney(orcamento.finalPrice ?? orcamento.totalCost)}) passa a ser o valor orçado da obra ${orcamento.constructionSite.code}. O oficial anterior deixa de ser.`}
            confirmLabel="Definir como oficial"
            isLoading={oficializar.isPending}
            onConfirm={async () => {
              await executar(() => oficializar.mutateAsync(), 'Não foi possível definir o orçamento oficial.');
              setConfirmarOficial(false);
            }}
          />
        </>
      )}
    </div>
  );
}
