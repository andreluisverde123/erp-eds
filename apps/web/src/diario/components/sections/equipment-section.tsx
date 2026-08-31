import { useState } from 'react';
import { Truck } from 'lucide-react';

import { equipmentApi } from '../../api';
import { useReportMutation } from '../../hooks/use-report-mutation';
import type { DiarioReportDetail, EquipmentItem } from '../../types';
import { ItemSheet, SheetField } from '../item-sheet';
import { CAMPO_ALTURA, CAMPO_CLASS } from '../sheet-field-styles';
import { ReportSectionCard } from '../report-section-card';
import { ItemCard, ItemList } from './item-list';

type Edicao = { modo: 'novo' } | { modo: 'editar'; item: EquipmentItem } | null;

/// Equipamentos presentes na obra NO DIA.
///
/// A lista é a do dia, não a frota da empresa: um equipamento cadastrado no
/// ERP não está automaticamente nesta obra nesta data, e assumir que está
/// encheria o RDO de linhas que ninguém conferiu.
export function EquipmentSection({
  report,
  disabled,
}: {
  report: DiarioReportDetail;
  disabled: boolean;
}) {
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [situacao, setSituacao] = useState('');

  const salvar = useReportMutation(
    report.id,
    (input: { name: string; quantity: number; notes?: string }) =>
      edicao?.modo === 'editar'
        ? equipmentApi.update(report.id, edicao.item.id, input)
        : equipmentApi.add(report.id, input),
  );
  const excluir = useReportMutation(report.id, (itemId: string) =>
    equipmentApi.remove(report.id, itemId),
  );

  function abrir(item?: EquipmentItem) {
    salvar.reset();
    setNome(item?.name ?? '');
    setQuantidade(String(item?.quantity ?? 1));
    setSituacao(item?.notes ?? '');
    setEdicao(item ? { modo: 'editar', item } : { modo: 'novo' });
  }

  return (
    <ReportSectionCard
      titulo="Equipamentos"
      icone={Truck}
      descricao="Máquinas e equipamentos do dia."
      resumo={resumo(report)}
      concluida={report.summary.equipment.items > 0}
    >
      <ItemList
        vazio="Nenhum equipamento registrado."
        rotuloAdicionar="Adicionar equipamento"
        disabled={disabled}
        onAdicionar={() => abrir()}
      >
        {report.equipment.map((item) => (
          <ItemCard
            key={item.id}
            titulo={item.name}
            destaque={String(item.quantity)}
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
        titulo={edicao?.modo === 'editar' ? 'Editar equipamento' : 'Adicionar equipamento'}
        rotuloAcao={edicao?.modo === 'editar' ? 'Salvar' : 'Adicionar'}
        salvando={salvar.isPending}
        erro={salvar.error}
        onSalvar={() =>
          salvar.mutate(
            {
              name: nome.trim(),
              quantity: Number(quantidade) || 0,
              notes: situacao.trim() || undefined,
            },
            { onSuccess: () => setEdicao(null) },
          )
        }
      >
        <SheetField id="equip-name" label="Equipamento">
          <input
            id="equip-name"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            maxLength={80}
            placeholder="Ex.: Betoneira"
            className={`${CAMPO_CLASS} ${CAMPO_ALTURA}`}
          />
        </SheetField>

        <SheetField id="equip-quantity" label="Quantidade">
          <input
            id="equip-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={quantidade}
            onChange={(evento) => setQuantidade(evento.target.value)}
            className={`${CAMPO_CLASS} ${CAMPO_ALTURA}`}
          />
        </SheetField>

        <SheetField id="equip-notes" label="Situação" hint="Opcional">
          <input
            id="equip-notes"
            value={situacao}
            onChange={(evento) => setSituacao(evento.target.value)}
            maxLength={200}
            placeholder="Ex.: em manutenção"
            className={`${CAMPO_CLASS} ${CAMPO_ALTURA}`}
          />
        </SheetField>
      </ItemSheet>
    </ReportSectionCard>
  );
}

function resumo(report: DiarioReportDetail): string | null {
  const { items, units } = report.summary.equipment;
  if (items === 0) return null;
  return `${items} ${items === 1 ? 'registro' : 'registros'} · ${units} ${
    units === 1 ? 'unidade' : 'unidades'
  }`;
}
