import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicatorResult } from '@nestjs/terminus';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async check(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { [key]: { status: 'up' } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha desconhecida ao conectar no banco.';
      throw new HealthCheckError('Banco de dados indisponível.', {
        [key]: { status: 'down', message },
      });
    }
  }
}
