import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useUpdateSystemSettings } from '../hooks/use-system-settings-mutations';
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  systemSettingsFormSchema,
  THEME_OPTIONS,
  TIMEZONE_OPTIONS,
  WEEKDAY_OPTIONS,
  type SystemSettingsFormValues,
} from '../system-settings-form-schema';
import type { SystemSettings } from '../types';

function settingsToFormValues(settings: SystemSettings): SystemSettingsFormValues {
  return {
    erpName: settings.erpName,
    theme: settings.theme,
    language: settings.language,
    timezone: settings.timezone,
    currency: settings.currency,
    dateFormat: settings.dateFormat,
    firstDayOfWeek: String(settings.firstDayOfWeek),
    dueDateAlertDays: String(settings.dueDateAlertDays),
    maxUploadSizeMb: String(settings.maxUploadSizeMb),
    purchaseApprovalThreshold: String(settings.purchaseApprovalThreshold ?? '0'),
    paymentApprovalThreshold: String(settings.paymentApprovalThreshold ?? '0'),
    allowAttachments: settings.allowAttachments,
    notificationsEnabled: settings.notificationsEnabled,
    auditEnabled: settings.auditEnabled,
  };
}

export function SystemSettingsForm({ settings }: { settings: SystemSettings }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const updateMutation = useUpdateSystemSettings();

  const form = useForm<SystemSettingsFormValues>({
    resolver: zodResolver(systemSettingsFormSchema),
    defaultValues: settingsToFormValues(settings),
  });

  async function onSubmit(values: SystemSettingsFormValues) {
    setSubmitError(null);
    setSaved(false);
    try {
      await updateMutation.mutateAsync({
        erpName: values.erpName,
        theme: values.theme,
        language: values.language,
        timezone: values.timezone,
        currency: values.currency,
        dateFormat: values.dateFormat,
        firstDayOfWeek: Number(values.firstDayOfWeek),
        dueDateAlertDays: Number(values.dueDateAlertDays),
        maxUploadSizeMb: Number(values.maxUploadSizeMb),
        purchaseApprovalThreshold: Number(values.purchaseApprovalThreshold),
        paymentApprovalThreshold: Number(values.paymentApprovalThreshold),
        allowAttachments: values.allowAttachments,
        notificationsEnabled: values.notificationsEnabled,
        auditEnabled: values.auditEnabled,
      });
      setSaved(true);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : 'Não foi possível salvar. Tente novamente.',
      );
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-3xl flex-col gap-4"
        noValidate
      >
        {submitError && (
          <Alert variant="destructive">
            <AlertTitle>{submitError}</AlertTitle>
          </Alert>
        )}
        {saved && !submitError && (
          <Alert>
            <AlertTitle>Configurações salvas.</AlertTitle>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Preferências gerais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="erpName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do ERP</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tema</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {THEME_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Idioma</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIMEZONE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moeda</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Formato de Data</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DATE_FORMAT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="firstDayOfWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primeiro dia da semana</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {WEEKDAY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueDateAlertDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias para alerta de vencimento</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxUploadSizeMb"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tamanho máximo de upload (MB)</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alçada de aprovação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="purchaseApprovalThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compras acima de (R$)</FormLabel>
                  <FormControl>
                    <NumberInput {...field} value={field.value ?? ''} placeholder="0,00" />
                  </FormControl>
                  <FormDescription>
                    Aprovar solicitação acima deste valor exige a permissão &quot;Aprovar
                    compras&quot;. Zero desliga a alçada.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentApprovalThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pagamentos acima de (R$)</FormLabel>
                  <FormControl>
                    <NumberInput {...field} value={field.value ?? ''} placeholder="0,00" />
                  </FormControl>
                  <FormDescription>
                    Registrar pagamento acima deste valor exige a permissão &quot;Aprovar
                    pagamentos&quot;. Zero desliga a alçada.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comportamento</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="allowAttachments"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <FormLabel>Permitir anexos</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Habilita o upload de arquivos nos módulos que suportam anexos.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notificationsEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <FormLabel>Ativar notificações</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Liga/desliga o envio de notificações do sistema.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="auditEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <FormLabel>Ativar auditoria</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Liga/desliga o registro de eventos na trilha de auditoria.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
