// Shared analytics logic for AnalyticsView and DashboardView — period boundaries,
// currency formatting, and per-product/per-video aggregation. Both views read the
// same `analytics_orders` data and must bucket/sum it identically, so every helper
// that touches that math lives here once instead of being reimplemented per view.
import type { AnalyticsOrder, Render, TikTokVideoStats } from '../services/databaseService';

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

/**
 * Same period-cutoff rule as `filterByPeriod`, applied to captured video stats (filtered by
 * `postedAt` — when the video went live, not when the extension captured it). This is the only
 * period-scoped reading of `tiktok_videos` that makes sense: each doc is a snapshot overwritten
 * in place, not a time series, so "views this week" really means "views of videos posted this
 * week", i.e. a cohort filter rather than an incremental one.
 */
export function filterVideoStatsByPeriod(stats: TikTokVideoStats[], period: Period, now: Date = new Date()): TikTokVideoStats[] {
  const cutoff = getPeriodCutoff(period, now);
  if (!cutoff) return stats;
  return stats.filter(s => new Date(s.postedAt) >= cutoff);
}

/** Half-open range filter [start, end) on `postedAt` — used for the previous-period comparison. */
export function filterVideoStatsByDateRange(stats: TikTokVideoStats[], start: Date, end: Date): TikTokVideoStats[] {
  return stats.filter(s => {
    const t = new Date(s.postedAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
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

/** Likes + comments + shares + saves — TikTok Studio's four engagement signals summed into one number. */
export function computeEngagement(stats: TikTokVideoStats): number {
  return stats.likeCount + stats.commentCount + stats.shareCount + stats.favoriteCount;
}

/** Revenue per 1,000 views (an RPM-style efficiency measure) — 0 when there are no views, never NaN/Infinity. */
export function computeRpm(revenue: number, views: number): number {
  return views > 0 ? (revenue / views) * 1000 : 0;
}

export interface VideoStatsMetrics {
  videoCount: number;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number; // totalEngagement / totalViews, 0 when there are no views
}

/** The headline numbers for a slice of captured video stats — the KPI tiles atop the publishing-performance section. */
export function computeVideoStatsMetrics(stats: TikTokVideoStats[]): VideoStatsMetrics {
  const videoCount = stats.length;
  const totalViews = stats.reduce((s, v) => s + v.playCount, 0);
  const totalEngagement = stats.reduce((s, v) => s + computeEngagement(v), 0);
  const engagementRate = totalViews > 0 ? totalEngagement / totalViews : 0;
  return { videoCount, totalViews, totalEngagement, engagementRate };
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

export interface VideoPerformanceEntry extends VideoRevenueEntry {
  /** Captured TikTok Studio stats for this video, when the extension has ever seen it. */
  stats?: TikTokVideoStats;
}

/**
 * Sibling of `buildVideoRevenue` that also folds in captured TikTok Studio stats, joining all
 * three sources (`analytics_orders`, `tiktok_videos`, `renders`) on the one id they share
 * (`contentId` === `itemId` === `tiktokVideoId`). A video keeps appearing even when one side of
 * the join is missing — a sale with no capture still shows (stats undefined, exactly like
 * `buildVideoRevenue` today), and a captured video with zero sales is appended with zeroed
 * revenue fields instead of being dropped, so "reach that never converted" stays visible.
 */
export function buildVideoPerformance(orders: AnalyticsOrder[], renders: Render[], stats: TikTokVideoStats[]): VideoPerformanceEntry[] {
  const revenueEntries = buildVideoRevenue(orders, renders);
  const statsByItemId = new Map(stats.map(s => [s.itemId, s]));
  const seen = new Set(revenueEntries.map(e => e.contentId));

  const combined: VideoPerformanceEntry[] = revenueEntries.map(e => ({ ...e, stats: statsByItemId.get(e.contentId) }));
  stats.forEach(s => {
    if (seen.has(s.itemId)) return;
    combined.push({
      contentId: s.itemId,
      contentType: '',
      gmv: 0,
      revenue: 0,
      orderCount: 0,
      unitsSold: 0,
      productName: '',
      render: renders.find(r => r.tiktokVideoId === s.itemId),
      stats: s,
    });
  });
  return combined;
}

/** Reach with zero conversion: videos with real views but no orders at all. Sorted by views, most first. */
export function findHighReachNoConversion(entries: VideoPerformanceEntry[], limit = 5): VideoPerformanceEntry[] {
  return entries
    .filter(e => (e.stats?.playCount ?? 0) > 0 && e.orderCount === 0)
    .sort((a, b) => (b.stats?.playCount ?? 0) - (a.stats?.playCount ?? 0))
    .slice(0, limit);
}

/** The efficient ones: few views, real orders — worth repeating. Sorted by views, fewest first. */
export function findEfficientLowReach(entries: VideoPerformanceEntry[], limit = 5): VideoPerformanceEntry[] {
  return entries
    .filter(e => e.orderCount > 0 && (e.stats?.playCount ?? 0) > 0)
    .sort((a, b) => (a.stats?.playCount ?? 0) - (b.stats?.playCount ?? 0))
    .slice(0, limit);
}

// ── Grouping by captured TikTok handle ──────────────────────────────────────
// The handle (`TikTokVideoStats.tiktokUsername`) is the durable "whose data is this" signal —
// it survives with zero TikTok accounts connected by OAuth, unlike `accountId` (which only
// exists once a container/account has been chosen). This lets Analytics show "which accounts
// have data" purely from what the extension has captured.

/** Sentinel group key for captures with no `tiktokUsername` (captured before this field existed). */
export const NO_USERNAME_KEY = '__no_username__';

export interface UsernameAgg {
  username: string; // normalized handle (no '@'), or NO_USERNAME_KEY
  videoCount: number;
  totalViews: number;
}

/** One row per distinct `tiktokUsername` found in `stats` (untagged captures grouped under `NO_USERNAME_KEY`), sorted by views descending. */
export function aggregateVideoStatsByUsername(stats: TikTokVideoStats[]): UsernameAgg[] {
  const map = new Map<string, UsernameAgg>();
  stats.forEach(s => {
    const key = s.tiktokUsername || NO_USERNAME_KEY;
    const entry = map.get(key) ?? { username: key, videoCount: 0, totalViews: 0 };
    entry.videoCount += 1;
    entry.totalViews += s.playCount;
    map.set(key, entry);
  });
  return Array.from(map.values()).sort((a, b) => b.totalViews - a.totalViews);
}

/** Narrows `stats` to one handle (or `NO_USERNAME_KEY`); `null` means no filter (every capture). */
export function filterVideoStatsByUsername(stats: TikTokVideoStats[], username: string | null): TikTokVideoStats[] {
  if (!username) return stats;
  if (username === NO_USERNAME_KEY) return stats.filter(s => !s.tiktokUsername);
  return stats.filter(s => s.tiktokUsername === username);
}

/**
 * Matches a `VideoPerformanceEntry` against a handle filter, via whatever captured stats it
 * carries. `null` (no filter, "all accounts") matches everything. Once a specific handle is
 * selected, an entry with NO captured stats at all is excluded rather than kept — there is no
 * account information to attribute it to, so showing it under one handle would misattribute a
 * sale that might belong to a different (or no) account.
 */
export function matchesUsernameFilter(entry: VideoPerformanceEntry, username: string | null): boolean {
  if (!username) return true;
  if (!entry.stats) return false;
  return (entry.stats.tiktokUsername || NO_USERNAME_KEY) === username;
}

/** Sentinel group key for videos with no associated render — published by hand, not from TTChop. */
export const NO_RECIPE_KEY = '__no_recipe__';

export interface RecipeAgg {
  key: string; // a template/voice id, or NO_RECIPE_KEY
  videoCount: number;
  totalViews: number;
  totalRevenue: number;
  avgViews: number;
  avgRevenue: number;
  revenuePer1000Views: number; // weighted (sum of revenue / sum of views), not an average of per-video ratios
}

/**
 * Groups videos that have a render (by whatever id `keyFn` picks off it — script/ai template,
 * voice template) and compares average reach/revenue and RPM per group, so "which template
 * sells?" / "which voice sells?" has a real answer. Videos with no render at all — published by
 * hand, outside TTChop — land in the `NO_RECIPE_KEY` bucket instead of being dropped.
 */
export function aggregateVideoPerformanceByRecipe(
  entries: VideoPerformanceEntry[],
  keyFn: (render: Render) => string | undefined
): RecipeAgg[] {
  const map = new Map<string, { videoCount: number; totalViews: number; totalRevenue: number }>();
  entries.forEach(e => {
    const key = (e.render && keyFn(e.render)) || NO_RECIPE_KEY;
    const bucket = map.get(key) ?? { videoCount: 0, totalViews: 0, totalRevenue: 0 };
    bucket.videoCount += 1;
    bucket.totalViews += e.stats?.playCount ?? 0;
    bucket.totalRevenue += e.revenue;
    map.set(key, bucket);
  });
  return Array.from(map.entries())
    .map(([key, b]) => ({
      key,
      videoCount: b.videoCount,
      totalViews: b.totalViews,
      totalRevenue: b.totalRevenue,
      avgViews: b.totalViews / b.videoCount,
      avgRevenue: b.totalRevenue / b.videoCount,
      revenuePer1000Views: computeRpm(b.totalRevenue, b.totalViews),
    }))
    .sort((a, b) => b.revenuePer1000Views - a.revenuePer1000Views);
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
 * Empty bucket skeleton (day or month step) spanning from the period's start up to `now`. Shared
 * by every bucketed-over-time chart (revenue, posting rhythm, ...) so they always agree on bucket
 * boundaries. `sourceDates` is only consulted for period === 'all', to find the earliest bucket
 * when there's no fixed cutoff — pass the dates of whatever's being bucketed (order dates, posted
 * dates, ...).
 */
function buildBucketSkeleton(period: Period, now: Date, sourceDates: Date[]): { granularity: BucketGranularity; buckets: { key: string; date: Date }[] } {
  const granularity = bucketGranularityForPeriod(period);
  let start: Date;
  if (period === 'all') {
    if (sourceDates.length === 0) return { granularity, buckets: [] };
    const minTime = Math.min(...sourceDates.map(d => d.getTime()));
    start = granularity === 'month' ? startOfMonth(new Date(minTime)) : new Date(minTime);
  } else {
    start = getPeriodCutoff(period, now) as Date;
  }

  const buckets: { key: string; date: Date }[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= now.getTime()) {
    buckets.push({ key: granularity === 'day' ? dayKey(cursor) : monthKey(cursor), date: new Date(cursor) });
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return { granularity, buckets: buckets.length > MAX_BUCKETS ? buckets.slice(buckets.length - MAX_BUCKETS) : buckets };
}

/**
 * Builds one bucket per day (week/month) or per month (year/all) spanning from the
 * period's start up to `now`, pre-filled with zero revenue so gaps show as flat, not
 * missing. `orders` should already be scoped to the selected currency; period filtering
 * is not required (bucket keys outside [start, now] are simply never populated).
 */
export function buildRevenueBuckets(orders: AnalyticsOrder[], period: Period, now: Date = new Date()): RevenueBucket[] {
  const orderDates = orders.map(o => o.orderDate).filter((d): d is string => d !== null).map(d => new Date(d));
  const { granularity, buckets: skeleton } = buildBucketSkeleton(period, now, orderDates);
  const buckets: RevenueBucket[] = skeleton.map(b => ({ ...b, revenue: 0 }));

  const indexByKey = new Map(buckets.map((b, i) => [b.key, i]));
  orders.forEach(o => {
    if (o.settlementStatus !== 'Settled' || o.orderDate === null) return;
    const d = new Date(o.orderDate);
    const key = granularity === 'day' ? dayKey(d) : monthKey(d);
    const idx = indexByKey.get(key);
    if (idx !== undefined) buckets[idx].revenue += o.totalFinalEarnedAmount;
  });
  return buckets;
}

export interface PostingBucket {
  key: string;
  date: Date; // UTC start of the bucket
  count: number; // videos posted in this bucket
}

/**
 * Publishing rhythm: one bucket per day (week/month) or per month (year/all), counting videos by
 * `postedAt`. Same skeleton/granularity as `buildRevenueBuckets` so both charts bucket identically
 * for a given period. `stats` need not be period-filtered — bucket keys outside [start, now] are
 * simply never populated, same convention as the revenue buckets.
 */
export function buildPostingBuckets(stats: TikTokVideoStats[], period: Period, now: Date = new Date()): PostingBucket[] {
  const postedDates = stats.map(s => new Date(s.postedAt));
  const { granularity, buckets: skeleton } = buildBucketSkeleton(period, now, postedDates);
  const buckets: PostingBucket[] = skeleton.map(b => ({ ...b, count: 0 }));

  const indexByKey = new Map(buckets.map((b, i) => [b.key, i]));
  stats.forEach(s => {
    const d = new Date(s.postedAt);
    const key = granularity === 'day' ? dayKey(d) : monthKey(d);
    const idx = indexByKey.get(key);
    if (idx !== undefined) buckets[idx].count += 1;
  });
  return buckets;
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
