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
    /// Bloqueio REAL da SEFAZ (`cStat 656`). Exige ação: não insistir.
    bloqueadoAte: string | null;
    motivoBloqueio: string | null;
    /// Espera preventiva entre consultas, decidida pelo próprio sistema. É
    /// rotina — informa, não alarma.
    esperaPreventivaAte: string | null;
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

/// O aviso de vencimento do certificado, para o bloco de pendências da Home.
///
/// Enxuto de propósito: a Home é aberta por toda pessoa que entra no sistema, e
/// não deve trafegar titular, emissor e serial do certificado para desenhar uma
/// linha de aviso. O painel de Administração continua usando `CertificateInfo`.
export interface CertificateAlert {
  /// `EXPIRED` — venceu, e a sincronização fiscal está PARADA agora.
  /// `EXPIRING` — vence dentro de 30 dias; ainda funciona.
  /// `OK` — nada a avisar (inclui empresa sem certificado configurado).
  status: 'OK' | 'EXPIRING' | 'EXPIRED';
  notAfter: string | null;
  /// Negativo quando já venceu — é o que permite dizer "vencido há 8 dias".
  diasParaExpirar: number | null;
}
