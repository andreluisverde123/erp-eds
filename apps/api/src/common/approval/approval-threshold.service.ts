import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/// Alçada de aprovação: acima de um valor definido pela empresa, a ação exige
/// uma permissão a mais (`<módulo>.approve`) além da permissão de escrita.
///
/// Por que um serviço só para isso: a regra é idêntica em Compras e
/// Financeiro, e é o primeiro lugar do sistema em que `SystemSettings` deixa
/// de ser apenas armazenado e passa a mudar o comportamento da API.
///
/// O limite nasce em `0`, que significa **sem alçada** — nenhuma empresa
/// existente muda de comportamento até um administrador definir um valor.
@Injectable()
export class ApprovalThresholdService {
  private readonly logger = new Logger(ApprovalThresholdService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertWithinPurchaseThreshold(
    companyId: string,
    permissions: string[],
    amount: number,
  ): Promise<void> {
    const settings = await this.prisma.systemSettings.findUnique({
      where: { companyId },
      select: { purchaseApprovalThreshold: true },
    });

    this.assert({
      companyId,
      permissions,
      amount,
      threshold: Number(settings?.purchaseApprovalThreshold ?? 0),
      permission: 'compras.approve',
      action: 'aprovar esta solicitação',
    });
  }

  async assertWithinPaymentThreshold(
    companyId: string,
    permissions: string[],
    amount: number,
  ): Promise<void> {
    const settings = await this.prisma.systemSettings.findUnique({
      where: { companyId },
      select: { paymentApprovalThreshold: true },
    });

    this.assert({
      companyId,
      permissions,
      amount,
      threshold: Number(settings?.paymentApprovalThreshold ?? 0),
      permission: 'financeiro.approve',
      action: 'registrar este pagamento',
    });
  }

  private assert(input: {
    companyId: string;
    permissions: string[];
    amount: number;
    threshold: number;
    permission: string;
    action: string;
  }): void {
    const { companyId, permissions, amount, threshold, permission, action } = input;

    if (threshold <= 0) return; // alçada desligada
    if (amount <= threshold) return;
    if (permissions.includes(permission)) return;

    this.logger.warn(
      `Alçada bloqueou ${permission} na empresa ${companyId}: valor ${amount} acima do limite ${threshold}.`,
    );
    throw new ForbiddenException(
      `Valor de ${formatCurrency(amount)} acima da alçada de ${formatCurrency(threshold)}: ${action} exige aprovação de um responsável.`,
    );
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
