import { useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@repo/ui';

import { materialApi } from '../../api';
import { useReportMutation } from '../../hooks/use-report-mutation';
import type {
  DiarioReportDetail,
  MaterialItem,
  MaterialMovementType,
  MaterialUnit,
} from '../../types';
import { ItemSheet, SheetField } from '../item-sheet';
import {
  MATERIAL_MOVEMENT_CLASS,
  MATERIAL_MOVEMENT_LABEL,
  MATERIAL_MOVEMENT_OPTIONS,
  MATERIAL_UNIT_OPTIONS,
  formatQuantity,
} from '../report-content';
import { ReportSectionCard } from '../report-section-card';
import { CAMPO_CLASS } from '../sheet-field-styles';
import { ItemCard, ItemList } from './item-list';

type Edicao = { modo: 'novo' } | { modo: 'editar'; item: MaterialItem } | null;

/// Materiais movimentados no dia.
///
/// **Não é estoque.** Não há saldo, custo, fornecedor nem acumulado — a seção
/// responde "o que aconteceu com os materiais na obra hoje", e nada além. O
/// resumo conta MOVIMENTAÇÕES, não quantidades: somar 50 sacos com 2,5 m³ não
/// significa coisa alguma.
export function MaterialsSection({
  report,
  disabled,
}: {
  report: DiarioReportDetail;
  disabled: boolean;
}) {
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState<MaterialUnit>('UN');
  const [movimentacao, setMovimentacao] = useState<MaterialMovementType>('RECEIVED');
  const [observacoes, setObservacoes] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const salvar = useReportMutation(
    report.id,
    (input: {
      name: string;
      quantity: number;
      unit: MaterialUnit;
      movementType: MaterialMovementType;
      notes?: string;
    }) =>
      edicao?.modo === 'editar'
        ? materialApi.update(report.id, edicao.item.id, input)
        : materialApi.add(report.id, input),
  );
  const excluir = useReportMutation(report.id, (itemId: string) =>
    materialApi.remove(report.id, itemId),
  );

  function abrir(item?: MaterialItem) {
    salvar.reset();
    setErroLocal(null);
    setNome(item?.name ?? '');
    // `Number()` desfaz o `50.000` que o Decimal serializa, para o campo abrir
    // com "50" e não com um número que parece cinquenta mil.
    setQuantidade(item ? String(Number(item.quantity)) : '');
    setUnidade(item?.unit ?? 'UN');
    setMovimentacao(item?.movementType ?? 'RECEIVED');
    setObservacoes(item?.notes ?? '');
    setEdicao(item ? { modo: 'editar', item } : { modo: 'novo' });
  }

  function enviar() {
    // Antecipa o que o backend vai recusar, para a pessoa não perder uma ida à
    // rede por causa de um campo em branco. A autoridade continua sendo a API:
    // isto é conveniência, não validação.
    const nomeLimpo = nome.trim();
    // Vírgula é o separador decimal do teclado brasileiro, e o `<input
    // type="number">` de alguns Android a entrega como está.
    const numero = Number(quantidade.replace(',', '.'));

    if (!nomeLimpo) {
      setErroLocal('Informe o material.');
      return;
    }
    if (!Number.isFinite(numero) || numero <= 0) {
      setErroLocal('A quantidade deve ser maior que zero.');
      return;
    }

    setErroLocal(null);
    salvar.mutate(
      {
        name: nomeLimpo,
        quantity: numero,
        unit: unidade,
        movementType: movimentacao,
        notes: observacoes.trim() || undefined,
      },
      { onSuccess: () => setEdicao(null) },
    );
  }

  return (
    <ReportSectionCard
      titulo="Materiais"
      icone={Package}
      descricao="Recebimentos, consumo e devoluções do dia."
      resumo={
        report.summary.materials > 0
          ? `${report.summary.materials} ${report.summary.materials === 1 ? 'movimentação' : 'movimentações'}`
          : null
      }
      concluida={report.summary.materials > 0}
    >
      <ItemList
        vazio="Nenhum material registrado neste dia."
        rotuloAdicionar="Adicionar material"
        disabled={disabled}
        onAdicionar={() => abrir()}
      >
        {report.materials.map((item) => (
          <ItemCard
            key={item.id}
            titulo={item.name}
            etiqueta={
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  MATERIAL_MOVEMENT_CLASS[item.movementType],
                )}
              >
                {MATERIAL_MOVEMENT_LABEL[item.movementType]}
              </span>
            }
            destaque={formatQuantity(item.quantity, item.unit)}
            linhas={[item.notes]}
            disabled={disabled}
            onEditar={() => abrir(item)}
            onExcluir={() => excluir.mutate(item.id)}
            excluindo={excluir.isPending && excluir.variables === item.id}
          />
        ))}
      </ItemList>

      <ItemSheet
        aberta={edicao !== null}
        onFechar={() => setEdicao(null)}
        titulo={edicao?.modo === 'editar' ? 'Editar material' : 'Adicionar material'}
        rotuloAcao={edicao?.modo === 'editar' ? 'Salvar' : 'Adicionar material'}
        salvando={salvar.isPending}
        erro={erroLocal ?? salvar.error}
        onSalvar={enviar}
      >
        <SheetField id="mat-nome" label="Material">
          <input
            id="mat-nome"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            maxLength={120}
            placeholder="Ex.: Cimento CP-II"
            className={`${CAMPO_CLASS} h-12`}
          />
        </SheetField>

        {/* Quantidade e unidade lado a lado: são uma informação só, e separá-las
            em duas linhas empurraria a movimentação para fora da tela quando o
            teclado abre. */}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <SheetField id="mat-quantidade" label="Quantidade">
            <input
              id="mat-quantidade"
              type="number"
              inputMode="decimal"
              // `step` decimal: sem ele o navegador recusa "2,5" como inválido
              // e o campo fica vazio sem dizer por quê.
              step="0.001"
              min={0}
              value={quantidade}
              onChange={(evento) => setQuantidade(evento.target.value)}
              placeholder="0"
              className={`${CAMPO_CLASS} h-12`}
            />
          </SheetField>

          <SheetField id="mat-unidade" label="Unidade">
            <select
              id="mat-unidade"
              value={unidade}
              onChange={(evento) => setUnidade(evento.target.value as MaterialUnit)}
              // `<select>` nativo, e não o do design system: no celular ele
              // abre a roda de opções do próprio sistema, que é mais rápida de
              // operar com o polegar do que uma lista desenhada em HTML.
              className={`${CAMPO_CLASS} h-12 w-28`}
            >
              {MATERIAL_UNIT_OPTIONS.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </SheetField>
        </div>

        <SheetField id="mat-movimentacao" label="Movimentação">
          <div
            className="grid grid-cols-2 gap-1.5"
            role="radiogroup"
            aria-labelledby="mat-movimentacao"
          >
            {MATERIAL_MOVEMENT_OPTIONS.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                role="radio"
                aria-checked={movimentacao === opcao.value}
                onClick={() => setMovimentacao(opcao.value)}
                className={cn(
                  'h-11 rounded-lg border px-3 text-sm font-medium',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  movimentacao === opcao.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-background text-muted-foreground',
                )}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </SheetField>

        <SheetField id="mat-observacoes" label="Observações" hint="Opcional">
          <textarea
            id="mat-observacoes"
            rows={2}
            value={observacoes}
            onChange={(evento) => setObservacoes(evento.target.value)}
            maxLength={500}
            placeholder="Ex.: entregue pela manhã, nota conferida."
            className={`${CAMPO_CLASS} resize-y py-3`}
          />
        </SheetField>
      </ItemSheet>
    </ReportSectionCard>
  );
}
