import { Module } from '@nestjs/common';

import { InboundInvoicesController } from './inbound-invoices/inbound-invoices.controller';
import { InboundInvoicesService } from './inbound-invoices/inbound-invoices.service';

/// Conciliação de Notas Fiscais: recebe a nota, sugere a ordem de compra
/// compatível e, na confirmação, gera o financeiro.
///
/// Módulo separado de `FinanceiroModule` de propósito, embora apareça sob o
/// menu Financeiro. O financeiro existente trata do que já é dívida
/// (`Invoice` -> `AccountPayable` -> `Payment`); aqui se trata do documento
/// que ainda pode não virar dívida nenhuma. A ponte entre os dois é a
/// `Invoice` criada no ato da conciliação — este módulo não escreve em
/// contas a pagar por nenhum outro caminho.
@Module({
  controllers: [InboundInvoicesController],
  providers: [InboundInvoicesService],
})
export class ConciliacaoModule {}
