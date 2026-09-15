/// Módulos DESLIGADOS neste produto.
///
/// **Orçamentos** — composições, preços de referência, bases SINAPI/SICRO e o
/// orçamento com EAP — foi guardado para o SaaS Engeo (decisão de 15/09/2026):
/// a EDS não vai usá-lo. O código continua no repositório, com os testes, e
/// sai só da interface: menu, rotas, quadro de orçamentos da obra, preços de
/// referência do insumo e as permissões na tela de papéis.
///
/// O cadastro de **Insumos** fica: as solicitações de compra usam o
/// autocomplete dele.
///
/// Religar = `true` (e rebuild do web). A API continua respondendo, protegida
/// pelas permissões `composicoes.*` e `orcamentos.*` de sempre.
export const MODULO_ORCAMENTOS_ATIVO = false;

/// Módulos de permissão que não aparecem na tela de papéis enquanto desligados.
export const MODULOS_DE_PERMISSAO_DESLIGADOS: readonly string[] = MODULO_ORCAMENTOS_ATIVO
  ? []
  : ['composicoes', 'orcamentos'];
