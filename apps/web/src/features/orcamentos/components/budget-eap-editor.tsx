import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  NumberInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CATALOG_ITEM_TYPE_LABELS } from '@/features/catalogo/catalog-item-type';
import { toRawDecimal } from '@/features/composicoes/format';
import { ApiError } from '@/lib/api-client';

import {
  BUDGET_ITEM_SOURCE_LABELS,
  COMPOSITION_PRICING_LABELS,
  formatMoney,
  formatQuantity,
  formatUnitCost,
  referenceLabel,
} from '../format';
import {
  useAddBudgetNode,
  useMoveBudgetNode,
  useRemoveBudgetItem,
  useRemoveBudgetNode,
  useUpdateBudgetItem,
  useUpdateBudgetNode,
} from '../hooks/use-budgets';
import type { Budget, BudgetItem, BudgetNode } from '../types';
import { AddBudgetItemSheet } from './add-budget-item-sheet';

/// A EAP do orçamento, com os itens de cada grupo.
///
/// Os grupos chegam da API já numerados e na ordem da árvore; os itens de um
/// grupo aparecem logo abaixo dele, antes dos subgrupos. Subtotal e totais são
/// os do servidor.
///
/// Sem permissão de gerenciar (`canEdit` falso), tudo é só leitura: nenhum
/// campo, botão ou menu de alteração é desenhado. Orçamento fechado continua
/// editável para quem gerencia.
export function BudgetEapEditor({ budget, canEdit }: { budget: Budget; canEdit: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [novoGrupo, setNovoGrupo] = useState('');
  const [dialogo, setDialogo] = useState<{ tipo: 'subgrupo' | 'renomear'; node: BudgetNode } | null>(null);
  const [incluirEm, setIncluirEm] = useState<BudgetNode | null>(null);
  const [excluirGrupo, setExcluirGrupo] = useState<BudgetNode | null>(null);
  const [excluirItem, setExcluirItem] = useState<BudgetItem | null>(null);

  const adicionarGrupo = useAddBudgetNode(budget.id);
  const moverGrupo = useMoveBudgetNode(budget.id);
  const removerGrupo = useRemoveBudgetNode(budget.id);
  const removerItem = useRemoveBudgetItem(budget.id);

  const itensDe = (nodeId: string) =>
    budget.items.filter((item) => item.budgetNodeId === nodeId).sort((a, b) => a.position - b.position);

  async function executar(acao: () => Promise<unknown>, falha: string) {
    setErro(null);
    try {
      await acao();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : falha);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={async (evento) => {
            evento.preventDefault();
            if (!novoGrupo.trim()) return setErro('Informe o nome do grupo.');
            await executar(async () => {
              await adicionarGrupo.mutateAsync({ name: novoGrupo.trim() });
              setNovoGrupo('');
            }, 'Não foi possível criar o grupo.');
          }}
        >
          <Input
            aria-label="Nome do novo grupo"
            placeholder="Novo grupo da EAP (ex.: Fundação)"
            value={novoGrupo}
            onChange={(evento) => setNovoGrupo(evento.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" variant="outline" disabled={adicionarGrupo.isPending}>
            <FolderPlus />
            Adicionar grupo
          </Button>
        </form>
      )}

      {budget.nodes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {canEdit ? 'A EAP está vazia. Comece criando um grupo.' : 'Este orçamento não tem EAP.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EAP / Descrição</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {budget.nodes.map((node) => (
                <GrupoELinhas
                  key={node.id}
                  budget={budget}
                  node={node}
                  itens={itensDe(node.id)}
                  canEdit={canEdit}
                  onSubgrupo={() => setDialogo({ tipo: 'subgrupo', node })}
                  onRenomear={() => setDialogo({ tipo: 'renomear', node })}
                  onIncluir={() => setIncluirEm(node)}
                  onMover={(direction) =>
                    executar(() => moverGrupo.mutateAsync({ nodeId: node.id, direction }), 'Não foi possível mover o grupo.')
                  }
                  onExcluir={() => setExcluirGrupo(node)}
                  onExcluirItem={setExcluirItem}
                />
              ))}
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={5} className="text-right font-semibold">
                  Custo direto
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums" data-testid="total-geral">
                  {formatMoney(budget.totalCost)}
                </TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Subtotais e total somam os valores exatos e arredondam uma vez; a soma dos totais de linha
            exibidos pode diferir em centavos.
          </p>
        </div>
      )}

      {canEdit && (
        <>
          <NomeDoGrupoDialog
            budgetId={budget.id}
            dialogo={dialogo}
            onClose={() => setDialogo(null)}
          />
          <AddBudgetItemSheet
            open={Boolean(incluirEm)}
            onOpenChange={(aberto) => !aberto && setIncluirEm(null)}
            budget={budget}
            node={incluirEm}
          />
          <ConfirmDialog
            open={Boolean(excluirGrupo)}
            onOpenChange={(aberto) => !aberto && setExcluirGrupo(null)}
            title="Excluir grupo"
            description={`Excluir "${excluirGrupo?.code} — ${excluirGrupo?.name}"? Os subgrupos e os itens dele também serão excluídos.`}
            confirmLabel="Excluir"
            isLoading={removerGrupo.isPending}
            onConfirm={async () => {
              if (excluirGrupo) await executar(() => removerGrupo.mutateAsync(excluirGrupo.id), 'Não foi possível excluir o grupo.');
              setExcluirGrupo(null);
            }}
          />
          <ConfirmDialog
            open={Boolean(excluirItem)}
            onOpenChange={(aberto) => !aberto && setExcluirItem(null)}
            title="Excluir item"
            description={`Excluir "${excluirItem?.description}" do orçamento?`}
            confirmLabel="Excluir"
            isLoading={removerItem.isPending}
            onConfirm={async () => {
              if (excluirItem) await executar(() => removerItem.mutateAsync(excluirItem.id), 'Não foi possível excluir o item.');
              setExcluirItem(null);
            }}
          />
        </>
      )}
    </div>
  );
}

function GrupoELinhas({
  budget,
  node,
  itens,
  canEdit,
  onSubgrupo,
  onRenomear,
  onIncluir,
  onMover,
  onExcluir,
  onExcluirItem,
}: {
  budget: Budget;
  node: BudgetNode;
  itens: BudgetItem[];
  canEdit: boolean;
  onSubgrupo: () => void;
  onRenomear: () => void;
  onIncluir: () => void;
  onMover: (direction: 'UP' | 'DOWN') => void;
  onExcluir: () => void;
  onExcluirItem: (item: BudgetItem) => void;
}) {
  const recuo = { paddingLeft: `${(node.depth - 1) * 20 + 8}px` };

  return (
    <>
      <TableRow className="bg-muted/30" data-testid={`grupo-${node.code}`}>
        <TableCell colSpan={5} style={recuo}>
          <span className="font-mono text-xs text-muted-foreground">{node.code}</span>{' '}
          <span className="font-semibold text-foreground">{node.name}</span>
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{formatMoney(node.subtotal)}</TableCell>
        {canEdit && (
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Ações do grupo {node.code}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onIncluir}>
                  <ListPlus />
                  Incluir item
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSubgrupo}>
                  <Plus />
                  Adicionar subgrupo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onRenomear}>
                  <Pencil />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMover('UP')}>
                  <ArrowUp />
                  Mover para cima
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMover('DOWN')}>
                  <ArrowDown />
                  Mover para baixo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExcluir}>
                  <Trash2 />
                  Excluir grupo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        )}
      </TableRow>
      {itens.map((item) => (
        <LinhaDoItem
          key={item.id}
          budgetId={budget.id}
          item={item}
          depth={node.depth}
          canEdit={canEdit}
          onExcluir={() => onExcluirItem(item)}
        />
      ))}
    </>
  );
}

function LinhaDoItem({
  budgetId,
  item,
  depth,
  canEdit,
  onExcluir,
}: {
  budgetId: string;
  item: BudgetItem;
  depth: number;
  canEdit: boolean;
  onExcluir: () => void;
}) {
  const atualizar = useUpdateBudgetItem(budgetId);
  const [quantidade, setQuantidade] = useState(() => toRawDecimal(item.quantity));
  const [custo, setCusto] = useState(() => toRawDecimal(item.unitCost));
  const [gravados, setGravados] = useState({ q: item.quantity, c: item.unitCost });
  const [erro, setErro] = useState<string | null>(null);
  const [abertas, setAbertas] = useState(false);

  // O rascunho acompanha o que o servidor devolveu, sem efeito.
  if (gravados.q !== item.quantity || gravados.c !== item.unitCost) {
    setGravados({ q: item.quantity, c: item.unitCost });
    setQuantidade(toRawDecimal(item.quantity));
    setCusto(toRawDecimal(item.unitCost));
  }

  /// Custo de composição e de base referencial é o congelado na inclusão e
  /// não se edita.
  const custoEditavel = canEdit && item.source !== 'COMPOSITION' && item.source !== 'REFERENCE';
  const linhasAnaliticas = item.referenceComponents ?? [];
  const temLinhas = item.source === 'COMPOSITION' || linhasAnaliticas.length > 0;

  async function salvar(campo: 'quantity' | 'unitCost') {
    const rascunho = campo === 'quantity' ? quantidade : custo;
    const gravado = campo === 'quantity' ? item.quantity : item.unitCost;
    const restaurar = () =>
      campo === 'quantity' ? setQuantidade(toRawDecimal(gravado)) : setCusto(toRawDecimal(gravado));

    if (rascunho !== '' && Number(rascunho) === Number(gravado)) return;
    const numero = Number(rascunho);
    if (rascunho === '' || (campo === 'quantity' && !(numero > 0))) {
      setErro(campo === 'quantity' ? 'A quantidade deve ser maior que zero.' : 'Informe o custo unitário.');
      restaurar();
      return;
    }

    setErro(null);
    try {
      await atualizar.mutateAsync({
        itemId: item.id,
        input: campo === 'quantity' ? { quantity: numero } : { unitCost: numero },
      });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar a alteração.');
      restaurar();
    }
  }

  const sairComEnter = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Enter') evento.currentTarget.blur();
  };

  return (
    <>
      <TableRow data-testid={`item-${item.description}`}>
        <TableCell style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          <div className="flex items-start gap-1">
            {temLinhas && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => setAbertas((v) => !v)}
              >
                {abertas ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                <span className="sr-only">{abertas ? 'Ocultar' : 'Ver'} composição de {item.description}</span>
              </Button>
            )}
            <div>
              <p className="text-foreground">
                {item.code && <span className="mr-1 font-mono text-xs text-muted-foreground">{item.code}</span>}
                {item.description}
              </p>
              {item.sourceCode && item.source !== 'REFERENCE' && (
                <p className="font-mono text-xs text-muted-foreground">{item.sourceCode}</p>
              )}
              {item.reference && (
                <p className="text-xs text-muted-foreground" data-testid={`referencia-${item.id}`}>
                  {referenceLabel(item.reference)}
                </p>
              )}
              {erro && <p className="text-xs text-destructive">{erro}</p>}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{BUDGET_ITEM_SOURCE_LABELS[item.source]}</Badge>
          {item.compositionPricing && (
            <p className="mt-1 text-xs text-muted-foreground">{COMPOSITION_PRICING_LABELS[item.compositionPricing]}</p>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">{item.unit}</TableCell>
        <TableCell className="text-right">
          {canEdit ? (
            <NumberInput
              mode="decimal"
              decimalScale={4}
              value={quantidade}
              onChange={setQuantidade}
              onBlur={() => salvar('quantity')}
              onKeyDown={sairComEnter}
              aria-label={`Quantidade de ${item.description}`}
              className="ml-auto w-28 text-right tabular-nums"
            />
          ) : (
            <span className="tabular-nums">{formatQuantity(item.quantity)}</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {custoEditavel ? (
            <NumberInput
              mode="decimal"
              decimalScale={4}
              value={custo}
              onChange={setCusto}
              onBlur={() => salvar('unitCost')}
              onKeyDown={sairComEnter}
              aria-label={`Custo unitário de ${item.description}`}
              className="ml-auto w-28 text-right tabular-nums"
            />
          ) : (
            <span className="tabular-nums">{formatUnitCost(item.unitCost)}</span>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatMoney(item.totalCost)}</TableCell>
        {canEdit && (
          <TableCell>
            <Button variant="ghost" size="icon" className="size-8" onClick={onExcluir}>
              <Trash2 className="size-4" />
              <span className="sr-only">Excluir {item.description}</span>
            </Button>
          </TableCell>
        )}
      </TableRow>
      {abertas &&
        item.components.map((linha) => (
          <TableRow key={linha.id} className="text-xs text-muted-foreground hover:bg-transparent">
            <TableCell style={{ paddingLeft: `${depth * 20 + 36}px` }}>
              <span className="font-mono">{linha.code}</span> {linha.name}
            </TableCell>
            <TableCell>
              {CATALOG_ITEM_TYPE_LABELS[linha.type]}
              {linha.priceOrigin === 'FALLBACK' && <span className="block">preço da composição</span>}
              {linha.priceOrigin === 'HISTORICAL' && <span className="block">preço da data-base</span>}
            </TableCell>
            <TableCell>{linha.unit}</TableCell>
            <TableCell className="text-right tabular-nums">{formatQuantity(linha.coefficient)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUnitCost(linha.unitPrice)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUnitCost(linha.totalCost)}</TableCell>
            {canEdit && <TableCell />}
          </TableRow>
        ))}
      {abertas &&
        linhasAnaliticas.map((linha) => (
          <TableRow key={linha.id} className="text-xs text-muted-foreground hover:bg-transparent">
            <TableCell style={{ paddingLeft: `${depth * 20 + 36}px` }}>
              <span className="font-mono">{linha.code}</span> {linha.description}
            </TableCell>
            <TableCell>
              {linha.section ? `${linha.section} · ` : ''}
              {REFERENCE_KIND_LABELS[linha.kind] ?? linha.kind}
              {linha.situation && <span className="block">{linha.situation}</span>}
            </TableCell>
            <TableCell>{linha.unit ?? ''}</TableCell>
            <TableCell className="text-right tabular-nums">{linha.coefficient ? formatQuantity(linha.coefficient) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{linha.unitPrice ? formatUnitCost(linha.unitPrice) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{linha.totalCost ? formatUnitCost(linha.totalCost) : '—'}</TableCell>
            {canEdit && <TableCell />}
          </TableRow>
        ))}
    </>
  );
}

const REFERENCE_KIND_LABELS: Record<string, string> = {
  INPUT: 'Insumo',
  COMPOSITION: 'Composição',
  EQUIPMENT: 'Equipamento',
  LABOR: 'Mão de obra',
  MATERIAL: 'Material',
  AUXILIARY: 'Atividade auxiliar',
  FIXED_TIME: 'Tempo fixo',
  TRANSPORT: 'Transporte',
};

function NomeDoGrupoDialog({
  budgetId,
  dialogo,
  onClose,
}: {
  budgetId: string;
  dialogo: { tipo: 'subgrupo' | 'renomear'; node: BudgetNode } | null;
  onClose: () => void;
}) {
  const adicionar = useAddBudgetNode(budgetId);
  const renomear = useUpdateBudgetNode(budgetId);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  // Ao abrir para outro grupo, o campo começa com o nome certo.
  const chave = dialogo ? `${dialogo.tipo}:${dialogo.node.id}` : null;
  if (chave !== aberto) {
    setAberto(chave);
    setNome(dialogo?.tipo === 'renomear' ? dialogo.node.name : '');
    setErro(null);
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!dialogo) return;
    if (!nome.trim()) return setErro('Informe o nome do grupo.');
    try {
      if (dialogo.tipo === 'subgrupo') {
        await adicionar.mutateAsync({ name: nome.trim(), parentId: dialogo.node.id });
      } else {
        await renomear.mutateAsync({ nodeId: dialogo.node.id, name: nome.trim() });
      }
      onClose();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar o grupo.');
    }
  }

  return (
    <Dialog open={Boolean(dialogo)} onOpenChange={(estado) => !estado && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogo?.tipo === 'renomear' ? 'Renomear grupo' : 'Adicionar subgrupo'}</DialogTitle>
          <DialogDescription>
            {dialogo ? `${dialogo.tipo === 'renomear' ? 'Grupo' : 'Dentro de'} ${dialogo.node.code} — ${dialogo.node.name}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="flex flex-col gap-3" noValidate>
          {erro && (
            <Alert variant="destructive">
              <AlertTitle>{erro}</AlertTitle>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome-do-grupo">Nome do grupo</Label>
            <Input id="nome-do-grupo" value={nome} maxLength={150} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={adicionar.isPending || renomear.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
