import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

export interface SearchResults {
  constructionSites: SearchResultItem[];
  purchaseRequests: SearchResultItem[];
  employees: SearchResultItem[];
  suppliers: SearchResultItem[];
  contractors: SearchResultItem[];
  purchaseOrders: SearchResultItem[];
  invoices: SearchResultItem[];
}

const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

const EMPTY_RESULTS: SearchResults = {
  constructionSites: [],
  purchaseRequests: [],
  employees: [],
  suppliers: [],
  contractors: [],
  purchaseOrders: [],
  invoices: [],
};

/// Busca global do Header. Obras e Solicitações têm tela de detalhe própria
/// — o resultado navega direto pro registro. As demais entidades não têm
/// detalhe dedicado ainda, então o resultado leva pra listagem do módulo
/// correspondente (ver evoluções futuras).
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(companyId: string, term: string): Promise<SearchResults> {
    const query = term.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return EMPTY_RESULTS;
    }

    const insensitive = { contains: query, mode: 'insensitive' as const };

    const [
      constructionSites,
      purchaseRequests,
      employees,
      suppliers,
      contractors,
      purchaseOrders,
      invoices,
    ] = await Promise.all([
      this.prisma.constructionSite.findMany({
        where: { companyId, deletedAt: null, OR: [{ name: insensitive }, { code: insensitive }] },
        select: { id: true, code: true, name: true },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.purchaseRequest.findMany({
        where: { companyId, deletedAt: null, code: insensitive },
        // A obra voltou a ser o destino da solicitação e agora é obrigatória —
        // o centro de custo é que passou a ser opcional, e um subtítulo que
        // some em metade dos resultados não serve.
        select: { id: true, code: true, constructionSite: { select: { name: true } } },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.employee.findMany({
        where: { companyId, deletedAt: null, OR: [{ name: insensitive }, { cpf: insensitive }] },
        select: { id: true, name: true, position: true },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.supplier.findMany({
        where: {
          companyId,
          deletedAt: null,
          OR: [{ legalName: insensitive }, { tradeName: insensitive }, { document: insensitive }],
        },
        select: { id: true, legalName: true, tradeName: true },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.contractor.findMany({
        where: {
          companyId,
          deletedAt: null,
          OR: [{ legalName: insensitive }, { tradeName: insensitive }, { document: insensitive }],
        },
        select: { id: true, legalName: true, tradeName: true },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { companyId, deletedAt: null, code: insensitive },
        select: {
          id: true,
          code: true,
          supplier: { select: { legalName: true, tradeName: true } },
        },
        take: RESULTS_PER_TYPE,
      }),
      this.prisma.invoice.findMany({
        where: { companyId, deletedAt: null, number: insensitive },
        select: {
          id: true,
          number: true,
          supplier: { select: { legalName: true, tradeName: true } },
        },
        take: RESULTS_PER_TYPE,
      }),
    ]);

    return {
      constructionSites: constructionSites.map((site) => ({
        id: site.id,
        title: site.name,
        subtitle: site.code,
        path: `/engenharia/obras/${site.id}`,
      })),
      purchaseRequests: purchaseRequests.map((request) => ({
        id: request.id,
        title: request.code,
        subtitle: request.constructionSite.name,
        path: `/engenharia/solicitacoes/${request.id}`,
      })),
      employees: employees.map((employee) => ({
        id: employee.id,
        title: employee.name,
        subtitle: employee.position,
        path: '/rh/funcionarios',
      })),
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        title: supplier.tradeName ?? supplier.legalName,
        subtitle: supplier.legalName,
        path: '/compras/fornecedores',
      })),
      contractors: contractors.map((contractor) => ({
        id: contractor.id,
        title: contractor.tradeName ?? contractor.legalName,
        subtitle: contractor.legalName,
        path: '/engenharia/terceiros?tab=empresas',
      })),
      purchaseOrders: purchaseOrders.map((order) => ({
        id: order.id,
        title: order.code,
        subtitle: order.supplier.tradeName ?? order.supplier.legalName,
        path: '/compras/ordens-de-compra',
      })),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        title: invoice.number,
        subtitle: invoice.supplier.tradeName ?? invoice.supplier.legalName,
        path: '/financeiro/notas-fiscais',
      })),
    };
  }
}
