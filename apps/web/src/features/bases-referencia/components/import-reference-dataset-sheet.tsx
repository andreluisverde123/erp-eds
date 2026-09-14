import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { formatCompetence, REFERENCE_REGIME_LABELS } from '@/features/orcamentos/format';
import { ApiError } from '@/lib/api-client';

import { previewReferenceDataset } from '../api';
import { useImportReferenceDataset } from '../hooks';
import { BRAZILIAN_UFS, REFERENCE_SOURCE_LABELS } from '../labels';
import type { ReferenceDatasetPreview, ReferenceImportInput, ReferenceRegime, ReferenceSource } from '../types';

/// Importação de base referencial: fonte → arquivo → prévia → confirmação.
///
/// A prévia só lê os arquivos (nada é gravado). A confirmação reenvia os
/// mesmos arquivos, conferidos pelo hash, e grava tudo numa transação.
export function ImportReferenceDatasetSheet({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (datasetId: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Importar base de referência</SheetTitle>
          <SheetDescription>Arquivos oficiais do SINAPI (CAIXA) ou do SICRO (DNIT), em .xlsx.</SheetDescription>
        </div>
        {open && (
          <Corpo
            onDone={(id) => {
              onOpenChange(false);
              if (id) onImported?.(id);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Corpo({ onDone }: { onDone: (datasetId?: string) => void }) {
  const importar = useImportReferenceDataset();
  const [fonte, setFonte] = useState<ReferenceSource>('SINAPI');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [uf, setUf] = useState('');
  const [regime, setRegime] = useState<ReferenceRegime>('NAO_DESONERADO');
  const [versao, setVersao] = useState('');
  const [previa, setPrevia] = useState<ReferenceDatasetPreview | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrada = (): ReferenceImportInput => ({
    source: fonte,
    files: arquivos,
    uf: fonte === 'SINAPI' ? uf : undefined,
    regime: fonte === 'SINAPI' ? regime : undefined,
    versionLabel: versao,
  });

  const mudou = () => setPrevia(null);

  async function analisar() {
    setErro(null);
    if (arquivos.length === 0) return setErro('Escolha o arquivo da base.');
    if (fonte === 'SINAPI' && !uf) return setErro('Escolha a UF.');
    setAnalisando(true);
    try {
      setPrevia(await previewReferenceDataset(entrada()));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível analisar os arquivos.');
    } finally {
      setAnalisando(false);
    }
  }

  async function confirmar() {
    if (!previa) return;
    setErro(null);
    try {
      const dataset = await importar.mutateAsync({ input: entrada(), fileHash: previa.fileHash });
      onDone(dataset.id);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível importar a base.');
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {erro && (
          <Alert variant="destructive">
            <AlertTitle>{erro}</AlertTitle>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="base-fonte">Fonte</Label>
          <Select
            value={fonte}
            onValueChange={(valor) => {
              setFonte(valor as ReferenceSource);
              setArquivos([]);
              mudou();
            }}
          >
            <SelectTrigger id="base-fonte" aria-label="Fonte">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SINAPI">{REFERENCE_SOURCE_LABELS.SINAPI}</SelectItem>
              <SelectItem value="SICRO">{REFERENCE_SOURCE_LABELS.SICRO}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="base-arquivos">{fonte === 'SINAPI' ? 'Arquivo SINAPI_Referência_AAAA_MM.xlsx' : 'Relatórios do SICRO da UF (.xlsx)'}</Label>
          <Input
            key={fonte}
            id="base-arquivos"
            type="file"
            accept=".xlsx"
            multiple={fonte === 'SICRO'}
            onChange={(evento) => {
              setArquivos(Array.from(evento.target.files ?? []));
              mudou();
            }}
          />
          <p className="text-xs text-muted-foreground">
            {fonte === 'SINAPI'
              ? 'O .zip mensal da CAIXA traz o arquivo de referência com todas as UFs e os três regimes; cada importação grava uma UF e um regime.'
              : 'Extraia o .7z da UF e selecione os relatórios: analítico e sintético de composições, materiais, mão de obra e equipamentos. Os demais são ignorados.'}
          </p>
        </div>

        {fonte === 'SINAPI' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-uf">UF</Label>
              <Select
                value={uf}
                onValueChange={(valor) => {
                  setUf(valor);
                  mudou();
                }}
              >
                <SelectTrigger id="base-uf" aria-label="UF">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_UFS.map((sigla) => (
                    <SelectItem key={sigla} value={sigla}>
                      {sigla}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-regime">Regime</Label>
              <Select
                value={regime}
                onValueChange={(valor) => {
                  setRegime(valor as ReferenceRegime);
                  mudou();
                }}
              >
                <SelectTrigger id="base-regime" aria-label="Regime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REFERENCE_REGIME_LABELS) as ReferenceRegime[]).map((codigo) => (
                    <SelectItem key={codigo} value={codigo}>
                      {REFERENCE_REGIME_LABELS[codigo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="base-versao">Rótulo de versão (opcional)</Label>
          <Input
            id="base-versao"
            value={versao}
            maxLength={40}
            placeholder="Só para republicação da mesma competência, ex.: revisado"
            onChange={(evento) => {
              setVersao(evento.target.value);
              mudou();
            }}
          />
        </div>

        {previa && (
          <div className="flex flex-col gap-3" data-testid="previa-base">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <dt className="text-muted-foreground">Fonte</dt>
              <dd>{REFERENCE_SOURCE_LABELS[previa.source]}</dd>
              <dt className="text-muted-foreground">Competência</dt>
              <dd>{previa.competence ? formatCompetence(previa.competence) : '—'}</dd>
              <dt className="text-muted-foreground">Localização</dt>
              <dd>
                {previa.uf ?? '—'}
                {previa.locality ? ` — ${previa.locality}` : ''}
              </dd>
              <dt className="text-muted-foreground">Regime</dt>
              <dd>{REFERENCE_REGIME_LABELS[previa.regime]}</dd>
              <dt className="text-muted-foreground">Insumos</dt>
              <dd className="tabular-nums">
                {previa.itemCount.toLocaleString('pt-BR')}
                {previa.itemsWithoutPrice > 0 ? ` (${previa.itemsWithoutPrice} sem preço)` : ''}
              </dd>
              <dt className="text-muted-foreground">Composições</dt>
              <dd className="tabular-nums">
                {previa.compositionCount.toLocaleString('pt-BR')}
                {previa.compositionsWithoutCost > 0 ? ` (${previa.compositionsWithoutCost} sem custo)` : ''}
              </dd>
              <dt className="text-muted-foreground">Linhas analíticas</dt>
              <dd className="tabular-nums">{previa.componentCount.toLocaleString('pt-BR')}</dd>
            </dl>

            {previa.duplicate && (
              <Alert variant="destructive">
                <AlertTitle>Esta base já foi importada</AlertTitle>
                <AlertDescription>Para uma republicação da mesma competência, informe um rótulo de versão.</AlertDescription>
              </Alert>
            )}
            {previa.errorCount > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{previa.errorCount} erro(s) — a base não pode ser importada</AlertTitle>
                <AlertDescription>
                  <ul className="max-h-48 list-disc overflow-y-auto pl-4">
                    {previa.errors.map((problema, indice) => (
                      <li key={indice}>{problema.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {previa.warningCount > 0 && (
              <Alert>
                <AlertTitle>{previa.warningCount} aviso(s)</AlertTitle>
                <AlertDescription>
                  <ul className="max-h-40 list-disc overflow-y-auto pl-4">
                    {previa.warnings.map((aviso, indice) => (
                      <li key={indice}>{aviso.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancelar
        </Button>
        <Button type="button" variant="outline" onClick={analisar} disabled={analisando}>
          {analisando ? 'Analisando...' : 'Analisar arquivos'}
        </Button>
        <Button type="button" onClick={confirmar} disabled={!previa?.canImport || importar.isPending}>
          {importar.isPending ? 'Importando...' : 'Confirmar importação'}
        </Button>
      </div>
    </div>
  );
}
