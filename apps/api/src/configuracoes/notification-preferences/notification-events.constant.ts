export interface NotificationEventDef {
  key: string;
  label: string;
  module: string;
}

/// Catálogo fixo de eventos notificáveis, definido em código (mesmo padrão do
/// catálogo de Permissions em seed.ts) — não existe CRUD de eventos, só de
/// preferência de canal por evento já existente aqui.
export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  { key: 'purchase_request.created', label: 'Nova Solicitação de Compra', module: 'compras' },
  { key: 'purchase_order.issued', label: 'Nova Ordem', module: 'compras' },
  { key: 'payment.completed', label: 'Pagamento realizado', module: 'financeiro' },
  { key: 'employee.created', label: 'Funcionário cadastrado', module: 'rh' },
  { key: 'contract.expiring', label: 'Contrato vencendo', module: 'terceiros' },
];
