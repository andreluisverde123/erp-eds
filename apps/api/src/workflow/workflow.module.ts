import { Module } from '@nestjs/common';

import { WorkflowAttachmentsController } from './attachments/workflow-attachments.controller';
import { WorkflowAttachmentsService } from './attachments/workflow-attachments.service';
import { WorkflowCommentsController } from './comments/workflow-comments.controller';
import { WorkflowCommentsService } from './comments/workflow-comments.service';
import { ComprasPipelineController } from './compras/compras-pipeline.controller';
import { ComprasPipelineService } from './compras/compras-pipeline.service';
import { WorkflowEventsController } from './events/workflow-events.controller';
import { WorkflowEventsService } from './events/workflow-events.service';
import { FinanceiroPipelineController } from './financeiro/financeiro-pipeline.controller';
import { FinanceiroPipelineService } from './financeiro/financeiro-pipeline.service';
import { RhPipelineController } from './rh/rh-pipeline.controller';
import { RhPipelineService } from './rh/rh-pipeline.service';

/// Camada de visualização/gestão de workflow — só lê as tabelas de
/// Compras/Financeiro/RH (mesmo padrão de agregação somente-leitura já usado
/// por Relatórios e Busca Global) e só escreve em infraestrutura
/// compartilhada (AuditLog via AuditLoggerService, Attachment, o novo
/// WorkflowComment). Nenhum arquivo dentro de compras/financeiro/rh é
/// importado ou alterado por este módulo.
@Module({
  controllers: [
    ComprasPipelineController,
    FinanceiroPipelineController,
    RhPipelineController,
    WorkflowEventsController,
    WorkflowCommentsController,
    WorkflowAttachmentsController,
  ],
  providers: [
    ComprasPipelineService,
    FinanceiroPipelineService,
    RhPipelineService,
    WorkflowEventsService,
    WorkflowCommentsService,
    WorkflowAttachmentsService,
  ],
})
export class WorkflowModule {}
