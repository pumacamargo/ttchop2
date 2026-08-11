// Shared analytics logic for AnalyticsView and DashboardView — period boundaries,
// currency formatting, and per-product/per-video aggregation. Both views read the
// same `analytics_orders` data and must bucket/sum it identically, so every helper
// that touches that math lives here once instead of being reimplemented per view.
import type { AnalyticsOrder, Render } from '../services/databaseService';

export type Period = 'week' | 'month' | 'year' | 'all';

// ── Date helpers (period filtering) ─────────────────────────────────────────
//
// Todas las fronteras se calculan en UTC porque las fechas del export se guardan como hora de
// pared anclada a UTC (ver parseTikTokDate). Mezclarlas con fronteras en hora local metería un
// desfase del tamaño del offset del usuario y movería órdenes de un período a otro.

export function startOfWeekMonday(d: Date): Date {
  const nd = new Date(d);
  const day = nd.getUTCDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  nd.setUTCDate(nd.getUTCDate() + diff);
  nd.setUTCHours(0, 0, 0, 0);
  return nd;
}
export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/** Start of the given period containing `now`. Null for 'all' (no lower bound). */
export function getPeriodCutoff(period: Period, now: Date): Date | null {
  if (period === 'all') return null;
  return period === 'week' ? startOfWeekMonday(now) : period === 'month' ? startOfMonth(now) : startOfYear(now);
}

/** The equivalent previous period's [start, end) range. Null for 'all' — there is no "previous" for all-time. */
export function getPreviousPeriodRange(period: Period, now: Date): { start: Date; end: Date } | null {
  if (period === 'all') return null;
  const end = getPeriodCutoff(period, now) as Date;
  let start: Date;
  if (period === 'week') {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
  } else if (period === 'month') {
    start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  } else {
    start = new Date(Date.UTC(end.getUTCFullYear() - 1, 0, 1));
  }
  return { start, end };
}

export function filterByPeriod(orders: AnalyticsOrder[], period: Period, now: Date = new Date()): AnalyticsOrder[] {
  const cutoff = getPeriodCutoff(period, now);
  if (!cutoff) return orders;
  return orders.filter(o => o.orderDate !== null && new Date(o.orderDate) >= cutoff);
}

/** Half-open range filter [start, end) — used for the previous-period comparison. */
export function filterByDateRange(orders: AnalyticsOrder[], start: Date, end: Date): AnalyticsOrder[] {
  return orders.filter(o => {
    if (o.orderDate === null) return false;
    const t = new Date(o.orderDate).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}

/** Same period-cutoff rule as `filterByPeriod`, applied to renders (filtered by `createdAt`). */
export function filterRendersByPeriod(renders: Render[], period: Period, now: Date = new Date()): Render[] {
  const cutoff = getPeriodCutoff(period, now);
  if (!cutoff) return renders;
  return renders.filter(r => new Date(r.createdAt) >= cutoff);
}

// ── Currency formatting ──────────────────────────────────────────────────────

export function formatCurrency(value: number, currency: string): string {
  if (!currency) return value.toLocaleString();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

// ── Aggregation helpers ──────────────────────────────────────────────────────

export interface CategoryAgg {
  key: string;
  gmv: number;
  revenue: number;
  orderIds: Set<string>;
  settledOrderIds: Set<string>;
}

/** Groups orders by an arbitrary key (content type, order type, ...), summing GMV and settled revenue. */
export function aggregateBy(orders: AnalyticsOrder[], keyFn: (o: AnalyticsOrder) => string): Map<string, CategoryAgg> {
  const map = new Map<string, CategoryAgg>();
  orders.forEach(o => {
    const key = keyFn(o);
    if (!key) return;
    const entry = map.get(key) ?? { key, gmv: 0, revenue: 0, orderIds: new Set<string>(), settledOrderIds: new Set<string>() };
    entry.gmv += o.gmv;
    entry.orderIds.add(o.orderId);
    if (o.settlementStatus === 'Settled') {
      entry.revenue += o.totalFinalEarnedAmount;
      entry.settledOrderIds.add(o.orderId);
    }
    map.set(key, entry);
  });
  return map;
}

export interface OrderMetrics {
  gmvTotal: number;
  revenueTotal: number; // settled only
  orderCount: number;
  unitsSold: number;
  refunds: number;
  settlementRate: number; // settled orders / total orders, 0 when there are no orders
}

/** The headline numbers for a slice of orders — shared by AnalyticsView's stat tiles and DashboardView's KPI cards. */
export function computeOrderMetrics(orders: AnalyticsOrder[]): OrderMetrics {
  const gmvTotal = orders.reduce((s, o) => s + o.gmv, 0);
  const settled = orders.filter(o => o.settlementStatus === 'Settled');
  const revenueTotal = settled.reduce((s, o) => s + o.totalFinalEarnedAmount, 0);
  const orderIds = new Set(orders.map(o => o.orderId));
  const settledOrderIds = new Set(settled.map(o => o.orderId));
  const unitsSold = orders.reduce((s, o) => s + o.itemsSold, 0);
  const refunds = orders.reduce((s, o) => s + o.itemsRefunded, 0);
  const settlementRate = orderIds.size > 0 ? settledOrderIds.size / orderIds.size : 0;
  return { gmvTotal, revenueTotal, orderCount: orderIds.size, unitsSold, refunds, settlementRate };
}

/** Relative change from `prev` to `curr`, e.g. 0.12 for +12%. Null when `prev` is 0 — there is no meaningful percentage off a zero baseline. */
export function computeDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

export interface ProductAgg {
  productId: string;
  productName: string;
  gmv: number;
  revenue: number;
  unitsSold: number;
  orderIds: Set<string>;
}

/** Groups orders by product, summing GMV, settled revenue, and units sold. */
export function aggregateByProduct(orders: AnalyticsOrder[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  orders.forEach(o => {
    if (!o.productId) return;
    const entry = map.get(o.productId) ?? {
      productId: o.productId, productName: o.productName, gmv: 0, revenue: 0, unitsSold: 0, orderIds: new Set<string>(),
    };
    entry.gmv += o.gmv;
    entry.unitsSold += o.itemsSold;
    entry.orderIds.add(o.orderId);
    if (o.settlementStatus === 'Settled') entry.revenue += o.totalFinalEarnedAmount;
    map.set(o.productId, entry);
  });
  return Array.from(map.values());
}

export interface VideoRevenueEntry {
  contentId: string;
  contentType: string;
  gmv: number;
  revenue: number;
  orderCount: number;
  unitsSold: number;
  productName: string;
  render?: Render;
}

/**
 * Groups orders by TikTok Content ID (video), summing GMV/revenue/units, and cross-references
 * each with the TTChop render that produced it (matched on `tiktokVideoId`) so callers can show
 * which template/voice/language drove the sale. Sorted by settled revenue, then GMV, descending.
 */
export function buildVideoRevenue(orders: AnalyticsOrder[], renders: Render[]): VideoRevenueEntry[] {
  const map = new Map<string, VideoRevenueEntry & { orderIds: Set<string> }>();
  orders.forEach(o => {
    if (!o.contentId) return;
    const entry = map.get(o.contentId) ?? {
      contentId: o.contentId, contentType: o.contentType, gmv: 0, revenue: 0, unitsSold: 0,
      productName: o.productName, orderCount: 0, orderIds: new Set<string>(),
    };
    entry.gmv += o.gmv;
    entry.unitsSold += o.itemsSold;
    if (o.settlementStatus === 'Settled') entry.revenue += o.totalFinalEarnedAmount;
    entry.orderIds.add(o.orderId);
    map.set(o.contentId, entry);
  });
  return Array.from(map.values())
    .map(({ orderIds, ...entry }) => ({
      ...entry,
      orderCount: orderIds.size,
      render: renders.find(r => r.tiktokVideoId === entry.contentId),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.gmv - a.gmv);
}

/** The scriptTemplateId (falling back to aiTemplateId) used most often among the given renders. */
export function buildTopTemplate(renders: Render[]): { templateId: string; count: number } | null {
  const counts = new Map<string, number>();
  renders.forEach(r => {
    const templateId = r.scriptTemplateId || r.aiTemplateId;
    if (!templateId) return;
    counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
  });
  let best: { templateId: string; count: number } | null = null;
  counts.forEach((count, templateId) => {
    if (!best || count > best.count) best = { templateId, count };
  });
  return best;
}

// ── Revenue-over-time buckets (growth chart) ────────────────────────────────

export type BucketGranularity = 'day' | 'month';

export function bucketGranularityForPeriod(period: Period): BucketGranularity {
  return period === 'year' || period === 'all' ? 'month' : 'day';
}

export interface RevenueBucket {
  key: string;
  date: Date; // UTC start of the bucket
  revenue: number; // settled revenue only, matching the Revenue KPI
}

const MAX_BUCKETS = 36; // safeguard for very long histories under 'all'

/** Human-readable label for a bucket's start date — day-granularity gets "Jun 30", month-granularity gets "Jun 2026". Always UTC: bucket dates are wall-clock-anchored-to-UTC (see parseTikTokDate), so formatting in the viewer's local zone could shift the displayed day/month. */
export function formatBucketLabel(date: Date, granularity: BucketGranularity): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(granularity === 'day' ? { day: 'numeric' } : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds one bucket per day (week/month) or per month (year/all) spanning from the
 * period's start up to `now`, pre-filled with zero revenue so gaps show as flat, not
 * missing. `orders` should already be scoped to the selected currency; period filtering
 * is not required (bucket keys outside [start, now] are simply never populated).
 */
export function buildRevenueBuckets(orders: AnalyticsOrder[], period: Period, now: Date = new Date()): RevenueBucket[] {
  const granularity = bucketGranularityForPeriod(period);
  let start: Date;
  if (period === 'all') {
    const orderDates = orders.map(o => o.orderDate).filter((d): d is string => d !== null).map(d => new Date(d));
    if (orderDates.length === 0) return [];
    const minTime = Math.min(...orderDates.map(d => d.getTime()));
    start = granularity === 'month' ? startOfMonth(new Date(minTime)) : new Date(minTime);
  } else {
    start = getPeriodCutoff(period, now) as Date;
  }

  const buckets: RevenueBucket[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= now.getTime()) {
    buckets.push({ key: granularity === 'day' ? dayKey(cursor) : monthKey(cursor), date: new Date(cursor), revenue: 0 });
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const trimmed = buckets.length > MAX_BUCKETS ? buckets.slice(buckets.length - MAX_BUCKETS) : buckets;

  const indexByKey = new Map(trimmed.map((b, i) => [b.key, i]));
  orders.forEach(o => {
    if (o.settlementStatus !== 'Settled' || o.orderDate === null) return;
    const d = new Date(o.orderDate);
    const key = granularity === 'day' ? dayKey(d) : monthKey(d);
    const idx = indexByKey.get(key);
    if (idx !== undefined) trimmed[idx].revenue += o.totalFinalEarnedAmount;
  });
  return trimmed;
}

/**
 * Resuelve un id de template a su título. Las vistas guardan ids en los renders, pero mostrar
 * `tpl_1723849...` no le dice nada al usuario: necesita ver "Announcer" o el nombre que le puso.
 * Si el template fue borrado, cae al id para no dejar el hueco en blanco.
 */
export function templateNameResolver(templates: { id: string; title: string }[]) {
  const byId = new Map(templates.map(t => [t.id, t.title]));
  return (id: string | undefined): string | undefined => id ? (byId.get(id) ?? id) : undefined;
}
