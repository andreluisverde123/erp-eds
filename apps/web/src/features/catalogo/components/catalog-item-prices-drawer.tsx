import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  NumberInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { formatCost } from '@/features/composicoes/format';
import { ApiError } from '@/lib/api-client';

import {
  useCatalogItemPrices,
  useCurrentReferencePrice,
  usePurchasePriceCandidates,
  useRegisterManualPrice,
  useRegisterPurchasePrice,
} from '../hooks/use-catalog-item-prices';
import { PRICE_SOURCE_LABELS } from '../price-types';
import { formatDateOnly, todayInSaoPaulo } from '../reference-date';
import type { CatalogItem } from '../types';

/// Preços de referência de um insumo: o vigente, o histórico e o registro.
///
/// **O histórico não se edita.** Não há botão de editar nem de excluir preço:
/// corrigir é registrar de novo. No empate de data, vale o último registrado.
///
/// **Nada entra sozinho.** O preço de compra aparece como candidato e só vira
/// referência quando alguém escolhe registrar.
///
/// Quem vê o quê segue a API: `composicoes.view` consulta, `composicoes.manage`
/// registra, e as compras exigem também `compras.view`.
export function CatalogItemPricesDrawer({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CatalogItem | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Preços de referência</SheetTitle>
          <SheetDescription>
            {item ? `${item.code} · ${item.name} — preço por ${item.unit}.` : ''}
          </SheetDescription>
        </div>
        {open && item && <Corpo key={item.id} item={item} />}
      </SheetContent>
    </Sheet>
  );
}

function Corpo({ item }: { item: CatalogItem }) {
  const { user } = useAuth();
  const permissoes = user?.permissions ?? [];
  const podeRegistrar = permissoes.includes('composicoes.manage');
  const podeUsarCompras = podeRegistrar && permissoes.includes('compras.view');

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
      <VigenteHoje item={item} />
      {podeRegistrar && <NovoPrecoManual item={item} />}
      <Historico item={item} />
      {podeUsarCompras && <PrecosDeCompra item={item} />}
    </div>
  );
}

function VigenteHoje({ item }: { item: CatalogItem }) {
  const { data } = useCurrentReferencePrice(item.id);
  const preco = data?.price;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1" data-testid="preco-vigente">
        <span className="text-xs text-muted-foreground">Vigente hoje</span>
        {preco ? (
          <>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatCost(preco.unitPrice)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/ {preco.unit}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Referência de {formatDateOnly(preco.referenceDate)} ·{' '}
              {PRICE_SOURCE_LABELS[preco.source]}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {data ? 'Sem preço de referência até hoje.' : 'Carregando…'}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function NovoPrecoManual({ item }: { item: CatalogItem }) {
  const hoje = todayInSaoPaulo();
  const registrar = useRegisterManualPrice(item.id);
  const [preco, setPreco] = useState('');
  const [data, setData] = useState(hoje);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (preco === '') return setErro('Informe o preço.');
    if (!data) return setErro('Informe a data de referência.');
    // A API recusa também; aqui a mensagem chega antes da viagem.
    if (data > hoje) return setErro('A data de referência não pode ser futura.');

    try {
      await registrar.mutateAsync({
        unitPrice: Number(preco),
        referenceDate: data,
        note: nota.trim() || undefined,
      });
      setPreco('');
      setNota('');
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível registrar o preço.');
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-foreground">Registrar preço manual</p>

      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preco-manual-valor">Preço (R$ / {item.unit})</Label>
          <NumberInput
            id="preco-manual-valor"
            mode="decimal"
            decimalScale={4}
            value={preco}
            onChange={setPreco}
            placeholder="0,00"
            className="text-right tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preco-manual-data">Data de referência</Label>
          <Input
            id="preco-manual-data"
            type="date"
            max={hoje}
            value={data}
            onChange={(evento) => setData(evento.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preco-manual-nota">Observação</Label>
        <Input
          id="preco-manual-nota"
          value={nota}
          maxLength={500}
          placeholder="Cotação, tabela do fornecedor, pesquisa"
          onChange={(evento) => setNota(evento.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Um preço novo não substitui os anteriores e não altera composições já feitas.
        </p>
        <Button type="submit" disabled={registrar.isPending}>
          {registrar.isPending ? 'Registrando...' : 'Registrar preço'}
        </Button>
      </div>
    </form>
  );
}

function Historico({ item }: { item: CatalogItem }) {
  const { data, isLoading, isError } = useCatalogItemPrices(item.id);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">
        Histórico{data && data.meta.total > data.data.length ? ` (${data.data.length} de ${data.meta.total})` : ''}
      </p>

      {isError && (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando histórico...</p>}
      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum preço registrado ainda.</p>
      )}

      {data && data.data.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referência</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead>Registrado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((preco) => (
                <TableRow key={preco.id}>
                  <TableCell className="tabular-nums">{formatDateOnly(preco.referenceDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCost(preco.unitPrice)}
                    <span className="ml-1 text-xs text-muted-foreground">/ {preco.unit}</span>
                  </TableCell>
                  <TableCell>{PRICE_SOURCE_LABELS[preco.source]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[preco.purchaseOrder?.code, preco.note].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {preco.createdBy?.name ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PrecosDeCompra({ item }: { item: CatalogItem }) {
  const { data, isLoading, isError } = usePurchasePriceCandidates(item.id, true);
  const registrar = useRegisterPurchasePrice(item.id);
  const [erro, setErro] = useState<string | null>(null);

  async function registrarDaCompra(purchaseOrderItemId: string) {
    setErro(null);
    try {
      await registrar.mutateAsync(purchaseOrderItemId);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível registrar o preço.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-foreground">Compras recebidas</p>
        <p className="text-xs text-muted-foreground">
          Preço praticado em ordens de compra recebidas, já com os descontos. Registrar é uma
          escolha: nenhuma compra entra no histórico sozinha.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}
      {isError && (
        <p className="text-sm text-muted-foreground">Não foi possível carregar as compras.</p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando compras...</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma ordem de compra recebida com este insumo.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordem</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço praticado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((compra) => (
                <TableRow key={compra.purchaseOrderItemId}>
                  <TableCell>
                    <p className="font-mono text-xs">{compra.purchaseOrder.code}</p>
                    <p className="text-xs text-muted-foreground">{compra.purchaseOrder.supplierName}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateOnly(compra.referenceDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(compra.quantity).toLocaleString('pt-BR')} {compra.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {compra.practicedUnitPrice ? formatCost(compra.practicedUnitPrice) : '—'}
                  </TableCell>
                  <TableCell className="max-w-56 text-right">
                    {compra.block ? (
                      <span className="text-xs text-muted-foreground">{compra.blockMessage}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={registrar.isPending}
                        onClick={() => registrarDaCompra(compra.purchaseOrderItemId)}
                      >
                        Registrar
                        <span className="sr-only"> preço da {compra.purchaseOrder.code}</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
