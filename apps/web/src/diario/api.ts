import { downloadFile } from '@/lib/download-file';
import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  DiarioHome,
  DiarioReport,
  DiarioReportDetail,
  DiarioSite,
  MaterialMovementType,
  MaterialUnit,
  OccurrenceType,
  PaginatedResult,
  ReportFilters,
  WeatherCondition,
} from './types';

/// O Diário fala com as rotas `/diario/*` da MESMA API do ERP, com o mesmo
/// access token. Não há segundo cliente HTTP, segunda base de URL nem segundo
/// mecanismo de sessão: `apiClient` já resolve token, refresh silencioso e
/// erro padronizado para as duas experiências.
export function getHome(): Promise<DiarioHome> {
  return apiClient.get('/diario/home');
}

export function listSites(): Promise<DiarioSite[]> {
  return apiClient.get('/diario/obras');
}

export function getSite(id: string): Promise<DiarioSite> {
  return apiClient.get(`/diario/obras/${id}`);
}

export function listReports(
  query: ReportFilters & { page?: number; limit?: number },
): Promise<PaginatedResult<DiarioReport>> {
  return apiClient.get(`/diario/relatorios${toQueryString(query)}`);
}

export function getReport(id: string): Promise<DiarioReportDetail> {
  return apiClient.get(`/diario/relatorios/${id}`);
}

/// Cria o relatório. Nem `number` nem `status` são enviados: o número é
/// gerado pelo servidor sob lock e todo RDO nasce em rascunho. Mandá-los
/// daqui devolveria a corrida ao navegador.
export function createReport(input: {
  constructionSiteId: string;
  reportDate: string;
}): Promise<DiarioReportDetail> {
  return apiClient.post('/diario/relatorios', input);
}

/// Campos escalares do relatório — observações, horário e clima.
///
/// Todos passam pelo MESMO PATCH, e por isso pelo mesmo autosave: não há um
/// segundo mecanismo de salvamento para as seções novas.
export interface ReportPatch {
  reportDate?: string;
  notes?: string;
  workStartTime?: string | null;
  workBreakStartTime?: string | null;
  workBreakEndTime?: string | null;
  workEndTime?: string | null;
  scheduleNotes?: string;
  morningWeather?: WeatherCondition | null;
  afternoonWeather?: WeatherCondition | null;
  weatherNotes?: string;
}

/// Salvamento incremental — manda só o que mudou. Devolve o relatório inteiro
/// para a tela poder exibir "salvo às HH:MM" com a hora do SERVIDOR: relógio
/// de celular de obra erra com uma frequência que surpreende.
export function updateReport(id: string, input: ReportPatch): Promise<DiarioReportDetail> {
  return apiClient.patch(`/diario/relatorios/${id}`, input);
}

// ---------------------------------------------------------------------------
// Listas do RDO
// ---------------------------------------------------------------------------
//
// Todas as operações devolvem o RELATÓRIO inteiro, com o resumo recalculado.
// São mais bytes e é de propósito: a tela precisa do "5 funções · 18 pessoas"
// atualizado a cada mudança, e devolver só o item obrigaria a uma segunda
// requisição — numa conexão de canteiro, uma ida a mais custa mais que os
// bytes a mais.

export interface LaborInput {
  role: string;
  quantity: number;
}

export interface EquipmentInput {
  name: string;
  quantity: number;
  notes?: string;
}

export interface ActivityInput {
  description: string;
  location?: string;
  notes?: string;
}

export interface OccurrenceInput {
  type: OccurrenceType;
  description: string;
  occurredAtTime?: string | null;
  notes?: string;
}

const item = (reportId: string, secao: string, itemId?: string) =>
  `/diario/relatorios/${reportId}/${secao}${itemId ? `/${itemId}` : ''}`;

export const laborApi = {
  add: (reportId: string, input: LaborInput) =>
    apiClient.post<DiarioReportDetail>(item(reportId, 'mao-de-obra'), input),
  update: (reportId: string, itemId: string, input: Partial<LaborInput>) =>
    apiClient.patch<DiarioReportDetail>(item(reportId, 'mao-de-obra', itemId), input),
  remove: (reportId: string, itemId: string) =>
    apiClient.delete<DiarioReportDetail>(item(reportId, 'mao-de-obra', itemId)),
};

export const equipmentApi = {
  add: (reportId: string, input: EquipmentInput) =>
    apiClient.post<DiarioReportDetail>(item(reportId, 'equipamentos'), input),
  update: (reportId: string, itemId: string, input: Partial<EquipmentInput>) =>
    apiClient.patch<DiarioReportDetail>(item(reportId, 'equipamentos', itemId), input),
  remove: (reportId: string, itemId: string) =>
    apiClient.delete<DiarioReportDetail>(item(reportId, 'equipamentos', itemId)),
};

export const activityApi = {
  add: (reportId: string, input: ActivityInput) =>
    apiClient.post<DiarioReportDetail>(item(reportId, 'atividades'), input),
  update: (reportId: string, itemId: string, input: Partial<ActivityInput>) =>
    apiClient.patch<DiarioReportDetail>(item(reportId, 'atividades', itemId), input),
  remove: (reportId: string, itemId: string) =>
    apiClient.delete<DiarioReportDetail>(item(reportId, 'atividades', itemId)),
};

export interface MaterialInput {
  name: string;
  /// `number` na entrada, `string` na saída: a API recebe número e devolve o
  /// Decimal serializado. A assimetria é da convenção do projeto, não desta
  /// tela.
  quantity: number;
  unit: MaterialUnit;
  movementType: MaterialMovementType;
  notes?: string;
}

export const materialApi = {
  add: (reportId: string, input: MaterialInput) =>
    apiClient.post<DiarioReportDetail>(item(reportId, 'materiais'), input),
  update: (reportId: string, itemId: string, input: Partial<MaterialInput>) =>
    apiClient.patch<DiarioReportDetail>(item(reportId, 'materiais', itemId), input),
  remove: (reportId: string, itemId: string) =>
    apiClient.delete<DiarioReportDetail>(item(reportId, 'materiais', itemId)),
};

/// Mídia do RDO.
///
/// O upload é UMA requisição multipart — não há "pedir URL / enviar /
/// confirmar". O storage do ERP não emite URL assinada (o driver local grava
/// em disco e não teria como), e o caminho de três passos criaria justamente o
/// registro pendente que um upload interrompido deixaria para trás.
export const mediaApi = {
  upload: (
    reportId: string,
    file: File,
    extras: { durationSeconds?: number; thumbnail?: File | null },
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    // Miniatura gerada no navegador, no mesmo passo em que a foto já é
    // redimensionada. Opcional: sem ela a grade cai no original.
    if (extras.thumbnail) formData.append('thumbnail', extras.thumbnail);
    // Tipo, MIME, tamanho e dimensões NÃO são enviados: o servidor os obtém do
    // próprio arquivo. Mandá-los daqui seria pedir para a validação de
    // segurança confiar em quem envia.
    if (extras.durationSeconds !== undefined) {
      formData.append('durationSeconds', String(extras.durationSeconds));
    }

    return apiClient.uploadWithProgress<DiarioReportDetail>(
      item(reportId, 'midias'),
      formData,
      onProgress,
      signal,
    );
  },
  remove: (reportId: string, mediaId: string) =>
    apiClient.delete<DiarioReportDetail>(item(reportId, 'midias', mediaId)),
};

/// Endereço do arquivo ORIGINAL. Montado a partir dos ids, e não guardado no
/// banco: é uma rota da API, protegida pelos mesmos guards do relatório.
export function mediaFileUrl(reportId: string, mediaId: string): string {
  return `${item(reportId, 'midias', mediaId)}/arquivo`;
}

/// Endereço da MINIATURA. Rota própria — o cache do navegador distingue os dois
/// objetos pela URL, e a grade nunca toca no original.
///
/// Tão protegida quanto ele: mesma checagem de vínculo com a obra, mesmo 404
/// para quem não tem acesso.
export function mediaThumbnailUrl(reportId: string, mediaId: string): string {
  return `${item(reportId, 'midias', mediaId)}/miniatura`;
}

export const occurrenceApi = {
  add: (reportId: string, input: OccurrenceInput) =>
    apiClient.post<DiarioReportDetail>(item(reportId, 'ocorrencias'), input),
  update: (reportId: string, itemId: string, input: Partial<OccurrenceInput>) =>
    apiClient.patch<DiarioReportDetail>(item(reportId, 'ocorrencias', itemId), input),
  remove: (reportId: string, itemId: string) =>
    apiClient.delete<DiarioReportDetail>(item(reportId, 'ocorrencias', itemId)),
};

/// Finaliza o relatório: `DRAFT` -> `SUBMITTED`, sem volta.
///
/// POST numa rota própria, e não `PATCH { status }`: finalizar é uma ação de
/// domínio (valida pendências, carimba autor e instante, fecha o documento), e
/// como POST ela não se confunde com o autosave.
export function submitReport(id: string): Promise<DiarioReportDetail> {
  return apiClient.post(`/diario/relatorios/${id}/finalizar`);
}

/// Cria um relatório novo a partir de `sourceId`. A obra NÃO viaja no corpo:
/// ela é derivada do relatório de origem no backend, o que torna "copiar de
/// outra obra" impossível em vez de apenas proibido.
export function copyReport(
  sourceId: string,
  input: { reportDate: string },
): Promise<DiarioReportDetail> {
  return apiClient.post(`/diario/relatorios/${sourceId}/copia`, input);
}

/// Baixa o RDO em PDF.
///
/// Passa pelo `downloadFile`, e não por um `<a href>`: a rota exige o header
/// Authorization, e o token vive em memória — um link simples chegaria à API
/// sem credencial e receberia 401.
///
/// O nome do arquivo é montado aqui, e não lido do `Content-Disposition`: o
/// `fetch` só expõe esse header com CORS configurado para tal, e a informação
/// para montá-lo (obra, número, data) a tela já tem.
export function exportReportPdf(report: {
  id: string;
  number: number;
  reportDate: string;
  constructionSite: { code: string };
}): Promise<void> {
  const data = report.reportDate.slice(0, 10);
  const nome = `RDO-${report.constructionSite.code}-${String(report.number).padStart(3, '0')}-${data}.pdf`;

  return downloadFile(`/diario/relatorios/${report.id}/pdf`, nome);
}

/// Exclui um rascunho, definitivamente.
///
/// Sem corpo na resposta (204): o recurso deixou de existir, então quem chamou
/// navega para fora em vez de reexibir o relatório.
export function deleteReport(id: string): Promise<void> {
  return apiClient.delete(`/diario/relatorios/${id}`);
}
