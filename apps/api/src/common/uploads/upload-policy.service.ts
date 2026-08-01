import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/// Aplica as configurações de upload da empresa (Configurações → Sistema).
///
/// `allowAttachments` e `maxUploadSizeMb` existiam no banco desde o começo e
/// **nenhum módulo os consultava**: desligar anexos não desligava nada, e o
/// limite de tamanho era um número na tela sem efeito. Este serviço é o ponto
/// único onde as duas passam a valer, chamado por todos os caminhos de upload.
///
/// O limite fixo do Multer em cada controller continua existindo como teto de
/// segurança (o arquivo vai para a memória antes de chegar aqui); a
/// configuração da empresa só pode ser mais restritiva que ele.
@Injectable()
export class UploadPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertUploadAllowed(companyId: string, file: Express.Multer.File): Promise<void> {
    const settings = await this.prisma.systemSettings.findUnique({
      where: { companyId },
      select: { allowAttachments: true, maxUploadSizeMb: true },
    });

    // Empresa sem registro de configuração ainda usa os defaults do schema
    // (anexos permitidos, 10 MB) — o mesmo que a tela mostraria.
    if (settings && !settings.allowAttachments) {
      throw new ForbiddenException(
        'O envio de anexos está desativado nas configurações da empresa.',
      );
    }

    const maxBytes = (settings?.maxUploadSizeMb ?? 10) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `Arquivo de ${formatMb(file.size)} excede o limite de ${settings?.maxUploadSizeMb ?? 10} MB definido nas configurações.`,
      );
    }
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
