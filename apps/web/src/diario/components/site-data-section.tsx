import { Building2 } from 'lucide-react';

import type { DiarioSiteSummary, ReportSchedule } from '../types';
import { ReportSectionCard } from './report-section-card';
import { formatReportDate } from './report-status';

/// Dados da obra dentro do RDO.
///
/// Tudo vem de `ConstructionSite`, a MESMA obra do ERP — o Diário não tem
/// cadastro próprio de obra e nenhum destes campos foi criado para esta tela.
///
/// Não há linha de "número do contrato": a obra do ERP não tem esse campo. O
/// único `contractNumber` do sistema pertence a `ContractorContract`, que é o
/// contrato com uma empresa TERCEIRIZADA — outro documento, outra parte. Exibir
/// aquele número aqui mostraria um dado errado com aparência de certo, e criar
/// uma coluna só para preencher esta tela seria decidir modelagem pela
/// interface. A linha entra quando o dado existir no lugar certo.
export function SiteDataSection({
  site,
  schedule,
}: {
  site: DiarioSiteSummary;
  schedule: ReportSchedule;
}) {
  return (
    <ReportSectionCard titulo="Dados da obra" icone={Building2} descricao={site.code} aberta>
      <dl className="text-sm">
        <Linha rotulo="Obra" valor={site.name} />
        <Linha rotulo="Contratante" valor={site.clientName} />
        <Linha rotulo="Responsável" valor={site.responsibleName} />
        <Linha rotulo="Endereço" valor={endereco(site)} />
        <Linha
          rotulo="Prazo contratual"
          valor={
            schedule.startDate && schedule.expectedEndDate
              ? `${formatReportDate(schedule.startDate)} a ${formatReportDate(schedule.expectedEndDate)}`
              : null
          }
        />
        {/* Os três números vêm calculados do backend, a partir da data DESTE
            relatório. Nenhuma conta de prazo acontece no navegador: duas
            implementações da mesma conta é como "prazo decorrido" passa a ter
            dois valores diferentes na mesma tela. */}
        <Linha rotulo="Decorrido" valor={emDias(schedule.elapsedDays)} />
        <Linha rotulo="A vencer" valor={prazoRestante(schedule.remainingDays)} />
      </dl>
    </ReportSectionCard>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-right text-foreground">{valor ?? '—'}</dd>
    </div>
  );
}

function endereco(site: DiarioSiteSummary): string | null {
  const cidade = [site.city, site.state].filter(Boolean).join('/');
  return [site.addressLine, cidade].filter(Boolean).join(' — ') || null;
}

function emDias(dias: number | null): string | null {
  if (dias === null) return null;
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/// Prazo vencido aparece como atraso, e não como "0 dias": esconder o sinal
/// negativo esconderia exatamente a informação que a obra precisa ver.
function prazoRestante(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias < 0) {
    const atraso = Math.abs(dias);
    return `${atraso} ${atraso === 1 ? 'dia' : 'dias'} em atraso`;
  }
  return emDias(dias);
}
