/// Onde é possível anexar arquivo, e quem pode.
///
/// Mesmo padrão do catálogo da lixeira: um registro central em vez de um
/// endpoint de upload por módulo. Antes disto, só holerite, documento de
/// contrato e as telas de Processos aceitavam anexo — uma obra não tinha onde
/// guardar o alvará, e um pagamento não tinha onde guardar o comprovante.
export interface AttachmentEntity {
  /// Nome do modelo no schema, usado na URL.
  model: string;
  label: string;
  module: 'engenharia' | 'compras' | 'financeiro' | 'rh' | 'terceiros';
  /// Filtro de posse usado para confirmar que o registro é da empresa de quem
  /// está anexando — sem isso daria para pendurar arquivo no id de outro
  /// tenant (o anexo ficaria invisível para ele, mas é sujeira mesmo assim).
  scope: (companyId: string) => Record<string, unknown>;
}

const byCompany = (companyId: string) => ({ companyId });
const byAccountPayable = (companyId: string) => ({ accountPayable: { companyId } });

export const ATTACHMENT_ENTITIES: AttachmentEntity[] = [
  { model: 'ConstructionSite', label: 'Obra', module: 'engenharia', scope: byCompany },
  { model: 'PurchaseRequest', label: 'Solicitação de compra', module: 'compras', scope: byCompany },
  { model: 'PurchaseOrder', label: 'Ordem de compra', module: 'compras', scope: byCompany },
  { model: 'Supplier', label: 'Fornecedor', module: 'compras', scope: byCompany },
  { model: 'Invoice', label: 'Nota fiscal', module: 'financeiro', scope: byCompany },
  { model: 'AccountPayable', label: 'Conta a pagar', module: 'financeiro', scope: byCompany },
  { model: 'Payment', label: 'Pagamento', module: 'financeiro', scope: byAccountPayable },
  { model: 'Employee', label: 'Funcionário', module: 'rh', scope: byCompany },
  { model: 'Contractor', label: 'Terceirizado', module: 'terceiros', scope: byCompany },
  { model: 'ContractorContract', label: 'Contrato', module: 'terceiros', scope: byCompany },
];

export function findAttachmentEntity(model: string): AttachmentEntity | undefined {
  return ATTACHMENT_ENTITIES.find((entity) => entity.model === model);
}
