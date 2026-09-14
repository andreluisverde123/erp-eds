import type { CatalogItemPriceSource, Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PRICE_SCALE } from '../compositions/composition-cost';
import { dateOnlyToDate, dateToDateOnly, todayIn } from './reference-date';

export interface ReferencePriceSummary {
  unitPrice: string;
  unit: string;
  referenceDate: string;
  source: CatalogItemPriceSource;
}

/// O preço de referência VIGENTE em `asOf` (padrão: hoje) de vários insumos,
/// numa consulta só.
///
/// Vigente = maior `referenceDate <= asOf`; no empate, o registrado por
/// último. Preço de data posterior nunca entra.
///
/// Usado pela sugestão do editor de composição. A escolha do primeiro por
/// insumo é feita em memória sobre a lista já ordenada: o editor pede no máximo
/// 20 insumos, e o histórico de cada um é curto. Um relatório com milhares de
/// insumos precisaria de `DISTINCT ON` no banco.
export async function latestReferencePrices(
  prisma: PrismaService,
  companyId: string,
  catalogItemIds: string[],
  asOf: string = todayIn(),
): Promise<Map<string, ReferencePriceSummary>> {
  const vigentes = new Map<string, ReferencePriceSummary>();
  if (catalogItemIds.length === 0) return vigentes;

  const linhas = await prisma.catalogItemPrice.findMany({
    where: {
      companyId,
      catalogItemId: { in: catalogItemIds },
      referenceDate: { lte: dateOnlyToDate(asOf) },
    },
    orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
    select: { catalogItemId: true, unitPrice: true, unit: true, referenceDate: true, source: true },
  });

  for (const linha of linhas) {
    if (vigentes.has(linha.catalogItemId)) continue;
    vigentes.set(linha.catalogItemId, {
      unitPrice: linha.unitPrice.toFixed(PRICE_SCALE),
      unit: linha.unit,
      referenceDate: dateToDateOnly(linha.referenceDate),
      source: linha.source,
    });
  }

  return vigentes;
}

export interface ReferencePriceRow {
  id: string;
  unitPrice: Prisma.Decimal;
  unit: string;
  referenceDate: Date;
}

/// A mesma escolha de `latestReferencePrices`, devolvendo a LINHA (com id e
/// `Decimal`) para quem precisa gravar de onde o preço veio — o orçamento, ao
/// precificar uma composição na data-base. Aceita a transação.
export async function latestReferencePriceRows(
  client: Pick<Prisma.TransactionClient, 'catalogItemPrice'>,
  companyId: string,
  catalogItemIds: string[],
  asOf: string,
): Promise<Map<string, ReferencePriceRow>> {
  const vigentes = new Map<string, ReferencePriceRow>();
  if (catalogItemIds.length === 0) return vigentes;

  const linhas = await client.catalogItemPrice.findMany({
    where: {
      companyId,
      catalogItemId: { in: catalogItemIds },
      referenceDate: { lte: dateOnlyToDate(asOf) },
    },
    orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, catalogItemId: true, unitPrice: true, unit: true, referenceDate: true },
  });

  for (const linha of linhas) {
    if (vigentes.has(linha.catalogItemId)) continue;
    vigentes.set(linha.catalogItemId, {
      id: linha.id,
      unitPrice: linha.unitPrice,
      unit: linha.unit,
      referenceDate: linha.referenceDate,
    });
  }
  return vigentes;
}
