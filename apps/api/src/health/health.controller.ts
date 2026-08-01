import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';

import { Public } from '../auth/decorators/public.decorator';
import { PrismaHealthIndicator } from './prisma.health-indicator';

const MAX_HEAP_BYTES = 300 * 1024 * 1024;
const MAX_RSS_BYTES = 500 * 1024 * 1024;

/// Sem `@Throttle`/RBAC de propósito: orquestradores (Kubernetes, ECS, Fly,
/// load balancer) batem aqui sem token, em alta frequência, antes de rotear
/// tráfego real. `@Public()` já os isenta do `JwtAuthGuard` global.
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.check('database'),
      () => this.memory.checkHeap('memory_heap', MAX_HEAP_BYTES),
      () => this.memory.checkRSS('memory_rss', MAX_RSS_BYTES),
    ]);
  }

  /// Liveness: só responde se o processo Node está de pé e o event loop
  /// não travou. Sem checar dependências externas — se o banco cair, o
  /// processo não deve ser reiniciado por isso (quem cuida disso é a
  /// readiness), só quando ele mesmo travar.
  @Public()
  @Get('liveness')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  /// Readiness: o processo está de pé E consegue falar com o banco. Um
  /// orquestrador usa isso para decidir se deve rotear tráfego pra essa
  /// instância — falhar aqui tira a instância do balanceamento sem matá-la.
  @Public()
  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.prismaIndicator.check('database')]);
  }
}
