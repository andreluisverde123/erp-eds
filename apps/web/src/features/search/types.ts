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

export const SEARCH_GROUP_LABELS: Record<keyof SearchResults, string> = {
  constructionSites: 'Obras',
  purchaseRequests: 'Solicitações',
  employees: 'Funcionários',
  suppliers: 'Fornecedores',
  contractors: 'Terceirizados',
  purchaseOrders: 'Ordens de Compra',
  invoices: 'Notas Fiscais',
};
