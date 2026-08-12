import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Upload, FileSpreadsheet, RefreshCw, ShieldAlert, CheckCircle2,
  AlertTriangle, X, Info, Sparkles, Scissors, Layers, Puzzle, Eye,
  ArrowUp, ArrowDown, ArrowUpDown, Video as VideoIcon,
} from 'lucide-react';
import { db, getVisibleForContainer } from '../services/databaseService';
import type { AnalyticsOrder, Render, Template, TikTokVideoStats } from '../services/databaseService';
import { parseAnalyticsFile, AnalyticsImportError } from '../services/analyticsImport';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import type { Translations } from '../i18n';
import {
  type Period, type BucketGranularity, type VideoPerformanceEntry,
  filterByPeriod, formatCurrency, aggregateBy, aggregateByProduct, buildVideoRevenue, computeOrderMetrics,
  filterVideoStatsByPeriod, computeVideoStatsMetrics, computeEngagement, computeRpm,
  buildPostingBuckets, bucketGranularityForPeriod, formatBucketLabel, buildVideoPerformance,
  findHighReachNoConversion, findEfficientLowReach, aggregateVideoPerformanceByRecipe, NO_RECIPE_KEY,
  templateNameResolver,
} from '../utils/analytics';
import { useCurrencySelection } from '../hooks/useCurrencySelection';
import {
  SectionCard, StatTile, BarRow, LegendDot, SettlementBar, PeriodSelector, CurrencySelector,
} from './shared/AnalyticsUI';

function mapImportError(err: AnalyticsImportError, t: Translations): string {
  switch (err.reason) {
    case 'corrupt': return t.analytics_import_error_corrupt;
    case 'missing_sheet': return t.analytics_import_error_missing_sheet;
    case 'empty': return t.analytics_import_error_empty;
    case 'missing_columns':
      return t.analytics_import_error_missing_columns.replace('{columns}', (err.missingColumns ?? []).join(', '));
    default:
      return t.analytics_import_error_generic;
  }
}

/** `postedAt`/date formatting for the video table — always UTC (see analytics.ts date-helpers note). */
function formatPostedDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

// ── Posting rhythm chart ─────────────────────────────────────────────────────
// Single-series column chart (per dataviz guidance: one series needs no legend). Each bar is its
// own hit target (a transparent HTML button laid over it) with a per-bar tooltip, rather than a
// shared crosshair — that's the bar/cell interaction pattern, distinct from the line chart above.

const POSTING_VB_W = 100;
const POSTING_VB_H = 120;
const POSTING_PAD_TOP = 16;
const POSTING_PAD_BOTTOM = 10;

const PostingRhythmChart: React.FC<{ buckets: { key: string; date: Date; count: number }[]; granularity: BucketGranularity; emptyText: string; unitLabel: string }> = ({
  buckets, granularity, emptyText, unitLabel,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (buckets.length === 0) {
    return <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{emptyText}</p>;
  }

  const n = buckets.length;
  const maxCount = Math.max(...buckets.map(b => b.count));
  const usableH = POSTING_VB_H - POSTING_PAD_TOP - POSTING_PAD_BOTTOM;
  const bandW = POSTING_VB_W / n;
  const barW = Math.max(Math.min(bandW * 0.6, 4), 0.8);
  const baselineY = POSTING_VB_H - POSTING_PAD_BOTTOM;

  const bars = buckets.map(b => {
    const h = maxCount > 0 ? (b.count / maxCount) * usableH : 0;
    return { ...b, h };
  });
  const hovered = hoverIndex !== null ? bars[hoverIndex] : null;

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${POSTING_VB_W} ${POSTING_VB_H}`} preserveAspectRatio="none" style={{ width: '100%', height: 110, display: 'block' }} aria-hidden="true">
          <line x1={0} y1={baselineY} x2={POSTING_VB_W} y2={baselineY} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {bars.map((b, i) => b.h > 0 && (
            <rect
              key={b.key}
              x={bandW * i + (bandW - barW) / 2}
              y={baselineY - b.h}
              width={barW}
              height={b.h}
              rx={Math.min(barW / 2, 1)}
              fill="var(--secondary)"
              opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.5}
            />
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {bars.map((b, i) => (
            <button
              key={b.key}
              type="button"
              onPointerEnter={() => setHoverIndex(i)}
              onPointerLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              aria-label={`${formatBucketLabel(b.date, granularity)}: ${b.count} ${unitLabel}`}
              style={{ flex: `0 0 ${100 / n}%`, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minHeight: '44px' }}
            />
          ))}
        </div>
        {hovered && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute', left: `${Math.min(88, Math.max(12, (bars.indexOf(hovered) + 0.5) / n * 100))}%`, top: 0,
              transform: 'translate(-50%, 0)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.25rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 1, boxShadow: 'var(--shadow-lg)',
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formatBucketLabel(hovered.date, granularity)}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{hovered.count} {unitLabel}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{formatBucketLabel(buckets[0].date, granularity)}</span>
        {n > 2 && (
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            {formatBucketLabel(buckets[Math.floor((n - 1) / 2)].date, granularity)}
          </span>
        )}
        {n > 1 && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{formatBucketLabel(buckets[n - 1].date, granularity)}</span>}
      </div>
    </div>
  );
};

// ── Sortable table header cell ───────────────────────────────────────────────

type VideoSortKey = 'postedAt' | 'views' | 'engagement' | 'orders' | 'gmv' | 'revenue' | 'rpm';

const SortableTh: React.FC<{
  label: string; sortKey: VideoSortKey; active: VideoSortKey; dir: 'asc' | 'desc'; align?: 'left' | 'right'; onSort: (key: VideoSortKey) => void;
}> = ({ label, sortKey, active, dir, align = 'right', onSort }) => (
  <th style={{ textAlign: align, padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer',
        color: active === sortKey ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.64rem', padding: '0.3rem 0.15rem',
      }}
    >
      {label}
      {active === sortKey ? (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} style={{ opacity: 0.4 }} />}
    </button>
  </th>
);

/** 32×32 cover thumbnail with a graceful fallback when the video has no capture (no `coverUrl`). */
const VideoThumb: React.FC<{ src?: string; alt: string }> = ({ src, alt }) =>
  src ? (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0, background: 'var(--bg-input)' }}
    />
  ) : (
    <div style={{
      width: 32, height: 32, borderRadius: 6, background: 'var(--bg-input)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)',
    }}>
      <VideoIcon size={14} />
    </div>
  );

// ── Main view ─────────────────────────────────────────────────────────────────

export const AnalyticsView: React.FC = () => {
  const t = useT();
  const { activeAccountId } = useContainer();

  const [allOrders, setAllOrders] = useState<AnalyticsOrder[]>([]);
  const [allRenders, setAllRenders] = useState<Render[]>([]);
  const [allVideoStats, setAllVideoStats] = useState<TikTokVideoStats[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [period, setPeriod] = useState<Period>('all');
  const [videoSortKey, setVideoSortKey] = useState<VideoSortKey>('views');
  const [videoSortDir, setVideoSortDir] = useState<'asc' | 'desc'>('desc');

  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [importSummary, setImportSummary] = useState<{ total: number; created: number; updated: number; discarded: number } | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [orderRows, renderRows, videoStatsRows, templateRows] = await Promise.all([
        db.getAnalyticsOrders(), db.getRenders(), db.getTikTokVideoStats(), db.getTemplates(),
      ]);
      if (!mountedRef.current) return;
      setAllOrders(orderRows);
      setAllRenders(renderRows);
      setAllVideoStats(videoStatsRows);
      setTemplates(templateRows);
    } catch (err) {
      console.error(err);
      if (mountedRef.current) setLoadError(t.analytics_error_load);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [t.analytics_error_load]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Neither analytics_orders, renders, nor tiktok_videos are container-filtered server side (see
  // databaseService.ts) — re-derive on activeAccountId change instead of re-fetching. This is
  // what keeps a TikTok account's sales from mixing with another account's or the general pool.
  const orders = useMemo(() => getVisibleForContainer(allOrders, activeAccountId), [allOrders, activeAccountId]);
  const renders = useMemo(() => getVisibleForContainer(allRenders, activeAccountId), [allRenders, activeAccountId]);
  const videoStats = useMemo(() => getVisibleForContainer(allVideoStats, activeAccountId), [allVideoStats, activeAccountId]);

  // ── Currency: group by currency, never sum across currencies ──────────────
  const { currencies, selectedCurrency, setSelectedCurrency, currencyOrders } = useCurrencySelection(orders);

  const periodOrders = useMemo(() => filterByPeriod(currencyOrders, period), [currencyOrders, period]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => computeOrderMetrics(periodOrders), [periodOrders]);

  const topProducts = useMemo(
    () => aggregateByProduct(periodOrders).sort((a, b) => b.gmv - a.gmv).slice(0, 5),
    [periodOrders]
  );

  const contentTypeAgg = useMemo(() => aggregateBy(periodOrders, o => o.contentType), [periodOrders]);
  const orderTypeAgg = useMemo(() => aggregateBy(periodOrders, o => o.orderType), [periodOrders]);

  const revenueByVideo = useMemo(
    () => buildVideoRevenue(periodOrders, renders).slice(0, 8),
    [periodOrders, renders]
  );

  // ── Publishing performance: cross-references tiktok_videos with analytics_orders/renders ────
  // Stats are a snapshot per video (overwritten, not a time series) — only the "posted in this
  // period" cohort (periodVideoStats) is meaningful as a period-scoped quantity. The per-video
  // table and template/voice aggregates below deliberately use ALL-time videoStats/renders
  // (same convention as revenueByVideo using unfiltered `renders`): a sale in the selected period
  // must never lose its video's lifetime view/engagement numbers just because the video itself
  // was posted outside the period.
  const periodVideoStats = useMemo(() => filterVideoStatsByPeriod(videoStats, period), [videoStats, period]);
  const videoStatsMetrics = useMemo(() => computeVideoStatsMetrics(periodVideoStats), [periodVideoStats]);
  const postingGranularity = bucketGranularityForPeriod(period);
  const postingBuckets = useMemo(() => buildPostingBuckets(videoStats, period), [videoStats, period]);

  const hasOrdersData = orders.length > 0;
  const hasVideoStats = videoStats.length > 0;
  const hasAnyData = hasOrdersData || hasVideoStats;

  const videoPerformance = useMemo(
    () => buildVideoPerformance(periodOrders, renders, videoStats),
    [periodOrders, renders, videoStats]
  );

  const videoValueForSort = useCallback((e: VideoPerformanceEntry, key: VideoSortKey): number => {
    switch (key) {
      case 'postedAt': return e.stats ? new Date(e.stats.postedAt).getTime() : 0;
      case 'views': return e.stats?.playCount ?? 0;
      case 'engagement': return e.stats ? computeEngagement(e.stats) : 0;
      case 'orders': return e.orderCount;
      case 'gmv': return e.gmv;
      case 'revenue': return e.revenue;
      case 'rpm': return computeRpm(e.revenue, e.stats?.playCount ?? 0);
      default: return 0;
    }
  }, []);

  const sortedVideoPerformance = useMemo(() => {
    const sorted = [...videoPerformance].sort((a, b) => videoValueForSort(b, videoSortKey) - videoValueForSort(a, videoSortKey));
    return videoSortDir === 'asc' ? sorted.reverse() : sorted;
  }, [videoPerformance, videoSortKey, videoSortDir, videoValueForSort]);

  const handleVideoSort = useCallback((key: VideoSortKey) => {
    setVideoSortDir(prevDir => (key === videoSortKey ? (prevDir === 'asc' ? 'desc' : 'asc') : 'desc'));
    setVideoSortKey(key);
  }, [videoSortKey]);

  // ── "What works": efficiency reads on top of the same cross-referenced rows ─────────────────
  const highReachNoConversion = useMemo(() => findHighReachNoConversion(videoPerformance, 5), [videoPerformance]);
  const efficientLowReach = useMemo(() => findEfficientLowReach(videoPerformance, 5), [videoPerformance]);

  const templateName = useMemo(() => templateNameResolver(templates), [templates]);
  const recipeLabel = useCallback((key: string) => (key === NO_RECIPE_KEY ? t.analytics_video_no_recipe : (templateName(key) ?? key)), [templateName, t.analytics_video_no_recipe]);

  const byTemplate = useMemo(
    () => aggregateVideoPerformanceByRecipe(videoPerformance, r => r.scriptTemplateId || r.aiTemplateId),
    [videoPerformance]
  );
  const byVoice = useMemo(
    () => aggregateVideoPerformanceByRecipe(videoPerformance, r => r.voiceTemplateId),
    [videoPerformance]
  );

  // ── Import handler ──────────────────────────────────────────────────────────
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportError('');
    setImportSummary(null);
    setImportStep(t.analytics_import_processing);

    try {
      const parsed = await parseAnalyticsFile(file);
      const { newCount, updatedCount } = await db.importAnalyticsOrders(parsed.orders, activeAccountId ?? undefined);
      setImportSummary({
        total: parsed.totalRows,
        created: newCount,
        updated: updatedCount,
        discarded: parsed.discardedCount,
      });
      await loadAll();
    } catch (err) {
      if (err instanceof AnalyticsImportError) {
        setImportError(mapImportError(err, t));
      } else {
        console.error(err);
        setImportError(t.analytics_import_error_generic);
      }
    } finally {
      setImporting(false);
      setImportStep('');
    }
  };

  const maxProductGmv = topProducts.length > 0 ? topProducts[0].gmv : 0;

  const videoAgg = contentTypeAgg.get('Video');
  const showcaseAgg = contentTypeAgg.get('Showcase');
  const contentMax = Math.max(videoAgg?.gmv ?? 0, showcaseAgg?.gmv ?? 0);

  const shopAdsAgg = orderTypeAgg.get('Shop ads order');
  const affiliateAgg = orderTypeAgg.get('Affiliate order');
  const orderTypeMax = Math.max(shopAdsAgg?.gmv ?? 0, affiliateAgg?.gmv ?? 0);

  const maxVideoRevenue = revenueByVideo.length > 0 ? Math.max(...revenueByVideo.map(v => v.gmv)) : 0;

  return (
    <div className="view-content">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
          {t.analytics_title}
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {t.analytics_subtitle}
        </p>
      </div>

      {/* ── Import panel ──────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: '0.9rem 1rem', marginBottom: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileSpreadsheet size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{t.analytics_import_title}</h4>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{t.analytics_import_hint}</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
          disabled={importing}
        />

        {importing ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.8rem',
            borderRadius: 8, background: 'var(--primary-glow)', border: '1px solid var(--primary-glow)',
          }}>
            <RefreshCw size={16} className="loading-spinner" style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{importStep}</span>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
            style={{ width: 'auto', alignSelf: 'flex-start', minHeight: '44px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Upload size={14} /> {hasOrdersData ? t.analytics_import_another : t.analytics_import_button}
          </button>
        )}

        {importSummary && !importing && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: 8,
            background: 'color-mix(in srgb, var(--success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
          }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{t.analytics_import_success_title}</p>
              <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
                {t.analytics_import_summary_rows.replace('{count}', String(importSummary.total))}
                {' · '}
                {t.analytics_import_summary_new.replace('{count}', String(importSummary.created))}
                {' · '}
                {t.analytics_import_summary_updated.replace('{count}', String(importSummary.updated))}
                {importSummary.discarded > 0 && (
                  <> · {t.analytics_import_summary_discarded.replace('{count}', String(importSummary.discarded))}</>
                )}
              </p>
            </div>
          </div>
        )}

        {importError && !importing && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: 8,
            background: 'color-mix(in srgb, var(--danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
          }}>
            <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-primary)', margin: 0, flex: 1, wordBreak: 'break-word' }}>{importError}</p>
            <button
              onClick={() => setImportError('')}
              aria-label={t.analytics_import_dismiss}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
                minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '-0.5rem 0',
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Body: loading / error / empty / dashboard ───────────────────── */}
      {loading ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
          <RefreshCw size={28} className="loading-spinner" style={{ color: 'var(--primary)' }} />
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>{t.analytics_loading}</p>
        </div>
      ) : loadError ? (
        <div className="glass-card" style={{
          borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.9rem 1rem',
        }}>
          <ShieldAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{loadError}</p>
            <button onClick={loadAll} className="btn btn-secondary" style={{ marginTop: '0.6rem', width: 'auto', minHeight: '36px', padding: '0 0.9rem', fontSize: '0.75rem' }}>
              <RefreshCw size={14} /> {t.retry}
            </button>
          </div>
        </div>
      ) : !hasAnyData ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <BarChart3 size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t.analytics_empty_title}</h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.5, margin: 0 }}>
            {t.analytics_empty_text}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Period selector */}
          <PeriodSelector
            value={period}
            onChange={p => setPeriod(p as Period)}
            options={[
              { key: 'week', label: t.analytics_period_week },
              { key: 'month', label: t.analytics_period_month },
              { key: 'year', label: t.analytics_period_year },
              { key: 'all', label: t.analytics_period_all },
            ]}
          />

          {/* Currency selector — never sums across currencies */}
          <CurrencySelector
            currencies={currencies}
            selected={selectedCurrency}
            onSelect={setSelectedCurrency}
            note={(
              <>
                <Info size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>{t.analytics_currency_note}</p>
              </>
            )}
          />

          {!hasOrdersData ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '0.82rem', margin: 0 }}>{t.analytics_no_orders_yet}</p>
            </div>
          ) : periodOrders.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '0.82rem', margin: 0 }}>{t.analytics_no_data_period}</p>
            </div>
          ) : (
            <>
              {/* Stat tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
                <StatTile label={t.analytics_metric_gmv} value={formatCurrency(metrics.gmvTotal, selectedCurrency)} />
                <StatTile label={t.analytics_metric_revenue} value={formatCurrency(metrics.revenueTotal, selectedCurrency)} accent="var(--success)" />
                <StatTile label={t.analytics_metric_orders} value={metrics.orderCount.toLocaleString()} />
                <StatTile label={t.analytics_metric_units} value={metrics.unitsSold.toLocaleString()} />
                <StatTile label={t.analytics_metric_refunds} value={metrics.refunds.toLocaleString()} />
                <StatTile
                  label={t.analytics_metric_settlement_rate}
                  value={`${(metrics.settlementRate * 100).toFixed(0)}%`}
                  accent={metrics.settlementRate >= 0.7 ? 'var(--success)' : metrics.settlementRate >= 0.4 ? 'var(--warning)' : 'var(--danger)'}
                />
              </div>

              {/* Settlement rate bar */}
              <SectionCard title={t.analytics_metric_settlement_rate}>
                <SettlementBar
                  settledPct={metrics.settlementRate}
                  settledLabel={`${t.analytics_settled} (${(metrics.settlementRate * 100).toFixed(0)}%)`}
                  otherLabel={`${t.analytics_ineligible} (${(100 - metrics.settlementRate * 100).toFixed(0)}%)`}
                />
              </SectionCard>

              {/* Top products by GMV */}
              <SectionCard title={t.analytics_top_products_title}>
                {topProducts.length === 0 ? (
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{t.analytics_top_products_empty}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {topProducts.map(p => (
                      <BarRow
                        key={p.productId}
                        label={p.productName || p.productId}
                        pct={maxProductGmv > 0 ? p.gmv / maxProductGmv : 0}
                        color="var(--primary)"
                        valueLabel={formatCurrency(p.gmv, selectedCurrency)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Video vs Showcase */}
              <SectionCard title={t.analytics_content_type_title}>
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.2rem' }}>
                  <LegendDot color="var(--primary)" label={t.analytics_type_video} />
                  <LegendDot color="var(--secondary)" label={t.analytics_type_showcase} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <BarRow
                    label={t.analytics_type_video}
                    pct={contentMax > 0 ? (videoAgg?.gmv ?? 0) / contentMax : 0}
                    color="var(--primary)"
                    valueLabel={formatCurrency(videoAgg?.gmv ?? 0, selectedCurrency)}
                  />
                  <BarRow
                    label={t.analytics_type_showcase}
                    pct={contentMax > 0 ? (showcaseAgg?.gmv ?? 0) / contentMax : 0}
                    color="var(--secondary)"
                    valueLabel={formatCurrency(showcaseAgg?.gmv ?? 0, selectedCurrency)}
                  />
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                  {t.analytics_type_video}: {videoAgg ? Math.round((videoAgg.settledOrderIds.size / Math.max(videoAgg.orderIds.size, 1)) * 100) : 0}% {t.analytics_settled.toLowerCase()}
                  {' · '}
                  {t.analytics_type_showcase}: {showcaseAgg ? Math.round((showcaseAgg.settledOrderIds.size / Math.max(showcaseAgg.orderIds.size, 1)) * 100) : 0}% {t.analytics_settled.toLowerCase()}
                </p>
              </SectionCard>

              {/* Shop ads vs Affiliate */}
              <SectionCard title={t.analytics_order_type_title}>
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.2rem' }}>
                  <LegendDot color="var(--primary)" label={t.analytics_ordertype_shopads} />
                  <LegendDot color="var(--secondary)" label={t.analytics_ordertype_affiliate} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <BarRow
                    label={t.analytics_ordertype_shopads}
                    pct={orderTypeMax > 0 ? (shopAdsAgg?.gmv ?? 0) / orderTypeMax : 0}
                    color="var(--primary)"
                    valueLabel={formatCurrency(shopAdsAgg?.gmv ?? 0, selectedCurrency)}
                  />
                  <BarRow
                    label={t.analytics_ordertype_affiliate}
                    pct={orderTypeMax > 0 ? (affiliateAgg?.gmv ?? 0) / orderTypeMax : 0}
                    color="var(--secondary)"
                    valueLabel={formatCurrency(affiliateAgg?.gmv ?? 0, selectedCurrency)}
                  />
                </div>
              </SectionCard>

              {/* Revenue by video, cross-referenced with TTChop renders */}
              <SectionCard title={t.analytics_by_video_title}>
                {revenueByVideo.length === 0 ? (
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{t.analytics_by_video_empty}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {revenueByVideo.map(v => (
                      <div key={v.contentId} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 999,
                            fontSize: '0.6rem', fontWeight: 700, background: 'var(--secondary-glow)', color: 'var(--secondary)', flexShrink: 0,
                          }}>
                            {v.contentType === 'Video' ? <Sparkles size={9} /> : <Layers size={9} />} {v.contentType || '—'}
                          </span>
                          <span style={{
                            fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--text-muted)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                          }}>
                            {v.contentId}
                          </span>
                        </div>

                        {v.render ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {v.render.scriptTemplateId && (
                              <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Scissors size={9} /> {v.render.scriptTemplateId}
                              </span>
                            )}
                            {v.render.voiceTemplateId && (
                              <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>· {v.render.voiceTemplateId}</span>
                            )}
                            {v.render.aiTemplateId && (
                              <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Sparkles size={9} /> {v.render.aiTemplateId}
                              </span>
                            )}
                            {v.render.language && (
                              <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>· {v.render.language}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.analytics_unlinked_render}</span>
                        )}

                        <BarRow
                          label={t.analytics_by_video_col_gmv}
                          pct={maxVideoRevenue > 0 ? v.gmv / maxVideoRevenue : 0}
                          color="var(--primary)"
                          valueLabel={formatCurrency(v.gmv, selectedCurrency)}
                        />
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>
                          {v.orderCount} {t.analytics_metric_orders.toLowerCase()} · {t.analytics_metric_revenue}: {formatCurrency(v.revenue, selectedCurrency)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {/* ── Publishing performance: cross-references tiktok_videos with orders/renders ── */}
          <div style={{ marginTop: '0.4rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', margin: '0 0 0.2rem' }}>
              {t.analytics_video_section_title}
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>{t.analytics_video_section_subtitle}</p>
          </div>

          {!hasVideoStats ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <Puzzle size={40} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t.analytics_video_empty_no_stats_title}</h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
                {t.analytics_video_empty_no_stats_text}
              </p>
            </div>
          ) : (
            <>
              {/* KPI tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
                <StatTile label={t.analytics_video_metric_published} value={videoStatsMetrics.videoCount.toLocaleString()} />
                <StatTile label={t.analytics_video_metric_views} value={videoStatsMetrics.totalViews.toLocaleString()} accent="var(--secondary)" />
                <StatTile label={t.analytics_video_metric_engagement} value={videoStatsMetrics.totalEngagement.toLocaleString()} />
                <StatTile label={t.analytics_video_metric_engagement_rate} value={`${(videoStatsMetrics.engagementRate * 100).toFixed(1)}%`} />
              </div>

              {/* Posting rhythm */}
              <SectionCard title={t.analytics_video_posting_title}>
                <PostingRhythmChart
                  buckets={postingBuckets}
                  granularity={postingGranularity}
                  emptyText={t.analytics_video_posting_empty}
                  unitLabel={t.analytics_video_posting_unit}
                />
              </SectionCard>

              {!hasOrdersData ? (
                <div className="glass-card" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.9rem 1rem' }}>
                  <Info size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{t.analytics_video_missing_sales_note}</p>
                </div>
              ) : (
                <>
                  {/* Per-video table joining tiktok_videos + analytics_orders + renders */}
                  <SectionCard title={t.analytics_video_table_title}>
                    {sortedVideoPerformance.length === 0 ? (
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{t.analytics_video_table_empty}</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 620 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                {t.analytics_video_col_video}
                              </th>
                              <SortableTh label={t.analytics_video_col_posted} sortKey="postedAt" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <SortableTh label={t.analytics_video_col_views} sortKey="views" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <SortableTh label={t.analytics_video_col_engagement} sortKey="engagement" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <SortableTh label={t.analytics_video_col_orders} sortKey="orders" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <SortableTh label={t.analytics_video_col_gmv} sortKey="gmv" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <SortableTh label={t.analytics_video_col_revenue} sortKey="revenue" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <SortableTh label={t.analytics_video_col_rpm} sortKey="rpm" active={videoSortKey} dir={videoSortDir} onSort={handleVideoSort} />
                              <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                {t.analytics_video_col_recipe}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedVideoPerformance.map(v => {
                              const views = v.stats?.playCount ?? 0;
                              const rpm = v.stats && views > 0 ? computeRpm(v.revenue, views) : null;
                              return (
                                <tr key={v.contentId} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <VideoThumb src={v.stats?.coverUrl} alt={v.contentId} />
                                      <span style={{
                                        fontFamily: 'monospace', fontSize: '0.66rem', color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90,
                                      }}>
                                        {v.contentId}
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    {v.stats ? formatPostedDate(v.stats.postedAt) : t.analytics_video_no_stats_placeholder}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700 }}>
                                    {v.stats ? views.toLocaleString() : t.analytics_video_no_stats_placeholder}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    {v.stats ? computeEngagement(v.stats).toLocaleString() : t.analytics_video_no_stats_placeholder}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    {v.orderCount.toLocaleString()}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    {formatCurrency(v.gmv, selectedCurrency)}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700 }}>
                                    {formatCurrency(v.revenue, selectedCurrency)}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>
                                    {rpm === null ? t.analytics_video_no_stats_placeholder : formatCurrency(rpm, selectedCurrency)}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top' }}>
                                    {v.render ? (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {(v.render.scriptTemplateId || v.render.aiTemplateId) && (
                                          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                            <Scissors size={8} /> {templateName(v.render.scriptTemplateId || v.render.aiTemplateId)}
                                          </span>
                                        )}
                                        {v.render.voiceTemplateId && (
                                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>· {templateName(v.render.voiceTemplateId)}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.analytics_video_no_recipe}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </SectionCard>

                  {/* "What works": reach vs conversion, and recipe performance */}
                  <SectionCard title={t.analytics_video_no_conversion_title}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>{t.analytics_video_no_conversion_hint}</p>
                    {highReachNoConversion.length === 0 ? (
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{t.analytics_video_no_conversion_empty}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {highReachNoConversion.map(v => (
                          <div key={v.contentId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <VideoThumb src={v.stats?.coverUrl} alt={v.contentId} />
                            <span style={{
                              fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--text-primary)', flex: 1, minWidth: 0,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {v.contentId}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                              <Eye size={11} /> {(v.stats?.playCount ?? 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title={t.analytics_video_efficient_title}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>{t.analytics_video_efficient_hint}</p>
                    {efficientLowReach.length === 0 ? (
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{t.analytics_video_efficient_empty}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {efficientLowReach.map(v => (
                          <div key={v.contentId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <VideoThumb src={v.stats?.coverUrl} alt={v.contentId} />
                            <span style={{
                              fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--text-primary)', flex: 1, minWidth: 0,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {v.contentId}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                              <Eye size={11} /> {(v.stats?.playCount ?? 0).toLocaleString()}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 700, flexShrink: 0 }}>
                              {formatCurrency(v.revenue, selectedCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  {([
                    { title: t.analytics_video_by_template_title, empty: t.analytics_video_by_template_empty, data: byTemplate },
                    { title: t.analytics_video_by_voice_title, empty: t.analytics_video_by_voice_empty, data: byVoice },
                  ] as const).map(group => (
                    <SectionCard key={group.title} title={group.title}>
                      {group.data.length === 0 ? (
                        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{group.empty}</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 380 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                  {t.analytics_video_col_recipe}
                                </th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                  {t.analytics_video_recipe_col_count}
                                </th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                  {t.analytics_video_recipe_col_avg_views}
                                </th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                  {t.analytics_video_recipe_col_avg_revenue}
                                </th>
                                <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                                  {t.analytics_video_recipe_col_rpm}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.data.map(agg => (
                                <tr key={agg.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '0.4rem 0.4rem', color: 'var(--text-primary)', fontStyle: agg.key === NO_RECIPE_KEY ? 'italic' : 'normal' }}>
                                    {recipeLabel(agg.key)}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.4rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{agg.videoCount.toLocaleString()}</td>
                                  <td style={{ padding: '0.4rem 0.4rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{Math.round(agg.avgViews).toLocaleString()}</td>
                                  <td style={{ padding: '0.4rem 0.4rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(agg.avgRevenue, selectedCurrency)}</td>
                                  <td style={{ padding: '0.4rem 0.4rem', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{formatCurrency(agg.revenuePer1000Views, selectedCurrency)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </SectionCard>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
