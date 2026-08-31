/// Situação do RDO. O conteúdo do relatório (clima, mão de obra, atividades,
/// fotos…) ainda não existe — esta fundação lida só com identidade e acesso.
export type DailyReportStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';

/// Papel da pessoa DENTRO da obra, não no sistema: quem assina o diário como
/// responsável técnico e quem assina como fiscal.
export type SiteAssignmentRole = 'ENGINEER' | 'INSPECTOR';

export type ConstructionStatus = 'PLANNING' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

/// Uma obra como o Diário a enxerga. Todos os campos vêm da MESMA
/// `ConstructionSite` do ERP — não existe cadastro de obra paralelo.
export interface DiarioSite {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  responsibleName: string | null;
  status: ConstructionStatus;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  assignmentRole: SiteAssignmentRole;
  lastReportDate: string | null;
  reportCount: number;
}

export interface DiarioReport {
  id: string;
  number: number;
  reportDate: string;
  status: DailyReportStatus;
  createdAt: string;
  updatedAt: string;
  constructionSite: { id: string; code: string; name: string };
  createdBy: { id: string; name: string };
}

/// Prazo da obra visto DA DATA DO RELATÓRIO — calculado no backend. O
/// navegador só formata; não existe uma segunda conta aqui.
export interface ReportSchedule {
  startDate: string | null;
  expectedEndDate: string | null;
  totalDays: number | null;
  elapsedDays: number | null;
  /// Negativo quando o prazo já venceu. É para aparecer negativo mesmo.
  remainingDays: number | null;
}

/// O RDO aberto no editor. Tudo que a tela mostra no cabeçalho vem daqui
/// pronto — dia da semana, rótulo da situação e se pode editar são decisões do
/// servidor, não do navegador.
export interface DiarioReportDetail extends Omit<DiarioReport, 'constructionSite'> {
  weekday: string;
  statusLabel: string;
  editable: boolean;
  notes: string | null;
  constructionSite: DiarioSiteSummary;
  copiedFrom: { id: string; number: number; reportDate: string } | null;
  /// Quando o relatório foi finalizado, e por quem. Nulos enquanto é rascunho
  /// — e é essa nulidade que a tela usa para saber que ainda dá para editar,
  /// junto de `editable`.
  submittedAt: string | null;
  submittedBy: { id: string; name: string } | null;
  schedule: ReportSchedule;
  /// Horário de trabalho já em `HH:MM` — é o formato que o
  /// `<input type="time">` entende e o que a tela exibe.
  workSchedule: WorkSchedule;
  scheduleNotes: string | null;
  morningWeather: WeatherCondition | null;
  afternoonWeather: WeatherCondition | null;
  weatherNotes: string | null;
  labor: LaborItem[];
  equipment: EquipmentItem[];
  activities: ActivityItem[];
  occurrences: OccurrenceItem[];
  materials: MaterialItem[];
  photos: MediaItem[];
  videos: MediaItem[];
  summary: ReportSummary;
}

/// Os dados da obra que o RDO exibe. Mesmos campos de `DiarioSite`, sem o que
/// só a lista de obras usa (papel do vínculo, contagem de relatórios).
///
/// Não há `contractNumber`: a obra do ERP não tem esse campo hoje. O único
/// `contractNumber` do sistema pertence a `ContractorContract` — contrato com
/// empresa TERCEIRIZADA, outro documento — e usá-lo aqui exibiria um número
/// errado com cara de certo. A linha entra na tela quando o dado existir no
/// modelo certo.
export interface DiarioSiteSummary {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  responsibleName: string | null;
  status: ConstructionStatus;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
}

export type WeatherCondition = 'SUNNY' | 'PARTLY_CLOUDY' | 'CLOUDY' | 'RAIN' | 'STORM';

export type OccurrenceType =
  | 'MATERIAL'
  | 'LABOR'
  | 'EQUIPMENT'
  | 'WEATHER'
  | 'DESIGN'
  | 'SAFETY'
  | 'SCHEDULE'
  | 'INSPECTION'
  | 'STOPPAGE'
  | 'OTHER';

export interface LaborItem {
  id: string;
  role: string;
  quantity: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

export interface ActivityItem {
  id: string;
  description: string;
  location: string | null;
  notes: string | null;
  position: number;
}

/// Unidades do material. Os códigos são os MESMOS de `MEASUREMENT_UNITS`
/// (`src/lib/measurement-units.ts`), usados pelas solicitações de compra —
/// `SC`, `CX`, `PCT`. Aqui, porém, é um enum do banco: a lista não é
/// extensível pela tela, e um valor fora dela é recusado pela API.
export type MaterialUnit =
  'UN' | 'KG' | 'TON' | 'M' | 'M2' | 'M3' | 'L' | 'SC' | 'CX' | 'PCT' | 'OTHER';

export type MaterialMovementType = 'RECEIVED' | 'USED' | 'RETURNED' | 'OTHER';

export interface MaterialItem {
  id: string;
  name: string;
  /// Decimal do Prisma: vem como STRING no JSON, nunca number. Parsear com
  /// `Number()` antes de formatar — é a mesma convenção dos itens de
  /// solicitação de compra (ver `features/compras/types.ts`).
  quantity: string;
  unit: MaterialUnit;
  movementType: MaterialMovementType;
  notes: string | null;
}

export interface OccurrenceItem {
  id: string;
  type: OccurrenceType;
  description: string;
  /// Minutos desde a meia-noite, ou `null`. A conversão para "14:30" é feita
  /// na tela; o backend manda o número porque é o que ordena.
  occurredAtMinutes: number | null;
  notes: string | null;
}

/// Contagens derivadas das listas, calculadas no backend. Nada disso é
/// armazenado, e nada é recalculado aqui — o total de trabalhadores tem UMA
/// origem, e ela não é o navegador.
export interface ReportSummary {
  labor: { roles: number; workers: number };
  equipment: { items: number; units: number };
  activities: number;
  occurrences: number;
  /// Quantas MOVIMENTAÇÕES o dia teve. Não é saldo, não é total por unidade:
  /// somar 50 sacos com 2,5 m³ não significa nada.
  materials: number;
  photos: number;
  videos: number;
  hasSchedule: boolean;
  hasWeather: boolean;
  hasNotes: boolean;
}

export interface WorkSchedule {
  startTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  endTime: string | null;
}

export type MediaType = 'PHOTO' | 'VIDEO';

/// Uma foto ou vídeo do RDO.
///
/// NÃO há URL aqui, e é de propósito: o arquivo é servido por uma rota da API
/// que confere o vínculo com a obra a cada requisição. A tela monta o endereço
/// a partir dos ids (ver `mediaFileUrl`), e quem não tem acesso ao relatório
/// recebe 404 mesmo tendo o endereço em mãos.
export interface MediaItem {
  id: string;
  type: MediaType;
  /// Nome original do arquivo, guardado só como metadado.
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /// Dimensões medidas no servidor, a partir do cabeçalho do arquivo. Nulas
  /// para vídeo.
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface ReportFilters {
  siteId?: string;
  status?: DailyReportStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface DiarioHome {
  sites: DiarioSite[];
  recentReports: DiarioReport[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
