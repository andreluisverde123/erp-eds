import { useState } from 'react';
import { Coins } from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@repo/ui';

import { formatAmount } from '@/features/conciliacao/format';
import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { CustoEstado, CustoValor } from '@/features/rh/components/custo-badge';
import { getCompensationTypeLabel, getEmploymentTypeLabel } from '@/features/rh/employee-compensation';
import { useLaborCosts } from '@/features/rh/hooks/use-labor-costs';
import type { LaborCostReport } from '@/features/rh/types';

/// Custo de mão de obra apropriado a uma obra.
///
/// Duas seções que nunca se somam como se fossem a mesma coisa: colaboradores
/// (diária ou CLT rateado) e empreitadas (contrato com empresa). Misturá-las
/// como "salários" apagaria a diferença entre pagar uma pessoa e contratar um
/// serviço fechado.
///
/// O resumo se chama **custo conhecido de mão de obra**, e não "custo total da
/// obra": material, equipamento e serviço são outros módulos e não passam por
/// aqui.

const primeiroDiaDoMes = () => {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

export function CustosPage() {
  const [constructionSiteId, setConstructionSiteId] = useState<string | null>(null);
  const [from, setFrom] = useState(primeiroDiaDoMes);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: sitesData } = useConstructionSites({ limit: 100 });
  const { data, isLoading, isError } = useLaborCosts(constructionSiteId, from, to);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Custo de mão de obra
        </h1>
        <p className="text-sm text-muted-foreground">
          O que a obra consumiu de mão de obra própria e de empreitada no período.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={constructionSiteId ?? ''} onValueChange={setConstructionSiteId}>
          <SelectTrigger className="sm:w-[240px]" aria-label="Obra">
            <SelectValue placeholder="Escolha a obra" />
          </SelectTrigger>
          <SelectContent>
            {sitesData?.data.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          aria-label="Início"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="sm:w-[160px]"
        />
        <Input
          type="date"
          aria-label="Fim"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="sm:w-[160px]"
        />
      </div>

      {!constructionSiteId && (
        <EmptyState
          icon={Coins}
          title="Escolha a obra e o período"
          description="O custo é apropriado pelos dias efetivamente trabalhados."
        />
      )}

      {constructionSiteId && isError && (
        <ErrorState message="Não foi possível carregar os custos. Tente novamente." />
      )}

      {constructionSiteId && isLoading && !data && (
        <TableSkeleton columns={6} rows={5} message="Apurando custos..." />
      )}

      {constructionSiteId && data && <Relatorio relatorio={data} />}
    </div>
  );
}

function Relatorio({ relatorio }: { relatorio: LaborCostReport }) {
  const { colaboradores, empreitadas, resumo } = relatorio;
  const incompleto = resumo.maoDeObra.estado !== 'CONHECIDO';
  const temEmpreitadaSemTempo = empreitadas.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Resumo</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Resumo titulo="Mão de obra própria conhecida" custo={resumo.colaboradores} />
          {/* "Apropriados ao período" e não "terceirizados": o valor de cada
              contrato está na tabela abaixo. O que este card mostra é quanto
              disso pôde ser atribuído a ESTES dias — hoje, nada. */}
          <Resumo titulo="Terceirizados apropriados ao período" custo={resumo.empreitadas} />
          <Resumo titulo="Custo conhecido do período" custo={resumo.maoDeObra} destaque />
        </div>

        {/* O `Alert` do design system só tem `default` e `destructive`.
            Parcialidade não é erro — é informação faltando —, então usa o tom
            neutro, e o selo amarelo em cada linha é que localiza onde.

            A mensagem nomeia a CAUSA: contrato sem apropriação temporal é um
            problema diferente de holerite sem encargos, e a ação de cada um é
            outra. */}
        {incompleto && (
          <Alert>
            <AlertTitle>
              {temEmpreitadaSemTempo
                ? 'Custo parcial — existem contratos terceirizados sem apropriação temporal.'
                : 'Custo parcial — existem colaboradores ou períodos sem informação suficiente.'}
            </AlertTitle>
          </Alert>
        )}

        {temEmpreitadaSemTempo && (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-4 py-3">
            <span className="text-xs font-medium text-foreground">
              Valores terceirizados ainda não temporalizados
            </span>
            {/* Fora do total, mas à vista: o dinheiro existe e alguém precisa
                saber que ele está pendente de apropriação. */}
            <ul className="flex flex-col gap-0.5">
              {empreitadas
                .filter((linha) => linha.valorInformado !== null)
                .map((linha) => (
                  <li key={linha.contractId} className="text-xs text-muted-foreground">
                    {linha.scope} — {linha.rotuloDoValor.toLowerCase()} —{' '}
                    <span className="tabular-nums">{formatAmount(linha.valorInformado)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Mão de obra própria ({colaboradores.length})
        </h2>
        {colaboradores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguém apontado nesta obra no período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Remuneração</TableHead>
                <TableHead>Apropriação</TableHead>
                <TableHead className="text-right">Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colaboradores.map((linha) => (
                <TableRow key={linha.employeeId}>
                  <TableCell>
                    <p className="font-medium text-foreground">{linha.name}</p>
                    <p className="text-xs text-muted-foreground">{linha.position}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getEmploymentTypeLabel(linha.employmentType)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getCompensationTypeLabel(linha.compensationType)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {/* É aqui que o valor deixa de ser mágico: dá para refazer a
                        conta de cabeça a partir do que está escrito. */}
                    {linha.percentual === null ? (
                      <span>{linha.diasNaObra} dia(s) na obra</span>
                    ) : (
                      <span>
                        {linha.diasNaObra} de {linha.diasPresentesNoPeriodo} dias ·{' '}
                        {linha.percentual}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <CustoValor custo={linha.custo} />
                      <CustoEstado custo={linha.custo} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Terceirizados / empreitadas ({empreitadas.length})
        </h2>
        {empreitadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum contrato de empreitada vigente nesta obra no período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Base do valor</TableHead>
                <TableHead className="text-right">Valor do contrato</TableHead>
                <TableHead className="text-right">Apropriado ao período</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empreitadas.map((linha) => (
                <TableRow key={linha.contractId}>
                  <TableCell>
                    <p className="font-medium text-foreground">{linha.scope}</p>
                    <p className="text-xs text-muted-foreground">{linha.code}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{linha.contractorName}</TableCell>
                  <TableCell>
                    <Badge variant={linha.pricingType === 'GLOBAL' ? 'secondary' : 'info'}>
                      {linha.pricingType === 'GLOBAL' ? 'Preço global' : 'Preço unitário'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {linha.pricingType === 'GLOBAL' ? (
                      'Valor contratado'
                    ) : linha.measuredQuantity && linha.unitPrice ? (
                      <span>
                        {linha.measuredQuantity} {linha.unitLabel ?? ''} ×{' '}
                        {formatAmount(linha.unitPrice)}
                      </span>
                    ) : (
                      <span className="italic">Sem medição registrada</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {linha.valorInformado === null ? '—' : formatAmount(linha.valorInformado)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {linha.rotuloDoValor}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      {/* Sempre desconhecido hoje. A coluna existe separada da
                          anterior para deixar claro que ter valor não é o mesmo
                          que saber a QUE período ele pertence. */}
                      <CustoValor custo={linha.custo} />
                      <CustoEstado custo={linha.custo} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Resumo({
  titulo,
  custo,
  destaque = false,
}: {
  titulo: string;
  custo: LaborCostReport['resumo']['maoDeObra'];
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border px-4 py-3 ${
        destaque ? 'border-primary/40 bg-primary/5' : 'border-border'
      }`}
    >
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {custo.valor === null ? '—' : formatAmount(custo.valor)}
      </span>
      {custo.estado !== 'CONHECIDO' && <Badge variant="warning">Parcial</Badge>}
    </div>
  );
}
