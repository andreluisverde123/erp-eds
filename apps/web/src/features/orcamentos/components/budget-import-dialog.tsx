import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { downloadBudgetImportTemplate, previewBudgetImport } from '../api';
import { datasetLabel, formatMoney } from '../format';
import { useBudgetReferenceDatasetOptions, useImportBudget } from '../hooks/use-budgets';
import type { Budget, BudgetImportPreview } from '../types';

const SEM_BASE = 'NONE';

/// Importação da EAP e dos itens por planilha, no modelo do ERP.
///
/// Dois passos: ANALISAR (o servidor executa a importação e desfaz — nada fica
/// gravado) e CONFIRMAR (a mesma planilha, conferida pelo hash). Planilha com
/// qualquer erro não importa nada.
export function BudgetImportDialog({
  open,
  onOpenChange,
  budget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar planilha</DialogTitle>
          <DialogDescription>
            A EAP e os itens entram de uma vez num orçamento sem grupos. Use o modelo do ERP.
          </DialogDescription>
        </DialogHeader>
        {open && <Corpo budget={budget} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ budget, onDone }: { budget: Budget; onDone: () => void }) {
  const bases = useBudgetReferenceDatasetOptions(budget.id);
  const importar = useImportBudget(budget.id);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [datasetId, setDatasetId] = useState(SEM_BASE);
  const [previa, setPrevia] = useState<BudgetImportPreview | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const referenceDatasetId = datasetId === SEM_BASE ? undefined : datasetId;

  async function analisar() {
    if (!arquivo) return setErro('Escolha a planilha.');
    setErro(null);
    setPrevia(null);
    setAnalisando(true);
    try {
      setPrevia(await previewBudgetImport(budget.id, arquivo, referenceDatasetId));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível analisar a planilha.');
    } finally {
      setAnalisando(false);
    }
  }

  async function confirmar() {
    if (!arquivo || !previa) return;
    setErro(null);
    try {
      await importar.mutateAsync({ file: arquivo, fileHash: previa.fileHash, referenceDatasetId });
      onDone();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível importar a planilha.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      <Button type="button" variant="outline" className="w-fit" onClick={() => downloadBudgetImportTemplate()}>
        <Download />
        Baixar modelo de importação
      </Button>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="importacao-arquivo">Planilha (.xlsx)</Label>
          <Input
            id="importacao-arquivo"
            type="file"
            accept=".xlsx"
            onChange={(evento) => {
              setArquivo(evento.target.files?.[0] ?? null);
              setPrevia(null);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="importacao-base">Base das linhas REFERENCIA</Label>
          <Select
            value={datasetId}
            onValueChange={(valor) => {
              setDatasetId(valor);
              setPrevia(null);
            }}
          >
            <SelectTrigger id="importacao-base" aria-label="Base das linhas REFERENCIA">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_BASE}>Nenhuma</SelectItem>
              {(bases.data ?? []).map((opcao) => (
                <SelectItem key={opcao.id} value={opcao.id}>
                  {datasetLabel(opcao)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {previa && (
        <div className="flex flex-col gap-3" data-testid="previa-importacao">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-4">
            <dt className="text-muted-foreground">Grupos</dt>
            <dd className="tabular-nums">{previa.summary.groupCount}</dd>
            <dt className="text-muted-foreground">Itens</dt>
            <dd className="tabular-nums">{previa.summary.itemCount}</dd>
            <dt className="text-muted-foreground">Manuais / insumos</dt>
            <dd className="tabular-nums">
              {previa.summary.byType.MANUAL} / {previa.summary.byType.INSUMO}
            </dd>
            <dt className="text-muted-foreground">Composições / base</dt>
            <dd className="tabular-nums">
              {previa.summary.byType.COMPOSICAO} / {previa.summary.byType.REFERENCIA}
            </dd>
            <dt className="text-muted-foreground">Custo direto</dt>
            <dd className="tabular-nums">{formatMoney(previa.summary.directCost)}</dd>
          </dl>

          {previa.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{previa.errors.length} erro(s) — nada será importado</AlertTitle>
              <AlertDescription>
                <ul className="max-h-48 list-disc overflow-y-auto pl-4">
                  {previa.errors.map((problema, indice) => (
                    <li key={indice}>
                      {problema.row ? `Linha ${problema.row}: ` : ''}
                      {problema.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {previa.warnings.length > 0 && (
            <Alert>
              <AlertTitle>Avisos</AlertTitle>
              <AlertDescription>
                <ul className="max-h-32 list-disc overflow-y-auto pl-4">
                  {previa.warnings.map((aviso, indice) => (
                    <li key={indice}>
                      {aviso.row ? `Linha ${aviso.row}: ` : ''}
                      {aviso.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="button" variant="outline" onClick={analisar} disabled={!arquivo || analisando}>
          {analisando ? 'Analisando...' : 'Analisar'}
        </Button>
        <Button type="button" onClick={confirmar} disabled={!previa?.canImport || importar.isPending}>
          {importar.isPending ? 'Importando...' : 'Confirmar importação'}
        </Button>
      </div>
    </div>
  );
}
