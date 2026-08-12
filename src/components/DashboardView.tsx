// Dashboard — the app's entry tab. Answers "am I selling more?" at a glance: KPI cards
// with period-over-period deltas, a revenue growth chart, and the period's stand-out
// product/video/template. Reuses AnalyticsView's period/currency/aggregation logic
// (see ../utils/analytics.ts and ../hooks/useCurrencySelection) instead of
// reimplementing it — both views read the same `analytics_orders` data.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, ShieldAlert, RefreshCw, ArrowUpRight, ArrowDownRight, Minus,
  Package, Video, LayoutTemplate, Scissors, Sparkles, Info,
} from 'lucide-react';
import { db, getVisibleForContainer } from '../services/databaseService';
import type { AnalyticsOrder, Render, Template, TikTokVideoStats } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import type { Translations } from '../i18n';
import {
  type Period, type RevenueBucket, type BucketGranularity,
  filterByPeriod, filterByDateRange, filterRendersByPeriod, getPreviousPeriodRange,
  formatCurrency, computeOrderMetrics, computeDelta, aggregateByProduct, buildVideoRevenue,
  buildTopTemplate, buildRevenueBuckets, bucketGranularityForPeriod, formatBucketLabel,
  templateNameResolver, filterVideoStatsByPeriod, filterVideoStatsByDateRange, computeVideoStatsMetrics,
} from '../utils/analytics';
import { useCurrencySelection } from '../hooks/useCurrencySelection';
import { SectionCard, PeriodSelector, CurrencySelector } from './shared/AnalyticsUI';

// ── KPI card with period-over-period delta ──────────────────────────────────

const KpiCard: React.FC<{ label: string; value: string; deltaPct: number | null; comparisonLabel: string }> = ({
  label, value, deltaPct, comparisonLabel,
}) => {
  const isFlat = deltaPct === 0;
  const isUp = (deltaPct ?? 0) > 0;
  const DeltaIcon = deltaPct === null ? null : isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const deltaColor = isFlat ? 'var(--text-muted)' : isUp ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="glass-card" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0,
    }}>
      <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      <span style={{
        fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </span>
      {deltaPct !== null && DeltaIcon && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', fontWeight: 700, color: deltaColor }}>
          <DeltaIcon size={12} />
          {Math.abs(deltaPct * 100).toFixed(1)}%
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{comparisonLabel}</span>
        </span>
      )}
    </div>
  );
};

// ── Highlight row (top product / video / template) ──────────────────────────

const HighlightRow: React.FC<{ icon: React.ReactNode; label: string; primary: string; secondary?: string; extra?: React.ReactNode }> = ({
  icon, label, primary, secondary, extra,
}) => (
  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
    <div style={{
      width: 28, height: 28, borderRadius: 8, background: 'var(--primary-glow)', color: 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      <span style={{
        fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {primary}
      </span>
      {secondary && <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 600 }}>{secondary}</span>}
      {extra}
    </div>
  </div>
);

// ── Growth chart ─────────────────────────────────────────────────────────────
// Single-series line + area (per dataviz guidance: one series needs no legend — the
// section title already names it). Thin 2px line, ~10% area wash, hairline baseline,
// direct end-label, and a nearest-bucket hover/tap crosshair + tooltip.

const CHART_H_PX = 140;
const VB_W = 100;
const VB_H = 400;
const PAD_TOP = 24;
const PAD_BOTTOM = 24;

const GrowthChart: React.FC<{ buckets: RevenueBucket[]; granularity: BucketGranularity; currency: string; emptyText: string }> = ({
  buckets, granularity, currency, emptyText,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (buckets.length === 0) {
    return <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{emptyText}</p>;
  }

  const n = buckets.length;
  const maxRevenue = Math.max(...buckets.map(b => b.revenue), 0);
  const usableH = VB_H - PAD_TOP - PAD_BOTTOM;

  const points = buckets.map((b, i) => {
    const xPct = n === 1 ? 50 : (i / (n - 1)) * VB_W;
    const yUnits = maxRevenue > 0 ? PAD_TOP + usableH - (b.revenue / maxRevenue) * usableH : VB_H - PAD_BOTTOM;
    return { xPct, yUnits, topPx: (yUnits / VB_H) * CHART_H_PX, bucket: b };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.xPct.toFixed(2)},${p.yUnits.toFixed(2)}`).join(' ');
  const baselineY = VB_H - PAD_BOTTOM;
  const areaPath = `${linePath} L ${points[n - 1].xPct.toFixed(2)},${baselineY} L ${points[0].xPct.toFixed(2)},${baselineY} Z`;

  const updateHoverFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(frac * (n - 1)));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHoverIndex(i => Math.max(0, (i ?? 0) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHoverIndex(i => Math.min(n - 1, (i ?? -1) + 1)); }
    else if (e.key === 'Escape') setHoverIndex(null);
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points[n - 1];
  const lastLabelAbove = last.topPx > 28;

  return (
    <div>
      <div
        ref={containerRef}
        role="img"
        aria-label={`${formatBucketLabel(last.bucket.date, granularity)}: ${formatCurrency(last.bucket.revenue, currency)}`}
        tabIndex={0}
        onPointerMove={e => updateHoverFromClientX(e.clientX)}
        onPointerDown={e => updateHoverFromClientX(e.clientX)}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={handleKeyDown}
        style={{ position: 'relative', paddingTop: '30px', touchAction: 'pan-y', outline: 'none' }}
      >
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: '100%', height: CHART_H_PX, display: 'block' }} aria-hidden="true">
          <line x1={0} y1={baselineY} x2={VB_W} y2={baselineY} stroke="var(--border)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={areaPath} fill="var(--primary)" opacity={0.1} stroke="none" />
          <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hovered && (
            <line x1={hovered.xPct} y1={PAD_TOP} x2={hovered.xPct} y2={baselineY} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* End-dot marker (surface ring + fill) */}
        <div style={{
          position: 'absolute', left: `${last.xPct}%`, top: last.topPx, transform: 'translate(-50%, -50%)',
          width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--bg-card)',
        }} />
        {/* Direct end-label */}
        <div style={{
          position: 'absolute', left: `${Math.min(96, Math.max(4, last.xPct))}%`,
          top: lastLabelAbove ? last.topPx - 10 : last.topPx + 16,
          transform: `translate(-50%, ${lastLabelAbove ? '-100%' : '0'})`,
          fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap',
        }}>
          {formatCurrency(last.bucket.revenue, currency)}
        </div>

        {hovered && (
          <>
            <div style={{
              position: 'absolute', left: `${hovered.xPct}%`, top: hovered.topPx, transform: 'translate(-50%, -50%)',
              width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--bg-card)',
            }} />
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'absolute', left: `${Math.min(92, Math.max(8, hovered.xPct))}%`, top: 0, transform: 'translate(-50%, 0)',
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.25rem 0.5rem',
                display: 'flex', flexDirection: 'column', gap: 1, boxShadow: 'var(--shadow-lg)', whiteSpace: 'nowrap', pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{formatBucketLabel(hovered.bucket.date, granularity)}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatCurrency(hovered.bucket.revenue, currency)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Selective x-axis labels: first / middle / last */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{formatBucketLabel(buckets[0].date, granularity)}</span>
        {n > 2 && (
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            {formatBucketLabel(buckets[Math.floor((n - 1) / 2)].date, granularity)}
          </span>
        )}
        {n > 1 && (
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{formatBucketLabel(buckets[n - 1].date, granularity)}</span>
        )}
      </div>
    </div>
  );
};

// ── Loading skeleton ─────────────────────────────────────────────────────────

const DashboardSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-hidden="true">
    <div className="skeleton-block" style={{ height: 36, width: '70%' }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
      {['revenue', 'gmv', 'units', 'orders'].map(key => <div key={key} className="skeleton-block" style={{ height: 70 }} />)}
    </div>
    <div className="skeleton-block" style={{ height: 180 }} />
    <div className="skeleton-block" style={{ height: 140 }} />
    <div className="skeleton-block" style={{ height: 160 }} />
  </div>
);

// ── Main view ─────────────────────────────────────────────────────────────────

const PERIOD_COMPARISON_KEY: Record<Period, keyof Translations | null> = {
  week: 'dashboard_vs_previous_week',
  month: 'dashboard_vs_previous_month',
  year: 'dashboard_vs_previous_year',
  all: null,
};

export const DashboardView: React.FC<{ onGoToAnalytics?: () => void }> = ({ onGoToAnalytics }) => {
  const t = useT();
  const { activeAccountId } = useContainer();

  const [allOrders, setAllOrders] = useState<AnalyticsOrder[]>([]);
  const [allRenders, setAllRenders] = useState<Render[]>([]);
  const [allVideoStats, setAllVideoStats] = useState<TikTokVideoStats[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState<Period>('week');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [orderRows, renderRows, templateRows, videoStatsRows] = await Promise.all([
        db.getAnalyticsOrders(), db.getRenders(), db.getTemplates(), db.getTikTokVideoStats(),
      ]);
      if (!mountedRef.current) return;
      setAllOrders(orderRows);
      setAllRenders(renderRows);
      setTemplates(templateRows);
      setAllVideoStats(videoStatsRows);
    } catch (err) {
      console.error(err);
      if (mountedRef.current) setLoadError(t.dashboard_error_load);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [t.dashboard_error_load]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Neither analytics_orders, renders, nor tiktok_videos are container-filtered server side —
  // re-derive on activeAccountId change instead of re-fetching (same pattern as AnalyticsView).
  const orders = useMemo(() => getVisibleForContainer(allOrders, activeAccountId), [allOrders, activeAccountId]);
  const renders = useMemo(() => getVisibleForContainer(allRenders, activeAccountId), [allRenders, activeAccountId]);
  const videoStats = useMemo(() => getVisibleForContainer(allVideoStats, activeAccountId), [allVideoStats, activeAccountId]);

  const now = useMemo(() => new Date(), []);

  // ── Currency: group by currency, never sum across currencies ──────────────
  const { currencies, selectedCurrency, setSelectedCurrency, currencyOrders } = useCurrencySelection(orders);

  const periodOrders = useMemo(() => filterByPeriod(currencyOrders, period, now), [currencyOrders, period, now]);

  const previousRange = useMemo(() => getPreviousPeriodRange(period, now), [period, now]);
  const previousPeriodOrders = useMemo(
    () => (previousRange ? filterByDateRange(currencyOrders, previousRange.start, previousRange.end) : []),
    [currencyOrders, previousRange]
  );
  const hasPreviousData = previousPeriodOrders.length > 0;
  const comparisonKey = PERIOD_COMPARISON_KEY[period];
  const comparisonLabel = comparisonKey ? t[comparisonKey] : '';

  const delta = useCallback(
    (curr: number, prev: number) => (hasPreviousData ? computeDelta(curr, prev) : null),
    [hasPreviousData]
  );

  const currentMetrics = useMemo(() => computeOrderMetrics(periodOrders), [periodOrders]);
  const previousMetrics = useMemo(() => computeOrderMetrics(previousPeriodOrders), [previousPeriodOrders]);

  // Views KPI — cross-referenced from tiktok_videos (captured by the extension), not orders.
  // Its own "has previous data" flag: a period with no captured videos shouldn't be conflated
  // with a period that simply had no sales.
  const periodVideoStats = useMemo(() => filterVideoStatsByPeriod(videoStats, period, now), [videoStats, period, now]);
  const previousVideoStats = useMemo(
    () => (previousRange ? filterVideoStatsByDateRange(videoStats, previousRange.start, previousRange.end) : []),
    [videoStats, previousRange]
  );
  const currentViewsMetrics = useMemo(() => computeVideoStatsMetrics(periodVideoStats), [periodVideoStats]);
  const previousViewsMetrics = useMemo(() => computeVideoStatsMetrics(previousVideoStats), [previousVideoStats]);
  const viewsDelta = previousVideoStats.length > 0 ? computeDelta(currentViewsMetrics.totalViews, previousViewsMetrics.totalViews) : null;

  const granularity = bucketGranularityForPeriod(period);
  const buckets = useMemo(() => buildRevenueBuckets(currencyOrders, period, now), [currencyOrders, period, now]);

  const topProductEntry = useMemo(() => {
    const list = aggregateByProduct(periodOrders).sort((a, b) => b.revenue - a.revenue);
    return list[0] ?? null;
  }, [periodOrders]);

  const videoRevenue = useMemo(() => buildVideoRevenue(periodOrders, renders), [periodOrders, renders]);
  const topVideoEntry = videoRevenue[0] ?? null;
  const topVideos = useMemo(() => videoRevenue.slice(0, 5), [videoRevenue]);

  const periodRenders = useMemo(() => filterRendersByPeriod(renders, period, now), [renders, period, now]);
  const topTemplateEntry = useMemo(() => buildTopTemplate(periodRenders), [periodRenders]);
  // Los renders guardan ids; el usuario necesita ver el nombre del template, no `tpl_1723849...`
  const templateName = useMemo(() => templateNameResolver(templates), [templates]);

  const hasData = orders.length > 0;

  return (
    <div className="view-content">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
          {t.dashboard_title}
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {t.dashboard_subtitle}
        </p>
      </div>

      {loading ? (
        <DashboardSkeleton />
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
      ) : !hasData ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <LayoutDashboard size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t.dashboard_empty_title}</h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.5, margin: 0 }}>
            {t.dashboard_empty_text}
          </p>
          {onGoToAnalytics && (
            <button onClick={onGoToAnalytics} className="btn btn-primary" style={{ width: 'auto', padding: '0 1.2rem' }}>
              {t.dashboard_empty_cta}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

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

          {periodOrders.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '0.82rem', margin: 0 }}>{t.analytics_no_data_period}</p>
            </div>
          ) : (
            <>
              {/* KPI cards with period-over-period comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
                <KpiCard
                  label={t.analytics_metric_revenue}
                  value={formatCurrency(currentMetrics.revenueTotal, selectedCurrency)}
                  deltaPct={delta(currentMetrics.revenueTotal, previousMetrics.revenueTotal)}
                  comparisonLabel={comparisonLabel}
                />
                <KpiCard
                  label={t.analytics_metric_gmv}
                  value={formatCurrency(currentMetrics.gmvTotal, selectedCurrency)}
                  deltaPct={delta(currentMetrics.gmvTotal, previousMetrics.gmvTotal)}
                  comparisonLabel={comparisonLabel}
                />
                <KpiCard
                  label={t.analytics_metric_units}
                  value={currentMetrics.unitsSold.toLocaleString()}
                  deltaPct={delta(currentMetrics.unitsSold, previousMetrics.unitsSold)}
                  comparisonLabel={comparisonLabel}
                />
                <KpiCard
                  label={t.analytics_metric_orders}
                  value={currentMetrics.orderCount.toLocaleString()}
                  deltaPct={delta(currentMetrics.orderCount, previousMetrics.orderCount)}
                  comparisonLabel={comparisonLabel}
                />
                <KpiCard
                  label={t.dashboard_metric_views}
                  value={currentViewsMetrics.totalViews.toLocaleString()}
                  deltaPct={viewsDelta}
                  comparisonLabel={comparisonLabel}
                />
              </div>

              {/* Growth chart */}
              <SectionCard title={t.dashboard_growth_title}>
                <GrowthChart buckets={buckets} granularity={granularity} currency={selectedCurrency} emptyText={t.dashboard_growth_empty} />
              </SectionCard>

              {/* Highlights */}
              <SectionCard title={t.dashboard_highlights_title}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <HighlightRow
                    icon={<Package size={14} />}
                    label={t.dashboard_highlight_top_product}
                    primary={topProductEntry ? (topProductEntry.productName || topProductEntry.productId) : t.dashboard_highlight_empty}
                    secondary={topProductEntry ? formatCurrency(topProductEntry.revenue, selectedCurrency) : undefined}
                  />
                  <HighlightRow
                    icon={<Video size={14} />}
                    label={t.dashboard_highlight_top_video}
                    primary={topVideoEntry ? topVideoEntry.contentId : t.dashboard_highlight_empty}
                    secondary={topVideoEntry ? formatCurrency(topVideoEntry.revenue, selectedCurrency) : undefined}
                    extra={topVideoEntry && (
                      topVideoEntry.render ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.1rem' }}>
                          {topVideoEntry.render.scriptTemplateId && (
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Scissors size={9} /> {templateName(topVideoEntry.render.scriptTemplateId)}
                            </span>
                          )}
                          {topVideoEntry.render.voiceTemplateId && (
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)' }}>· {templateName(topVideoEntry.render.voiceTemplateId)}</span>
                          )}
                          {topVideoEntry.render.aiTemplateId && (
                            <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Sparkles size={9} /> {templateName(topVideoEntry.render.aiTemplateId)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.analytics_unlinked_render}</span>
                      )
                    )}
                  />
                  <HighlightRow
                    icon={<LayoutTemplate size={14} />}
                    label={t.dashboard_highlight_top_template}
                    primary={topTemplateEntry ? topTemplateEntry.templateId : t.dashboard_highlight_empty}
                    secondary={topTemplateEntry ? t.dashboard_highlight_template_count.replace('{count}', String(topTemplateEntry.count)) : undefined}
                  />
                </div>
              </SectionCard>

              {/* Top videos table */}
              <SectionCard title={t.dashboard_top_videos_title}>
                {topVideos.length === 0 ? (
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{t.analytics_by_video_empty}</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 320 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                            {t.analytics_by_video_col_video}
                          </th>
                          <th style={{ textAlign: 'left', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                            {t.dashboard_col_product}
                          </th>
                          <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                            {t.analytics_by_video_col_revenue}
                          </th>
                          <th style={{ textAlign: 'right', padding: '0.3rem 0.4rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.64rem' }}>
                            {t.dashboard_col_units}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {topVideos.map(v => (
                          <tr key={v.contentId} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top' }}>
                              <div style={{
                                fontFamily: 'monospace', fontSize: '0.66rem', color: 'var(--text-primary)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110,
                              }}>
                                {v.contentId}
                              </div>
                              {v.render ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                                  {v.render.scriptTemplateId && (
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                      <Scissors size={8} /> {templateName(v.render.scriptTemplateId)}
                                    </span>
                                  )}
                                  {v.render.voiceTemplateId && (
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>· {templateName(v.render.voiceTemplateId)}</span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.analytics_unlinked_render}</span>
                              )}
                            </td>
                            <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', color: 'var(--text-secondary)' }}>
                              {v.productName || '—'}
                            </td>
                            <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {formatCurrency(v.revenue, selectedCurrency)}
                            </td>
                            <td style={{ padding: '0.4rem 0.4rem', verticalAlign: 'top', textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {v.unitsSold.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      )}
    </div>
  );
};
