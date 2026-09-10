import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { inicioDoDia } from '../employee-allocations/allocation-period';
import { QueryLaborCostDto } from './dto/query-labor-cost.dto';
import {
  custoBaseDoMes,
  empreitadaNoPeriodo,
  custoDoDiarista,
  DESCONHECIDO,
  percentualApropriado,
  ratearPorDiasPresentes,
  somar,
  type Custo,
} from './labor-cost';

/// Competência de um dia: `2026-09`. É a chave de `Payslip`, que é mensal — e
/// por isso a apropriação CLT é mensal também, como o enunciado pede: não se
/// inventa granularidade que a fonte de custo não tem.
function competencia(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface LinhaDeColaborador {
  employeeId: string;
  name: string;
  position: string;
  employmentType: string;
  compensationType: string;
  diasNaObra: number;
  /// Só faz sentido para CLT: o denominador do rateio.
  diasPresentesNoPeriodo: number;
  percentual: number | null;
  custo: Custo;
}

export interface LinhaDeEmpreitada {
  contractId: string;
  code: string;
  scope: string;
  contractorName: string;
  pricingType: string;
  unitLabel: string | null;
  unitPrice: string | null;
  measuredQuantity: string | null;
  /// Valor contratado ou medido acumulado — INFORMAÇÃO do contrato, e não
  /// custo deste período. Ver `empreitadaNoPeriodo`.
  valorInformado: string | null;
  rotuloDoValor: string;
  /// O que pode ser atribuído a este período. Hoje sempre desconhecido: sem
  /// medições datadas, não há como dizer quanto da empreitada foi consumido
  /// aqui.
  custo: Custo;
}

@Injectable()
export class LaborCostsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Custo de mão de obra de uma obra num período.
  ///
  /// Duas seções que NUNCA se misturam: colaboradores (próprios e
  /// terceirizados contratados como pessoa) e empreitadas (contrato com
  /// empresa). Somá-las como se fossem "salários" é o erro que o enunciado
  /// pede para não cometer, e é por isso que elas são listas separadas até o
  /// resumo.
  async byConstructionSite(companyId: string, query: QueryLaborCostDto) {
    await this.assertConstructionSite(companyId, query.constructionSiteId);

    const de = inicioDoDia(new Date(query.from));
    const ate = inicioDoDia(new Date(query.to));
    if (ate < de) {
      throw new BadRequestException('A data final não pode ser anterior à inicial.');
    }

    const colaboradores = await this.colaboradores(companyId, query.constructionSiteId, de, ate);
    const empreitadas = await this.empreitadas(companyId, query.constructionSiteId, de, ate);

    const proprios = somar(colaboradores.map((l) => l.custo));
    // Sempre R$ 0,00 apropriado enquanto os contratos não tiverem medições
    // datadas — e PARCIAL, para o zero não ser lido como "não houve
    // terceirizado". O valor de cada contrato continua visível na linha, como
    // informação contratual.
    const terceirizados = somar(empreitadas.map((l) => l.custo));

    return {
      constructionSiteId: query.constructionSiteId,
      from: query.from.slice(0, 10),
      to: query.to.slice(0, 10),
      colaboradores,
      empreitadas,
      resumo: {
        colaboradores: proprios,
        empreitadas: terceirizados,
        // "Custo CONHECIDO de mão de obra", nunca "custo total da obra": material,
        // equipamento e serviço são outros módulos e não passam por aqui.
        maoDeObra: somar([proprios, terceirizados]),
      },
    };
  }

  private async colaboradores(
    companyId: string,
    constructionSiteId: string,
    de: Date,
    ate: Date,
  ): Promise<LinhaDeColaborador[]> {
    // TODA a presença do período, de toda a empresa, numa consulta só. É o que
    // evita o N+1: o denominador do rateio CLT é "dias presentes em QUALQUER
    // obra", então buscar por colaborador exigiria uma consulta por pessoa.
    const presencas = await this.prisma.employeeAttendance.findMany({
      where: { date: { gte: de, lte: ate }, present: true, employee: { companyId } },
      select: {
        employeeId: true,
        constructionSiteId: true,
        date: true,
        dailyRateApplied: true,
        employee: {
          select: {
            id: true,
            name: true,
            position: true,
            employmentType: true,
            compensationType: true,
          },
        },
      },
    });

    const desteSite = presencas.filter((p) => p.constructionSiteId === constructionSiteId);
    const employeeIds = [...new Set(desteSite.map((p) => p.employeeId))];
    if (employeeIds.length === 0) return [];

    // Dias alocados nesta obra e AINDA sem apontamento: é o que torna o custo
    // parcial em vez de silenciosamente menor.
    const naoApontadosPorFuncionario = await this.naoApontados(
      companyId,
      constructionSiteId,
      employeeIds,
      de,
      ate,
    );

    const competencias = [...new Set(desteSite.map((p) => competencia(p.date)))];
    const holerites = await this.prisma.payslip.findMany({
      where: {
        employeeId: { in: employeeIds },
        deletedAt: null,
        employee: { companyId },
        OR: competencias.map((c) => ({
          referenceYear: Number(c.slice(0, 4)),
          referenceMonth: Number(c.slice(5)),
        })),
      },
    });
    const holeritePorChave = new Map(
      holerites.map((h) => [`${h.employeeId}|${h.referenceYear}-${String(h.referenceMonth).padStart(2, '0')}`, h]),
    );

    const linhas: LinhaDeColaborador[] = [];

    for (const employeeId of employeeIds) {
      const daPessoa = presencas.filter((p) => p.employeeId === employeeId);
      const naObra = daPessoa.filter((p) => p.constructionSiteId === constructionSiteId);
      const funcionario = naObra[0]!.employee;

      const base = {
        employeeId,
        name: funcionario.name,
        position: funcionario.position,
        employmentType: funcionario.employmentType,
        compensationType: funcionario.compensationType,
        diasNaObra: naObra.length,
      };

      if (funcionario.compensationType === 'DAILY') {
        linhas.push({
          ...base,
          diasPresentesNoPeriodo: naObra.length,
          percentual: null,
          custo: custoDoDiarista(naObra, naoApontadosPorFuncionario.get(employeeId) ?? 0),
        });
        continue;
      }

      // CLT: rateio mês a mês, porque a fonte de custo (`Payslip`) é mensal.
      // Somar os meses depois é o que faz o resultado respeitar salários
      // diferentes em meses diferentes dentro do mesmo período consultado.
      const porMes = new Map<string, { naObra: number; total: number }>();
      for (const p of daPessoa) {
        const mes = competencia(p.date);
        const atual = porMes.get(mes) ?? { naObra: 0, total: 0 };
        atual.total += 1;
        if (p.constructionSiteId === constructionSiteId) atual.naObra += 1;
        porMes.set(mes, atual);
      }

      const custosDoMes: Custo[] = [];
      for (const [mes, dias] of porMes) {
        if (dias.naObra === 0) continue;
        const holerite = holeritePorChave.get(`${employeeId}|${mes}`);
        if (!holerite) {
          custosDoMes.push(DESCONHECIDO(`sem holerite lançado em ${mes}`));
          continue;
        }
        custosDoMes.push(
          ratearPorDiasPresentes(custoBaseDoMes(holerite), dias.naObra, dias.total),
        );
      }

      const naoApontados = naoApontadosPorFuncionario.get(employeeId) ?? 0;
      const custo = somar(
        naoApontados > 0
          ? [
              ...custosDoMes,
              {
                estado: 'PARCIAL' as const,
                valor: null,
                faltando: [`${naoApontados} dia(s) alocado(s) ainda sem apontamento`],
              },
            ]
          : custosDoMes,
      );

      const diasTotais = daPessoa.length;
      linhas.push({
        ...base,
        diasPresentesNoPeriodo: diasTotais,
        percentual: percentualApropriado(naObra.length, diasTotais),
        custo,
      });
    }

    return linhas.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  /// Dias em que a pessoa estava ALOCADA nesta obra dentro do período e não há
  /// registro de apontamento nenhum — nem presente, nem ausente.
  ///
  /// Não é tratado como ausência: "não apontado" significa que ninguém olhou
  /// aquele dia, e transformá-lo em falta produziria um custo menor e
  /// convincente. Ele entra como PARCIALIDADE.
  private async naoApontados(
    companyId: string,
    constructionSiteId: string,
    employeeIds: string[],
    de: Date,
    ate: Date,
  ): Promise<Map<string, number>> {
    const [alocacoes, apontados] = await Promise.all([
      this.prisma.employeeAllocation.findMany({
        where: {
          employeeId: { in: employeeIds },
          constructionSiteId,
          deletedAt: null,
          startDate: { lte: ate },
          OR: [{ endDate: null }, { endDate: { gte: de } }],
          employee: { companyId },
        },
        select: { employeeId: true, startDate: true, endDate: true },
      }),
      this.prisma.employeeAttendance.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: de, lte: ate },
          employee: { companyId },
        },
        select: { employeeId: true, date: true },
      }),
    ]);

    const jaApontado = new Set(apontados.map((a) => `${a.employeeId}|${a.date.getTime()}`));
    const contagem = new Map<string, number>();

    for (const alocacao of alocacoes) {
      const inicio = alocacao.startDate > de ? alocacao.startDate : de;
      const fim = alocacao.endDate && alocacao.endDate < ate ? alocacao.endDate : ate;

      for (let dia = new Date(inicio); dia <= fim; dia.setUTCDate(dia.getUTCDate() + 1)) {
        if (jaApontado.has(`${alocacao.employeeId}|${dia.getTime()}`)) continue;
        contagem.set(alocacao.employeeId, (contagem.get(alocacao.employeeId) ?? 0) + 1);
      }
    }

    return contagem;
  }

  private async empreitadas(
    companyId: string,
    constructionSiteId: string,
    de: Date,
    ate: Date,
  ): Promise<LinhaDeEmpreitada[]> {
    const contratos = await this.prisma.contractorContract.findMany({
      where: {
        companyId,
        constructionSiteId,
        deletedAt: null,
        status: 'ACTIVE',
        // Contratos que TOCAM o período — quem começou antes e segue vigente
        // entra, que é o esperado por quem pergunta pelo mês.
        startDate: { lte: ate },
        endDate: { gte: de },
      },
      include: { contractor: { select: { legalName: true, tradeName: true } } },
    });

    return contratos.map((contrato) => {
      const { valorInformado, rotulo, custoDoPeriodo } = empreitadaNoPeriodo(contrato);
      return {
        contractId: contrato.id,
        code: contrato.code,
        scope: contrato.scope,
        contractorName: contrato.contractor.tradeName ?? contrato.contractor.legalName,
        pricingType: contrato.pricingType,
        unitLabel: contrato.unitLabel,
        unitPrice: contrato.unitPrice?.toString() ?? null,
        measuredQuantity: contrato.measuredQuantity?.toString() ?? null,
        valorInformado: valorInformado?.toString() ?? null,
        rotuloDoValor: rotulo,
        custo: custoDoPeriodo,
      };
    });
  }

  private async assertConstructionSite(companyId: string, constructionSiteId: string) {
    const site = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
    });
    if (!site) {
      throw new BadRequestException('Obra informada não existe.');
    }
  }
}
