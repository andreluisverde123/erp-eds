import { Module } from '@nestjs/common';

import { FiscalCertificateService } from './certificate/fiscal-certificate.service';
import { FiscalCryptoService } from './crypto/fiscal-crypto.service';
import { DfeClientService } from './dfe/dfe-client.service';
import { FiscalIntegrationController } from './fiscal-integration.controller';
import { FiscalIntegrationService } from './fiscal-integration.service';
import { FiscalSyncJob } from './sync/fiscal-sync.job';
import { FiscalSyncService } from './sync/fiscal-sync.service';

/// Integração Fiscal: sincronização automática dos documentos emitidos contra
/// o CNPJ da empresa, via Distribuição DF-e.
///
/// O módulo termina no ponto em que o XML é persistido e encaminhado — ele
/// NÃO interpreta o conteúdo. A leitura do documento (transformar o XML numa
/// nota conciliável) é do Processamento Fiscal, que consome
/// `FiscalDocument` com `status = FORWARDED`. Essa fronteira é deliberada:
/// baixar e guardar o documento legal é uma responsabilidade; entendê-lo é
/// outra, e misturá-las faria uma falha de parsing impedir a guarda do
/// original.
@Module({
  controllers: [FiscalIntegrationController],
  providers: [
    FiscalCryptoService,
    FiscalCertificateService,
    DfeClientService,
    FiscalSyncService,
    FiscalSyncJob,
    FiscalIntegrationService,
  ],
  exports: [FiscalSyncService],
})
export class FiscalModule {}
