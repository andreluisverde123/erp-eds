import type { Readable } from 'node:stream';

/// Abstração de armazenamento de arquivos.
///
/// Existe porque disco local só funciona com UMA instância da API: com duas
/// réplicas, o holerite que subiu na instância A não existe para a B, e o
/// download falha de forma intermitente e difícil de diagnosticar. O driver
/// `s3` remove esse limite; o `local` continua sendo o padrão, para
/// desenvolvimento e instalação em servidor único.
///
/// A `key` é o caminho relativo já usado hoje nos registros do banco
/// (`payslips/<uuid>.pdf`), o que mantém `Attachment.fileUrl` e
/// `Company.logoUrl` válidos nos dois drivers — nenhuma migração de dados.
export interface StorageDriver {
  save(key: string, content: Buffer, contentType: string): Promise<void>;
  /// Stream para servir o arquivo pela API (mantendo os guards de permissão),
  /// em vez de expor URL assinada que escaparia deles.
  getStream(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
