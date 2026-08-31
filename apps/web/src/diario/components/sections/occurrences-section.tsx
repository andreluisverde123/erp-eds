import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { cn } from '@repo/ui';

import { occurrenceApi } from '../../api';
import { useReportMutation } from '../../hooks/use-report-mutation';
import type { DiarioReportDetail, OccurrenceItem, OccurrenceType } from '../../types';
import { ItemSheet, SheetField } from '../item-sheet';
import { CAMPO_CLASS } from '../sheet-field-styles';
import { OCCURRENCE_LABEL, OCCURRENCE_OPTIONS, formatMinutes } from '../report-content';
import { ReportSectionCard } from '../report-section-card';
import { ItemCard, ItemList } from './item-list';

type Edicao = { modo: 'novo' } | { modo: 'editar'; item: OccurrenceItem } | null;

/// Ocorrências do dia.
///
/// O horário é OPCIONAL, e a tela precisa deixar isso óbvio: "chuva intensa
/// durante a tarde" é um registro legítimo sem hora, e um campo que pareça
/// obrigatório faria a pessoa inventar uma — um horário inventado num diário
/// de obra é pior que nenhum.
export function OccurrencesSection({
  report,
  disabled,
}: {
  report: DiarioReportDetail;
  disabled: boolean;
}) {
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [tipo, setTipo] = useState<OccurrenceType>('OTHER');
  const [descricao, setDescricao] = useState('');
  const [horario, setHorario] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const salvar = useReportMutation(
    report.id,
    (input: {
      type: OccurrenceType;
      description: string;
      occurredAtTime?: string | null;
      notes?: string;
    }) =>
      edicao?.modo === 'editar'
        ? occurrenceApi.update(report.id, edicao.item.id, input)
        : occurrenceApi.add(report.id, input),
  );
  const excluir = useReportMutation(report.id, (itemId: string) =>
    occurrenceApi.remove(report.id, itemId),
  );

  function abrir(item?: OccurrenceItem) {
    salvar.reset();
    setTipo(item?.type ?? 'OTHER');
    setDescricao(item?.description ?? '');
    setHorario(item ? (formatMinutes(item.occurredAtMinutes) ?? '') : '');
    setObservacoes(item?.notes ?? '');
    setEdicao(item ? { modo: 'editar', item } : { modo: 'novo' });
  }

  return (
    <ReportSectionCard
      titulo="Ocorrências"
      icone={ShieldAlert}
      descricao="Impedimentos, visitas e paralisações."
      resumo={
        report.summary.occurrences > 0
          ? `${report.summary.occurrences} ${report.summary.occurrences === 1 ? 'ocorrência' : 'ocorrências'}`
          : null
      }
      concluida={report.summary.occurrences > 0}
    >
      <ItemList
        vazio="Nenhuma ocorrência registrada."
        rotuloAdicionar="Registrar ocorrência"
        disabled={disabled}
        onAdicionar={() => abrir()}
      >
        {report.occurrences.map((item) => (
          <ItemCard
            key={item.id}
            titulo={item.description}
            destaque={formatMinutes(item.occurredAtMinutes) ?? undefined}
            linhas={[OCCURRENCE_LABEL[item.type], item.notes]}
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
        titulo={edicao?.modo === 'editar' ? 'Editar ocorrência' : 'Registrar ocorrência'}
        rotuloAcao={edicao?.modo === 'editar' ? 'Salvar' : 'Registrar'}
        salvando={salvar.isPending}
        erro={salvar.error}
        onSalvar={() =>
          salvar.mutate(
            {
              type: tipo,
              description: descricao.trim(),
              // String vazia vira `null`: é assim que a tela apaga um horário
              // informado por engano.
              occurredAtTime: horario || null,
              notes: observacoes.trim() || undefined,
            },
            { onSuccess: () => setEdicao(null) },
          )
        }
      >
        <SheetField id="ocor-tipo" label="Tipo">
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-labelledby="ocor-tipo">
            {OCCURRENCE_OPTIONS.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                role="radio"
                aria-checked={tipo === opcao.value}
                onClick={() => setTipo(opcao.value)}
                className={cn(
                  'flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tipo === opcao.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-background text-muted-foreground',
                )}
              >
                <opcao.icon className="size-4 shrink-0" />
                <span className="truncate">{opcao.label}</span>
              </button>
            ))}
          </div>
        </SheetField>

        <SheetField id="ocor-descricao" label="Descrição">
          <textarea
            id="ocor-descricao"
            rows={3}
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            maxLength={500}
            placeholder="Ex.: chuva forte interrompeu a concretagem."
            className={`${CAMPO_CLASS} resize-y py-3`}
          />
        </SheetField>

        <SheetField
          id="ocor-horario"
          label="Horário"
          hint="Opcional — deixe em branco se não houver"
        >
          <input
            id="ocor-horario"
            type="time"
            value={horario}
            onChange={(evento) => setHorario(evento.target.value)}
            className={`${CAMPO_CLASS} h-12 tabular-nums`}
          />
        </SheetField>

        <SheetField id="ocor-observacoes" label="Observações" hint="Opcional">
          <textarea
            id="ocor-observacoes"
            rows={2}
            value={observacoes}
            onChange={(evento) => setObservacoes(evento.target.value)}
            maxLength={500}
            className={`${CAMPO_CLASS} resize-y py-3`}
          />
        </SheetField>
      </ItemSheet>
    </ReportSectionCard>
  );
}
