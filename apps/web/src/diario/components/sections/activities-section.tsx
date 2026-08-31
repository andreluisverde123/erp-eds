import { useState } from 'react';
import { Wrench } from 'lucide-react';

import { activityApi } from '../../api';
import { useReportMutation } from '../../hooks/use-report-mutation';
import type { ActivityItem, DiarioReportDetail } from '../../types';
import { ItemSheet, SheetField } from '../item-sheet';
import { CAMPO_CLASS } from '../sheet-field-styles';
import { ReportSectionCard } from '../report-section-card';
import { ItemCard, ItemList } from './item-list';

type Edicao = { modo: 'novo' } | { modo: 'editar'; item: ActivityItem } | null;

/// Atividades executadas — a seção principal do RDO.
///
/// A ordem é a de criação, atribuída pelo servidor. Não há arrastar-e-soltar:
/// numa tela de celular ele exige um gesto longo e preciso que a mão de quem
/// está em obra não faz bem, e a coluna de posição já está no banco para
/// quando houver uma forma melhor de reordenar.
export function ActivitiesSection({
  report,
  disabled,
}: {
  report: DiarioReportDetail;
  disabled: boolean;
}) {
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const salvar = useReportMutation(
    report.id,
    (input: { description: string; location?: string; notes?: string }) =>
      edicao?.modo === 'editar'
        ? activityApi.update(report.id, edicao.item.id, input)
        : activityApi.add(report.id, input),
  );
  const excluir = useReportMutation(report.id, (itemId: string) =>
    activityApi.remove(report.id, itemId),
  );

  function abrir(item?: ActivityItem) {
    salvar.reset();
    setDescricao(item?.description ?? '');
    setLocal(item?.location ?? '');
    setObservacoes(item?.notes ?? '');
    setEdicao(item ? { modo: 'editar', item } : { modo: 'novo' });
  }

  return (
    <ReportSectionCard
      titulo="Atividades executadas"
      icone={Wrench}
      descricao="Serviços e frentes de trabalho."
      resumo={
        report.summary.activities > 0
          ? `${report.summary.activities} ${report.summary.activities === 1 ? 'atividade' : 'atividades'}`
          : null
      }
      concluida={report.summary.activities > 0}
    >
      <ItemList
        vazio="Nenhuma atividade registrada."
        rotuloAdicionar="Adicionar atividade"
        disabled={disabled}
        onAdicionar={() => abrir()}
      >
        {report.activities.map((item) => (
          <ItemCard
            key={item.id}
            titulo={item.description}
            linhas={[item.location, item.notes]}
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
        titulo={edicao?.modo === 'editar' ? 'Editar atividade' : 'Adicionar atividade'}
        rotuloAcao={edicao?.modo === 'editar' ? 'Salvar' : 'Adicionar atividade'}
        salvando={salvar.isPending}
        erro={salvar.error}
        onSalvar={() =>
          salvar.mutate(
            {
              description: descricao.trim(),
              location: local.trim() || undefined,
              notes: observacoes.trim() || undefined,
            },
            { onSuccess: () => setEdicao(null) },
          )
        }
      >
        <SheetField id="ativ-descricao" label="Descrição da atividade">
          <textarea
            id="ativ-descricao"
            rows={3}
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            maxLength={500}
            placeholder="Ex.: execução da alvenaria do pavimento 03."
            className={`${CAMPO_CLASS} resize-y py-3`}
          />
        </SheetField>

        <SheetField id="ativ-local" label="Local" hint="Opcional">
          <input
            id="ativ-local"
            value={local}
            onChange={(evento) => setLocal(evento.target.value)}
            maxLength={120}
            placeholder="Ex.: Pavimento 03"
            className={`${CAMPO_CLASS} h-12`}
          />
        </SheetField>

        <SheetField id="ativ-observacoes" label="Observações" hint="Opcional">
          <textarea
            id="ativ-observacoes"
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
