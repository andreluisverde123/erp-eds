export type ConnectionStatus =
  'OK' | 'SEM_CERTIFICADO' | 'CERTIFICADO_EXPIRADO' | 'BLOQUEADO' | 'ERRO';

export type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'EMPTY' | 'SKIPPED' | 'ERROR';
export type SyncTrigger = 'SCHEDULED' | 'MANUAL';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CertificateInfo {
  cnpj: string;
  subjectName: string;
  issuerName: string;
  /// Já vem mascarado pela API — só os últimos dígitos.
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  isActive: boolean;
  expirado: boolean;
  diasParaExpirar: number;
  uploadedAt: string;
}

export interface SyncRun {
  id: string;
  trigger: SyncTrigger;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  documentsFound: number;
  documentsImported: number;
  documentsSkipped: number;
  nsuTo: string | null;
  maxNSU: string | null;
  errorMessage: string | null;
  xMotivo: string | null;
  triggeredBy: { id: string; name: string } | null;
}

export interface IntegrationStatus {
  connection: {
    status: ConnectionStatus;
    agendamentoAtivo: boolean;
    proximaExecucao: string | null;
    bloqueadoAte: string | null;
    motivoBloqueio: string | null;
  };
  certificate: CertificateInfo | null;
  sync: {
    lastNSU: string;
    maxNSU: string;
    /// Quantos documentos a SEFAZ ainda tem para entregar.
    pendentesNaFila: number;
    lastSyncAt: string | null;
    lastSuccessAt: string | null;
    totalImported: number;
  };
  lastRun: SyncRun | null;
  documents: {
    total: number;
    porTipo: Record<string, number>;
  };
}

export interface TestConnectionResult {
  ok: boolean;
  tempoMs: number;
  cStat: string | null;
  mensagem: string;
  cnpj?: string;
}

export interface SyncResult {
  status: SyncStatus;
  documentsFound: number;
  documentsImported: number;
  documentsSkipped: number;
  lastNSU: string;
  maxNSU: string;
  message: string | null;
  durationMs: number;
}
