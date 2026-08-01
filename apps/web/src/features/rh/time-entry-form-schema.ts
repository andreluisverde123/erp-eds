import { z } from 'zod';

export const timeEntryFormSchema = z.object({
  employeeId: z.string().min(1, 'Selecione o funcionário.'),
  constructionSiteId: z.string().optional(),
  date: z.string().min(1, 'Informe a data.'),
  /// Horário puro (ex.: "08:00"), combinado com `date` no envio — ver
  /// `toTimeEntryInput`.
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  notes: z.string().max(300, 'Máximo de 300 caracteres.').optional(),
});

export type TimeEntryFormValues = z.infer<typeof timeEntryFormSchema>;

export const TIME_ENTRY_FORM_DEFAULTS: TimeEntryFormValues = {
  employeeId: '',
  constructionSiteId: '',
  date: new Date().toISOString().slice(0, 10),
  checkIn: '',
  checkOut: '',
  notes: '',
};

function combineDateAndTime(date: string, time?: string): string | undefined {
  if (!time) return undefined;
  return new Date(`${date}T${time}:00`).toISOString();
}

export function toTimeEntryInput(values: TimeEntryFormValues) {
  return {
    employeeId: values.employeeId,
    constructionSiteId: values.constructionSiteId || undefined,
    date: values.date,
    checkIn: combineDateAndTime(values.date, values.checkIn),
    checkOut: combineDateAndTime(values.date, values.checkOut),
    notes: values.notes || undefined,
  };
}
