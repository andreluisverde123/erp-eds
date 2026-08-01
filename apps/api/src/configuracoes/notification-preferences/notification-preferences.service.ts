import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NOTIFICATION_EVENTS } from './notification-events.constant';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /// Garante que toda empresa tenha uma linha por evento do catálogo,
  /// criando as que faltarem com os defaults do schema na primeira leitura.
  async findAll(companyId: string) {
    const existing = await this.prisma.notificationPreference.findMany({ where: { companyId } });
    const byKey = new Map(existing.map((preference) => [preference.eventKey, preference]));

    const missingKeys = NOTIFICATION_EVENTS.filter((event) => !byKey.has(event.key)).map(
      (event) => event.key,
    );
    if (missingKeys.length > 0) {
      await this.prisma.notificationPreference.createMany({
        data: missingKeys.map((eventKey) => ({ companyId, eventKey })),
        skipDuplicates: true,
      });
      const created = await this.prisma.notificationPreference.findMany({
        where: { companyId, eventKey: { in: missingKeys } },
      });
      for (const preference of created) byKey.set(preference.eventKey, preference);
    }

    return NOTIFICATION_EVENTS.map((event) => {
      const preference = byKey.get(event.key)!;
      return {
        id: preference.id,
        eventKey: event.key,
        label: event.label,
        module: event.module,
        channelSystem: preference.channelSystem,
        channelEmail: preference.channelEmail,
        channelWhatsapp: preference.channelWhatsapp,
        channelPush: preference.channelPush,
      };
    });
  }

  async update(companyId: string, eventKey: string, dto: UpdateNotificationPreferenceDto) {
    const eventDef = NOTIFICATION_EVENTS.find((event) => event.key === eventKey);
    if (!eventDef) {
      throw new BadRequestException('Evento de notificação desconhecido.');
    }

    const preference = await this.prisma.notificationPreference.upsert({
      where: { companyId_eventKey: { companyId, eventKey } },
      update: { channelSystem: dto.channelSystem, channelEmail: dto.channelEmail },
      create: {
        companyId,
        eventKey,
        channelSystem: dto.channelSystem,
        channelEmail: dto.channelEmail,
      },
    });

    return {
      id: preference.id,
      eventKey: eventDef.key,
      label: eventDef.label,
      module: eventDef.module,
      channelSystem: preference.channelSystem,
      channelEmail: preference.channelEmail,
      channelWhatsapp: preference.channelWhatsapp,
      channelPush: preference.channelPush,
    };
  }
}
