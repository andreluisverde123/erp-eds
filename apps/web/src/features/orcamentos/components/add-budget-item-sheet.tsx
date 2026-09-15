import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Input,
  Label,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui';

import { CATALOG_ITEM_TYPE_LABELS } from '@/features/catalogo/catalog-item-type';
import { PRICE_SOURCE_LABELS } from '@/features/catalogo/price-types';
import { formatDateOnly } from '@/features/catalogo/reference-date';
import { toRawDecimal } from '@/features/composicoes/format';
import { ApiError } from '@/lib/api-client';
import { MEASUREMENT_UNITS } from '@/lib/measurement-units';

import {
  searchBudgetCatalogOptions,
  searchBudgetCompositionOptions,
  searchBudgetReferenceOptions,
} from '../api';
import { COMPOSITION_PRICING_LABELS, datasetLabel, formatCompetence, formatUnitCost, REFERENCE_REGIME_LABELS } from '../format';
import { useAddBudgetItem, useBudgetReferenceDatasetOptions } from '../hooks/use-budgets';
import type {
  Budget,
  BudgetItemInput,
  BudgetNode,
  CatalogOption,
  CompositionOption,
  ReferenceOption,
} from '../types';
import { OptionPicker } from './option-picker';

type Origem = BudgetItemInput['source'];

/// Inclusão de uma linha no grupo da EAP, por uma de quatro origens.
///
/// - **Composição própria:** o custo unitário é o da composição NA DATA-BASE
///   (preços vigentes nela, ou os da própria composição), congelado no item.
/// - **Base de referência:** SINAPI ou SICRO de competência anterior ou igual
///   à data-base; custo publicado, congelado, com as linhas analíticas.
/// - **Insumo próprio:** o custo começa com o preço de referência vigente NA
///   DATA-BASE, quando existe; pode ser trocado.
/// - **Manual:** tudo digitado.
///
/// A tela nunca calcula o total: ele aparece na EAP, vindo do servidor.
export function AddBudgetItemSheet({
  open,
  onOpenChange,
  budget,
  node,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget;
  node: BudgetNode | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Incluir item</SheetTitle>
          <SheetDescription>
            {node ? `No grupo ${node.code} — ${node.name}. Data-base ${formatDateOnly(budget.referenceDate)}.` : ''}
          </SheetDescription>
        </div>
        {open && node && <Corpo key={node.id} budget={budget} node={node} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function Corpo({ budget, node, onDone }: { budget: Budget; node: BudgetNode; onDone: () => void }) {
  const incluir = useAddBudgetItem(budget.id);
  const [origem, setOrigem] = useState<Origem>('COMPOSITION');
  const [composicao, setComposicao] = useState<CompositionOption | null>(null);
  const [insumo, setInsumo] = useState<CatalogOption | null>(null);
  const [datasetId, setDatasetId] = useState('');
  const [tipoDeReferencia, setTipoDeReferencia] = useState<'COMPOSITION' | 'ITEM'>('COMPOSITION');
  const [referencia, setReferencia] = useState<ReferenceOption | null>(null);
  const [descricao, setDescricao] = useState('');
  const [unidade, setUnidade] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [custo, setCusto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const bases = useBudgetReferenceDatasetOptions(budget.id, origem === 'REFERENCE');
  const base = bases.data?.find((opcao) => opcao.id === datasetId) ?? null;

  function escolherInsumo(opcao: CatalogOption | null) {
    setInsumo(opcao);
    // A sugestão entra no campo; a pessoa pode trocar.
    setCusto(opcao?.referencePrice ? toRawDecimal(opcao.referencePrice.unitPrice) : '');
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    const qtd = Number(quantidade);
    if (quantidade === '' || !(qtd > 0)) return setErro('A quantidade deve ser maior que zero.');

    let input: BudgetItemInput;
    if (origem === 'COMPOSITION') {
      if (!composicao) return setErro('Escolha a composição.');
      input = { budgetNodeId: node.id, source: 'COMPOSITION', compositionId: composicao.id, quantity: qtd };
    } else if (origem === 'REFERENCE') {
      if (!referencia || !base) return setErro('Escolha o item da base de referência.');
      input =
        referencia.kind === 'COMPOSITION'
          ? { budgetNodeId: node.id, source: 'REFERENCE', referenceDatasetId: base.id, referenceCompositionId: referencia.id, quantity: qtd }
          : { budgetNodeId: node.id, source: 'REFERENCE', referenceDatasetId: base.id, referenceItemId: referencia.id, quantity: qtd };
    } else if (origem === 'CATALOG_ITEM') {
      if (!insumo) return setErro('Escolha o insumo.');
      if (custo === '') return setErro('Informe o custo unitário.');
      input = { budgetNodeId: node.id, source: 'CATALOG_ITEM', catalogItemId: insumo.id, quantity: qtd, unitCost: Number(custo) };
    } else {
      if (!descricao.trim()) return setErro('Informe a descrição.');
      if (!unidade) return setErro('Escolha a unidade.');
      if (custo === '') return setErro('Informe o custo unitário.');
      input = {
        budgetNodeId: node.id,
        source: 'MANUAL',
        description: descricao.trim(),
        unit: unidade,
        quantity: qtd,
        unitCost: Number(custo),
      };
    }

    try {
      await incluir.mutateAsync(input);
      onDone();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível incluir o item.');
    }
  }

  const campoQuantidade = (unidadeDoItem?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="item-quantidade">Quantidade{unidadeDoItem ? ` (${unidadeDoItem})` : ''}</Label>
      <NumberInput id="item-quantidade" mode="decimal" decimalScale={4} value={quantidade} onChange={setQuantidade} className="text-right tabular-nums" />
    </div>
  );

  const campoCusto = (unidadeDoItem?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="item-custo">Custo unitário{unidadeDoItem ? ` (R$ / ${unidadeDoItem})` : ''}</Label>
      <NumberInput id="item-custo" mode="decimal" decimalScale={4} value={custo} onChange={setCusto} className="text-right tabular-nums" />
    </div>
  );

  return (
    <form onSubmit={enviar} noValidate className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {erro && (
          <Alert variant="destructive">
            <AlertTitle>{erro}</AlertTitle>
          </Alert>
        )}

        <Tabs
          value={origem}
          onValueChange={(valor) => {
            setOrigem(valor as Origem);
            setErro(null);
            setCusto('');
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="COMPOSITION">Composição</TabsTrigger>
            <TabsTrigger value="REFERENCE">Base de referência</TabsTrigger>
            <TabsTrigger value="CATALOG_ITEM">Insumo</TabsTrigger>
            <TabsTrigger value="MANUAL">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="COMPOSITION" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-composicao">Composição</Label>
              <OptionPicker<CompositionOption>
                id="item-composicao"
                queryKey={`compositions:${budget.id}`}
                search={(termo) => searchBudgetCompositionOptions(budget.id, termo)}
                value={composicao}
                onChange={setComposicao}
                placeholder="Buscar composição por nome ou código"
                emptyMessage="Nenhuma composição ativa encontrada."
                renderOption={(opcao) => (
                  <>
                    <span className="min-w-0 flex-1 truncate">{opcao.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{opcao.code}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatUnitCost(opcao.unitCost)} / {opcao.unit}
                    </span>
                  </>
                )}
                renderSelected={(opcao) => (
                  <span>
                    <span className="font-medium">{opcao.name}</span>{' '}
                    <span className="font-mono text-xs text-muted-foreground">{opcao.code}</span>
                  </span>
                )}
              />
            </div>
            {composicao && (
              <p className="text-xs text-muted-foreground" data-testid="custo-congelado">
                Custo unitário na data-base: {formatUnitCost(composicao.unitCost)} / {composicao.unit}
                {composicao.pricing ? ` (${COMPOSITION_PRICING_LABELS[composicao.pricing].toLowerCase()})` : ''}. Ele fica
                congelado no orçamento, com as linhas da composição — mudar a composição ou os preços
                depois não altera este item.
              </p>
            )}
            {campoQuantidade(composicao?.unit)}
          </TabsContent>

          <TabsContent value="REFERENCE" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-base">Fonte e competência</Label>
              <Select
                value={datasetId}
                onValueChange={(valor) => {
                  setDatasetId(valor);
                  setReferencia(null);
                }}
              >
                <SelectTrigger id="item-base" className="w-full" aria-label="Fonte e competência">
                  <SelectValue placeholder={bases.isLoading ? 'Carregando bases...' : 'Escolha a base'} />
                </SelectTrigger>
                <SelectContent>
                  {(bases.data ?? []).map((opcao) => (
                    <SelectItem key={opcao.id} value={opcao.id}>
                      {datasetLabel(opcao)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bases.data && bases.data.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma base importada com competência até a data-base. Importe em Engenharia → Bases de Referência.
                </p>
              )}
            </div>

            {base && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-tipo-referencia">Tipo</Label>
                  <Select
                    value={tipoDeReferencia}
                    onValueChange={(valor) => {
                      setTipoDeReferencia(valor as 'COMPOSITION' | 'ITEM');
                      setReferencia(null);
                    }}
                  >
                    <SelectTrigger id="item-tipo-referencia" className="w-full" aria-label="Tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COMPOSITION">Composição</SelectItem>
                      <SelectItem value="ITEM">Insumo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="item-referencia">Item da base</Label>
                  <OptionPicker<ReferenceOption>
                    id="item-referencia"
                    queryKey={`reference:${budget.id}:${base.id}:${tipoDeReferencia}`}
                    search={(termo) => searchBudgetReferenceOptions(budget.id, base.id, tipoDeReferencia, termo)}
                    value={referencia}
                    onChange={setReferencia}
                    placeholder="Buscar por código ou descrição"
                    emptyMessage="Nada encontrado com custo nesta base."
                    renderOption={(opcao) => (
                      <>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{opcao.code}</span>
                        <span className="min-w-0 flex-1 truncate">{opcao.description}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatUnitCost(opcao.unitCost)} / {opcao.unit}
                        </span>
                      </>
                    )}
                    renderSelected={(opcao) => (
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">{opcao.code}</span>{' '}
                        <span className="font-medium">{opcao.description}</span>
                      </span>
                    )}
                  />
                </div>
              </>
            )}

            {base && referencia && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-muted/50 p-3 text-xs" data-testid="referencia-escolhida">
                <dt className="text-muted-foreground">Código</dt>
                <dd className="font-mono">{referencia.code}</dd>
                <dt className="text-muted-foreground">Unidade</dt>
                <dd>{referencia.unit}</dd>
                <dt className="text-muted-foreground">Custo unitário</dt>
                <dd className="tabular-nums">{formatUnitCost(referencia.unitCost)}</dd>
                <dt className="text-muted-foreground">Fonte</dt>
                <dd>{base.source}</dd>
                <dt className="text-muted-foreground">Competência</dt>
                <dd>{formatCompetence(base.competence)}</dd>
                <dt className="text-muted-foreground">Localização / regime</dt>
                <dd>
                  {base.uf}
                  {base.locality ? ` — ${base.locality}` : ''} · {REFERENCE_REGIME_LABELS[base.regime]}
                </dd>
                <dd className="col-span-2 pt-1 text-muted-foreground">
                  Custo publicado pela base, congelado no orçamento
                  {referencia.kind === 'COMPOSITION' ? ` com as ${referencia.componentCount} linhas analíticas` : ''}. Importar
                  outra competência depois não altera este item.
                </dd>
              </dl>
            )}
            {campoQuantidade(referencia?.unit)}
          </TabsContent>

          <TabsContent value="CATALOG_ITEM" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-insumo">Insumo</Label>
              <OptionPicker<CatalogOption>
                id="item-insumo"
                queryKey={`catalog:${budget.id}`}
                search={(termo) => searchBudgetCatalogOptions(budget.id, termo)}
                value={insumo}
                onChange={escolherInsumo}
                placeholder="Buscar insumo por nome ou código"
                emptyMessage="Nenhum insumo ativo encontrado."
                renderOption={(opcao) => (
                  <>
                    <span className="min-w-0 flex-1 truncate">{opcao.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {opcao.code} · {opcao.unit}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{CATALOG_ITEM_TYPE_LABELS[opcao.type]}</span>
                  </>
                )}
                renderSelected={(opcao) => (
                  <span>
                    <span className="font-medium">{opcao.name}</span>{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      {opcao.code} · {opcao.unit}
                    </span>
                  </span>
                )}
              />
            </div>
            {insumo && (
              <p className="text-xs text-muted-foreground" data-testid="preco-sugerido">
                {insumo.referencePrice
                  ? `Sugerido: preço de referência de ${formatDateOnly(insumo.referencePrice.referenceDate)} (${PRICE_SOURCE_LABELS[insumo.referencePrice.source]}), o vigente na data-base. Você pode alterar.`
                  : 'Sem preço de referência até a data-base. Informe o custo.'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {campoQuantidade(insumo?.unit)}
              {campoCusto(insumo?.unit)}
            </div>
          </TabsContent>

          <TabsContent value="MANUAL" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-descricao">Descrição</Label>
              <Input id="item-descricao" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-unidade">Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger id="item-unidade" className="w-full" aria-label="Unidade">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_UNITS.map((u) => (
                    <SelectItem key={u.code} value={u.code}>
                      {u.code} — {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {campoQuantidade(unidade || undefined)}
              {campoCusto(unidade || undefined)}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={incluir.isPending}>
          {incluir.isPending ? 'Incluindo...' : 'Incluir'}
        </Button>
      </div>
    </form>
  );
}
