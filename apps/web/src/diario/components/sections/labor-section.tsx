import { useState } from 'react';
import { HardHat } from 'lucide-react';

import { laborApi } from '../../api';
import { useReportMutation } from '../../hooks/use-report-mutation';
import type { DiarioReportDetail, LaborItem } from '../../types';
import { ItemSheet, SheetField } from '../item-sheet';
import { CAMPO_ALTURA, CAMPO_CLASS } from '../sheet-field-styles';
import { ReportSectionCard } from '../report-section-card';
import { ItemCard, ItemList } from './item-list';

type Edicao = { modo: 'novo' } | { modo: 'editar'; item: LaborItem } | null;

/// Mão de obra: uma linha por função, com a quantidade.
///
/// O TOTAL não é um campo — é a soma das linhas, calculada no servidor e
/// exibida no cabeçalho da seção. Deixar alguém digitá-lo criaria dois números
/// para a mesma verdade, e o que diverge é sempre o que ninguém está olhando.
export function LaborSection({
  report,
  disabled,
}: {
  report: DiarioReportDetail;
  disabled: boolean;
}) {
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [funcao, setFuncao] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  const salvar = useReportMutation(report.id, (input: { role: string; quantity: number }) =>
    edicao?.modo === 'editar'
      ? laborApi.update(report.id, edicao.item.id, input)
      : laborApi.add(report.id, input),
  );
  const excluir = useReportMutation(report.id, (itemId: string) =>
    laborApi.remove(report.id, itemId),
  );

  function abrir(item?: LaborItem) {
    salvar.reset();
    setFuncao(item?.role ?? '');
    setQuantidade(String(item?.quantity ?? 1));
    setEdicao(item ? { modo: 'editar', item } : { modo: 'novo' });
  }

  return (
    <ReportSectionCard
      titulo="Mão de obra"
      icone={HardHat}
      descricao="Efetivo presente na obra."
      resumo={resumo(report)}
      concluida={report.summary.labor.roles > 0}
    >
      <ItemList
        vazio="Nenhuma função registrada."
        rotuloAdicionar="Adicionar função"
        disabled={disabled}
        onAdicionar={() => abrir()}
      >
        {report.labor.map((item) => (
          <ItemCard
            key={item.id}
            titulo={item.role}
            destaque={String(item.quantity)}
            disabled={disabled}
            onEditar={() => abrir(item)}
            onExcluir={() => excluir.mutate(item.id)}
            excluindo={excluir.isPending && excluir.variables === item.id}
          />
        ))}
      </ItemList>

      {report.labor.length > 0 && (
        <p className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums text-foreground">
            {report.summary.labor.workers}{' '}
            {report.summary.labor.workers === 1 ? 'profissional' : 'profissionais'}
          </span>
        </p>
      )}

      <ItemSheet
        aberta={edicao !== null}
        onFechar={() => setEdicao(null)}
        titulo={edicao?.modo === 'editar' ? 'Editar função' : 'Adicionar função'}
        rotuloAcao={edicao?.modo === 'editar' ? 'Salvar' : 'Adicionar'}
        salvando={salvar.isPending}
        erro={salvar.error}
        onSalvar={() =>
          salvar.mutate(
            { role: funcao.trim(), quantity: Number(quantidade) || 0 },
            { onSuccess: () => setEdicao(null) },
          )
        }
      >
        <SheetField id="labor-role" label="Função">
          <input
            id="labor-role"
            value={funcao}
            onChange={(evento) => setFuncao(evento.target.value)}
            maxLength={80}
            placeholder="Ex.: Pedreiro"
            className={`${CAMPO_CLASS} ${CAMPO_ALTURA}`}
          />
        </SheetField>

        <SheetField id="labor-quantity" label="Quantidade">
          <input
            id="labor-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={quantidade}
            onChange={(evento) => setQuantidade(evento.target.value)}
            className={`${CAMPO_CLASS} ${CAMPO_ALTURA}`}
          />
        </SheetField>
      </ItemSheet>
    </ReportSectionCard>
  );
}

function resumo(report: DiarioReportDetail): string | null {
  const { roles, workers } = report.summary.labor;
  if (roles === 0) return null;
  return `${roles} ${roles === 1 ? 'função' : 'funções'} · ${workers} ${
    workers === 1 ? 'pessoa' : 'pessoas'
  }`;
}
