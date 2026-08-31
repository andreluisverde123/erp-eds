import {
  AlertTriangle,
  CloudRain,
  CloudSun,
  Cloudy,
  CalendarClock,
  ClipboardCheck,
  HardHat,
  Package,
  PencilRuler,
  ShieldAlert,
  Sun,
  Truck,
  Octagon,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type {
  MaterialMovementType,
  MaterialUnit,
  OccurrenceType,
  WeatherCondition,
} from '../types';

/// Condições do tempo, na ordem do céu limpo ao fechado. A ordem importa: numa
/// fileira de botões, a pessoa aprende a posição e passa a tocar sem ler.
export const WEATHER_OPTIONS: { value: WeatherCondition; label: string; icon: LucideIcon }[] = [
  { value: 'SUNNY', label: 'Ensolarado', icon: Sun },
  { value: 'PARTLY_CLOUDY', label: 'Parcial', icon: CloudSun },
  { value: 'CLOUDY', label: 'Nublado', icon: Cloudy },
  { value: 'RAIN', label: 'Chuva', icon: CloudRain },
  { value: 'STORM', label: 'Tempestade', icon: Zap },
];

export const WEATHER_LABEL: Record<WeatherCondition, string> = Object.fromEntries(
  WEATHER_OPTIONS.map((opcao) => [opcao.value, opcao.label]),
) as Record<WeatherCondition, string>;

/// Tipos de ocorrência. Os rótulos espelham o enum do banco — o valor gravado é
/// o mesmo em qualquer idioma da interface, e é ele que vai para os relatórios.
export const OCCURRENCE_OPTIONS: { value: OccurrenceType; label: string; icon: LucideIcon }[] = [
  { value: 'MATERIAL', label: 'Material', icon: Package },
  { value: 'LABOR', label: 'Mão de obra', icon: HardHat },
  { value: 'EQUIPMENT', label: 'Equipamento', icon: Truck },
  { value: 'WEATHER', label: 'Clima', icon: CloudRain },
  { value: 'DESIGN', label: 'Projeto', icon: PencilRuler },
  { value: 'SAFETY', label: 'Segurança', icon: ShieldAlert },
  { value: 'SCHEDULE', label: 'Prazo', icon: CalendarClock },
  { value: 'INSPECTION', label: 'Fiscalização', icon: ClipboardCheck },
  { value: 'STOPPAGE', label: 'Paralisação', icon: Octagon },
  { value: 'OTHER', label: 'Outro', icon: AlertTriangle },
];

export const OCCURRENCE_LABEL: Record<OccurrenceType, string> = Object.fromEntries(
  OCCURRENCE_OPTIONS.map((opcao) => [opcao.value, opcao.label]),
) as Record<OccurrenceType, string>;

/// Minutos desde a meia-noite em `HH:MM`. É formatação de exibição, não regra:
/// a validação e a conversão que o banco enxerga acontecem no servidor.
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hora = Math.floor(minutes / 60);
  const minuto = minutes % 60;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/// Texto do resumo de uma seção — o que aparece no cabeçalho fechado.
/// Devolve `null` quando não há nada, e aí o cartão mostra a descrição do que
/// vai ali dentro em vez de "0 itens", que parece defeito.
export function resumoDeLista(quantidade: number, singular: string, plural: string): string | null {
  if (quantidade === 0) return null;
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------

/// Unidades, com o rótulo curto que vai na lista ("50 sacos") e o nome por
/// extenso que vai no seletor.
///
/// Os códigos são os mesmos de `MEASUREMENT_UNITS` (solicitações de compra),
/// mas a lista é FECHADA: aqui `unit` é um enum do banco, e a API recusa
/// qualquer valor fora dela.
export const MATERIAL_UNIT_OPTIONS: {
  value: MaterialUnit;
  /// Abreviação exibida ao lado da quantidade.
  short: string;
  /// Plural da abreviação, quando ela tem um. `null` = invariável ("50 kg").
  shortPlural: string | null;
  label: string;
}[] = [
  { value: 'UN', short: 'un', shortPlural: null, label: 'Unidade' },
  { value: 'KG', short: 'kg', shortPlural: null, label: 'Quilograma' },
  { value: 'TON', short: 'ton', shortPlural: null, label: 'Tonelada' },
  { value: 'M', short: 'm', shortPlural: null, label: 'Metro linear' },
  { value: 'M2', short: 'm²', shortPlural: null, label: 'Metro quadrado' },
  { value: 'M3', short: 'm³', shortPlural: null, label: 'Metro cúbico' },
  { value: 'L', short: 'L', shortPlural: null, label: 'Litro' },
  { value: 'SC', short: 'saco', shortPlural: 'sacos', label: 'Saco' },
  { value: 'CX', short: 'caixa', shortPlural: 'caixas', label: 'Caixa' },
  { value: 'PCT', short: 'pacote', shortPlural: 'pacotes', label: 'Pacote' },
  { value: 'OTHER', short: 'outro', shortPlural: null, label: 'Outro' },
];

const UNIDADE_POR_CODIGO = new Map(MATERIAL_UNIT_OPTIONS.map((opcao) => [opcao.value, opcao]));

export const MATERIAL_MOVEMENT_OPTIONS: { value: MaterialMovementType; label: string }[] = [
  { value: 'RECEIVED', label: 'Recebido' },
  { value: 'USED', label: 'Utilizado' },
  { value: 'RETURNED', label: 'Devolvido' },
  { value: 'OTHER', label: 'Outro' },
];

export const MATERIAL_MOVEMENT_LABEL: Record<MaterialMovementType, string> = Object.fromEntries(
  MATERIAL_MOVEMENT_OPTIONS.map((opcao) => [opcao.value, opcao.label]),
) as Record<MaterialMovementType, string>;

/// Cor da etiqueta de movimentação. Recebido e utilizado são os dois casos que
/// se lê em movimento, e precisam se distinguir sem depender do texto.
export const MATERIAL_MOVEMENT_CLASS: Record<MaterialMovementType, string> = {
  RECEIVED: 'bg-success/10 text-success',
  USED: 'bg-pending text-pending-foreground',
  RETURNED: 'bg-muted text-muted-foreground',
  OTHER: 'bg-muted text-muted-foreground',
};

/// "50 sacos", "1.200 un", "2,5 m³".
///
/// A quantidade chega como STRING (Decimal do Prisma) e é formatada aqui, na
/// apresentação — o valor armazenado nunca vira texto no caminho de ida. O
/// separador é o do pt-BR: milhar com ponto, decimal com vírgula.
///
/// As casas decimais somem quando não existem: `50.000` guardado vira "50", e
/// não "50,000", que numa lista de obra se lê como cinquenta mil.
export function formatQuantity(quantity: string, unit: MaterialUnit): string {
  const numero = Number(quantity);
  const opcao = UNIDADE_POR_CODIGO.get(unit);

  const valor = Number.isFinite(numero)
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(numero)
    : quantity;

  const plural = opcao?.shortPlural && numero !== 1 ? opcao.shortPlural : opcao?.short;
  return plural ? `${valor} ${plural}` : valor;
}
