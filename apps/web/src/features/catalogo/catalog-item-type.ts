import type { CatalogItemType } from './types';

export const CATALOG_ITEM_TYPES: CatalogItemType[] = ['MATERIAL', 'LABOR', 'EQUIPMENT'];

export const CATALOG_ITEM_TYPE_LABELS: Record<CatalogItemType, string> = {
  MATERIAL: 'Material',
  LABOR: 'Mão de obra',
  EQUIPMENT: 'Equipamento',
};
