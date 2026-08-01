import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { IndicatorsController } from './indicators/indicators.controller';
import { IndicatorsService } from './indicators/indicators.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

/// Módulo executivo — só leitura, consolida dados dos demais módulos em
/// cards/gráficos/relatórios exportáveis. Nenhum dos services daqui grava
/// nada nem depende dos services dos módulos de domínio (só do
/// PrismaService global), então não há risco de acoplamento reverso.
@Module({
  controllers: [DashboardController, IndicatorsController, ReportsController],
  providers: [DashboardService, IndicatorsService, ReportsService],
})
export class RelatoriosModule {}
