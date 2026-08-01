import { Global, Module } from '@nestjs/common';

import { ApprovalThresholdService } from './approval/approval-threshold.service';
import { AuditLoggerService } from './services/audit-logger.service';
import { UploadPolicyService } from './uploads/upload-policy.service';

/// Módulo transversal com serviços utilitários usados por qualquer módulo de
/// domínio (registro de auditoria, alçada de aprovação). Global para não exigir import
/// repetido em cada feature module, no mesmo padrão do PrismaModule.
@Global()
@Module({
  providers: [AuditLoggerService, ApprovalThresholdService, UploadPolicyService],
  exports: [AuditLoggerService, ApprovalThresholdService, UploadPolicyService],
})
export class CommonModule {}
