import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
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
import { ApiError } from '@/lib/api-client';
import { CATALOG_ITEM_TYPE_LABELS } from '@/features/catalogo/catalog-item-type';
import { PRICE_SOURCE_LABELS } from '@/features/catalogo/price-types';
import { formatDateOnly } from '@/features/catalogo/reference-date';

import { formatCoefficient, formatCost, toRawDecimal } from '../format';
import {
  useAddCompositionItem,
  useRemoveCompositionItem,
  useUpdateCompositionItem,
} from '../hooks/use-compositions';
import type { CatalogOption, Composition, CompositionItem } from '../types';
import { CatalogItemPicker } from './catalog-item-picker';

/// Os insumos da composição, com coeficiente, preço e custo.
///
/// **O custo mostrado é sempre o do servidor.** A tela não multiplica nada:
/// cada escrita devolve a composição recalculada, e é ela que aparece. Assim
/// o número na tela é o mesmo que o orçamento vai copiar.
///
/// **A unidade do coeficiente é a do insumo**, e fica escrita ao lado dele
/// ("KG por M2"). Nenhuma conversão é feita.
export function CompositionItemsEditor({
  composition,
  canManage,
}: {
  composition: Composition;
  canManage: boolean;
}) {
  const remover = useRemoveCompositionItem(composition.id);
  const [removendo, setRemovendo] = useState<CompositionItem | null>(null);
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);

  async function confirmarRemocao() {
    if (!removendo) return;
    setErroRemocao(null);
    try {
      await remover.mutateAsync(removendo.id);
    } catch (error) {
      setErroRemocao(
        error instanceof ApiError ? error.message : 'Não foi possível remover o insumo.',
      );
    }
    setRemovendo(null);
  }

  const colunas = canManage ? 8 : 7;

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <NovoItem
          compositionId={composition.id}
          compositionUnit={composition.unit}
          jaIncluidos={composition.items.map((item) => item.catalogItemId)}
        />
      )}

      {erroRemocao && (
        <Alert variant="destructive">
          <AlertTitle>{erroRemocao}</AlertTitle>
        </Alert>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Insumo</TableHead>
              <TableHead>Natureza</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Coeficiente</TableHead>
              <TableHead className="text-right">Preço unitário</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              {canManage && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {composition.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={colunas}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Nenhum insumo nesta composição ainda.
                </TableCell>
              </TableRow>
            )}
            {composition.items.map((item) => (
              <LinhaDoItem
                key={item.id}
                item={item}
                compositionId={composition.id}
                canManage={canManage}
                onRemove={() => setRemovendo(item)}
              />
            ))}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={6} className="text-right font-medium">
                Custo unitário
              </TableCell>
              <TableCell
                className="text-right font-semibold tabular-nums"
                data-testid="custo-unitario"
              >
                {formatCost(composition.unitCost)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {composition.unit}
                </span>
              </TableCell>
              {canManage && <TableCell />}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={Boolean(removendo)}
        onOpenChange={(aberto) => !aberto && setRemovendo(null)}
        title="Remover insumo"
        description={`Remover "${removendo?.catalogItem.name}" desta composição? O coeficiente e o preço desta linha serão descartados.`}
        confirmLabel="Remover"
        isLoading={remover.isPending}
        onConfirm={confirmarRemocao}
      />
    </div>
  );
}

function LinhaDoItem({
  item,
  compositionId,
  canManage,
  onRemove,
}: {
  item: CompositionItem;
  compositionId: string;
  canManage: boolean;
  onRemove: () => void;
}) {
  const atualizar = useUpdateCompositionItem(compositionId);
  const [coeficiente, setCoeficiente] = useState(() => toRawDecimal(item.coefficient));
  const [preco, setPreco] = useState(() => toRawDecimal(item.unitPrice));
  const [erro, setErro] = useState<string | null>(null);

  // Quando o servidor devolve valores novos (esta linha salva, ou outra
  // escrita recarregou a composição), o rascunho acompanha. Comparado durante
  // o render, sem efeito — o mesmo padrão do `NumberInput`.
  const [gravados, setGravados] = useState({ c: item.coefficient, p: item.unitPrice });
  if (gravados.c !== item.coefficient || gravados.p !== item.unitPrice) {
    setGravados({ c: item.coefficient, p: item.unitPrice });
    setCoeficiente(toRawDecimal(item.coefficient));
    setPreco(toRawDecimal(item.unitPrice));
  }

  /// Salva ao SAIR do campo, e só se o valor mudou.
  async function salvar(campo: 'coefficient' | 'unitPrice') {
    const rascunho = campo === 'coefficient' ? coeficiente : preco;
    const gravado = campo === 'coefficient' ? item.coefficient : item.unitPrice;
    const restaurar = () =>
      campo === 'coefficient'
        ? setCoeficiente(toRawDecimal(gravado))
        : setPreco(toRawDecimal(gravado));

    if (rascunho !== '' && Number(rascunho) === Number(gravado)) return;

    if (rascunho === '') {
      setErro(campo === 'coefficient' ? 'Informe o coeficiente.' : 'Informe o preço unitário.');
      restaurar();
      return;
    }

    const numero = Number(rascunho);
    if (campo === 'coefficient' && !(numero > 0)) {
      setErro('O coeficiente deve ser maior que zero.');
      restaurar();
      return;
    }

    setErro(null);
    try {
      await atualizar.mutateAsync({
        itemId: item.id,
        input: campo === 'coefficient' ? { coefficient: numero } : { unitPrice: numero },
      });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar a alteração.');
      restaurar();
    }
  }

  const sairComEnter = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Enter') evento.currentTarget.blur();
  };

  const insumo = item.catalogItem;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">{insumo.code}</TableCell>
      <TableCell>
        <p className="font-medium text-foreground">{insumo.name}</p>
        {!insumo.active && (
          <Badge variant="secondary" className="mt-1">
            Insumo inativo
          </Badge>
        )}
        {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {CATALOG_ITEM_TYPE_LABELS[insumo.type]}
      </TableCell>
      <TableCell className="text-muted-foreground">{insumo.unit}</TableCell>
      <TableCell className="text-right">
        {canManage ? (
          <NumberInput
            mode="decimal"
            decimalScale={6}
            value={coeficiente}
            onChange={setCoeficiente}
            onBlur={() => salvar('coefficient')}
            onKeyDown={sairComEnter}
            aria-label={`Coeficiente de ${insumo.name}`}
            className="ml-auto w-28 text-right tabular-nums"
          />
        ) : (
          <span className="tabular-nums">{formatCoefficient(item.coefficient)}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {canManage ? (
          <NumberInput
            mode="decimal"
            decimalScale={4}
            value={preco}
            onChange={setPreco}
            onBlur={() => salvar('unitPrice')}
            onKeyDown={sairComEnter}
            aria-label={`Preço unitário de ${insumo.name}`}
            className="ml-auto w-28 text-right tabular-nums"
          />
        ) : (
          <span className="tabular-nums">{formatCost(item.unitPrice)}</span>
        )}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatCost(item.totalCost)}
      </TableCell>
      {canManage && (
        <TableCell>
          <Button variant="ghost" size="icon" className="size-8" onClick={onRemove}>
            <Trash2 className="size-4" />
            <span className="sr-only">Remover {insumo.name}</span>
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

function NovoItem({
  compositionId,
  compositionUnit,
  jaIncluidos,
}: {
  compositionId: string;
  compositionUnit: string;
  jaIncluidos: string[];
}) {
  const incluir = useAddCompositionItem(compositionId);
  const [insumo, setInsumo] = useState<CatalogOption | null>(null);
  const [coeficiente, setCoeficiente] = useState('');
  const [preco, setPreco] = useState('');
  /// O valor cru que a sugestão pôs no campo. Serve para saber se o preço no
  /// campo ainda é a sugestão (e pode ser trocado ao trocar de insumo) ou se
  /// alguém o digitou.
  const [precoSugerido, setPrecoSugerido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /// Ao escolher o insumo, o preço de referência vigente hoje entra no campo
  /// como SUGESTÃO. A pessoa pode trocar à vontade; o que for enviado é o que a
  /// linha guarda, e um preço novo no histórico não mexe nela depois.
  ///
  /// Sem preço de referência, o campo não é tocado — continua do jeito que a
  /// pessoa deixou, e a composição segue sendo feita à mão.
  function escolherInsumo(opcao: CatalogOption | null) {
    const aindaSugestao = precoSugerido !== null && preco === precoSugerido;
    const sugestao = opcao?.referencePrice ? toRawDecimal(opcao.referencePrice.unitPrice) : null;

    setInsumo(opcao);
    if (sugestao !== null) setPreco(sugestao);
    // A sugestão do insumo anterior não pode ficar para o próximo: seria o
    // preço de uma coisa gravado em outra.
    else if (aindaSugestao) setPreco('');
    setPrecoSugerido(sugestao);
  }

  async function adicionar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (!insumo) return setErro('Escolha um insumo.');
    const numero = Number(coeficiente);
    if (coeficiente === '' || !(numero > 0)) {
      return setErro('O coeficiente deve ser maior que zero.');
    }
    if (preco === '') return setErro('Informe o preço unitário.');

    try {
      // Só insumo, coeficiente e preço. O custo é do servidor.
      await incluir.mutateAsync({
        catalogItemId: insumo.id,
        coefficient: numero,
        unitPrice: Number(preco),
      });
      setInsumo(null);
      setCoeficiente('');
      setPreco('');
      setPrecoSugerido(null);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível incluir o insumo.');
    }
  }

  const referencia = insumo?.referencePrice ?? null;

  return (
    <form
      onSubmit={adicionar}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="novo-item-insumo">Insumo</Label>
          <CatalogItemPicker
            id="novo-item-insumo"
            value={insumo}
            onChange={escolherInsumo}
            excludeIds={jaIncluidos}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="novo-item-coeficiente">Coeficiente</Label>
          <NumberInput
            id="novo-item-coeficiente"
            mode="decimal"
            decimalScale={6}
            value={coeficiente}
            onChange={setCoeficiente}
            placeholder="0,000000"
            className="text-right tabular-nums"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="novo-item-preco">Preço unitário</Label>
          <NumberInput
            id="novo-item-preco"
            mode="decimal"
            decimalScale={4}
            value={preco}
            onChange={setPreco}
            placeholder="0,00"
            className="text-right tabular-nums"
          />
        </div>

        <Button type="submit" disabled={incluir.isPending}>
          <Plus />
          Adicionar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {insumo
          ? `Coeficiente em ${insumo.unit} por ${compositionUnit}; preço por ${insumo.unit}.`
          : `O coeficiente é a quantidade do insumo, na unidade dele, para 1 ${compositionUnit}.`}
      </p>

      {referencia && (
        <p className="text-xs text-muted-foreground" data-testid="preco-sugerido">
          Preço sugerido: {formatCost(referencia.unitPrice)} / {referencia.unit}, referência de{' '}
          {formatDateOnly(referencia.referenceDate)} ({PRICE_SOURCE_LABELS[referencia.source]}).
          Você pode alterar — a composição guarda o valor informado aqui.
        </p>
      )}
      {insumo && !referencia && (
        <p className="text-xs text-muted-foreground">
          Este insumo não tem preço de referência. Informe o preço desta composição.
        </p>
      )}
    </form>
  );
}
