import { memo } from 'react';

import {
  Badge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { useUpdateNotificationPreference } from '../hooks/use-notification-preference-mutations';
import { getModuleLabel } from '../permission-modules';
import type { NotificationPreference } from '../types';

export const NotificationPreferencesTable = memo(function NotificationPreferencesTable({
  preferences,
}: {
  preferences: NotificationPreference[];
}) {
  const updateMutation = useUpdateNotificationPreference();

  function handleToggle(
    preference: NotificationPreference,
    field: 'channelSystem' | 'channelEmail',
    value: boolean,
  ) {
    updateMutation.mutate({
      eventKey: preference.eventKey,
      input: {
        channelSystem: field === 'channelSystem' ? value : preference.channelSystem,
        channelEmail: field === 'channelEmail' ? value : preference.channelEmail,
      },
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Evento</TableHead>
          <TableHead>Módulo</TableHead>
          <TableHead className="text-center">Sistema</TableHead>
          <TableHead className="text-center">E-mail</TableHead>
          <TableHead className="text-center">WhatsApp</TableHead>
          <TableHead className="text-center">Push</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preferences.map((preference) => (
          <TableRow key={preference.eventKey}>
            <TableCell className="font-medium text-foreground">{preference.label}</TableCell>
            <TableCell className="text-muted-foreground">
              {getModuleLabel(preference.module)}
            </TableCell>
            <TableCell className="text-center">
              <Switch
                checked={preference.channelSystem}
                onCheckedChange={(checked) => handleToggle(preference, 'channelSystem', checked)}
              />
            </TableCell>
            <TableCell className="text-center">
              <Switch
                checked={preference.channelEmail}
                onCheckedChange={(checked) => handleToggle(preference, 'channelEmail', checked)}
              />
            </TableCell>
            <TableCell className="text-center">
              <div className="flex flex-col items-center gap-1">
                <Switch checked={false} disabled />
                <Badge variant="outline" className="text-[10px]">
                  Em breve
                </Badge>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex flex-col items-center gap-1">
                <Switch checked={false} disabled />
                <Badge variant="outline" className="text-[10px]">
                  Em breve
                </Badge>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
