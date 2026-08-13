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
import type { AnalyticsOrder, Render, Template, TikTokVideoStats, ImportRecord, ImportContainerRef } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import type { Translations } from '../i18n';
import {
  type Period,
  filterByPeriod, filterByDateRange, filterRendersByPeriod, getPreviousPeriodRange,
  formatCurrency, computeOrderMetrics, computeDelta, aggregateByProduct, buildVideoRevenue,
  buildTopTemplate, buildDailyPerformanceBuckets, computeCommissionRate, buildPeriodHistory,
  templateNameResolver, filterVideoStatsByPeriod, filterVideoStatsByDateRange, computeVideoStatsMetrics,
} from '../utils/analytics';
import { useCurrencySelection } from '../hooks/useCurrencySelection';
import { SectionCard, PeriodSelector, CurrencySelector, DailyPerformanceChart, PeriodHistoryChart } from './shared/AnalyticsUI';

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
        // clamp: a 3 columnas en 375px una cifra como ¥395,659 no cabe a 1.2rem y se truncaría
        fontSize: 'clamp(0.82rem, 3.4vw, 1.2rem)', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)',
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

// ── Loading skeleton ─────────────────────────────────────────────────────────

const DashboardSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-hidden="true">
    <div className="skeleton-block" style={{ height: 36, width: '70%' }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
      {['gmv', 'revenue', 'commission-pct'].map(key => <div key={key} className="skeleton-block" style={{ height: 70 }} />)}
    </div>
    <div className="skeleton-block" style={{ height: 180 }} />
    <div className="skeleton-block" style={{ height: 140 }} />
    <div className="skeleton-block" style={{ height: 160 }} />
  </div>
);

// ── Main view ─────────────────────────────────────────────────────────────────

const PERIOD_COMPARISON_KEY: Record<Period, keyof Translations | null> = {
  d7: 'dashboard_vs_previous_d7',
  d30: 'dashboard_vs_previous_d30',
  m6: 'dashboard_vs_previous_m6',
  all: null,
};

export const DashboardView: React.FC<{ onGoToAnalytics?: () => void }> = ({ onGoToAnalytics }) => {
  const t = useT();
  const { activeAccountId } = useContainer();

  const [allOrders, setAllOrders] = useState<AnalyticsOrder[]>([]);
  const [allRenders, setAllRenders] = useState<Render[]>([]);
  const [allVideoStats, setAllVideoStats] = useState<TikTokVideoStats[]>([]);
  const [allImports, setAllImports] = useState<ImportRecord[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState<Period>('all');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [orderRows, renderRows, templateRows, videoStatsRows, importRows] = await Promise.all([
        db.getAnalyticsOrders(), db.getRenders(), db.getTemplates(), db.getTikTokVideoStats(), db.getImports(),
      ]);
      if (!mountedRef.current) return;
      setAllOrders(orderRows);
      setAllRenders(renderRows);
      setTemplates(templateRows);
      setAllVideoStats(videoStatsRows);
      setAllImports(importRows);
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
  // Orders/videoStats resolve THROUGH their import when they have one — see getEffectiveContainer.
  const importsById = useMemo(
    () => new Map<string, ImportContainerRef>(allImports.map(imp => [imp.id, imp])),
    [allImports]
  );
  const orders = useMemo(() => getVisibleForContainer(allOrders, activeAccountId, importsById), [allOrders, activeAccountId, importsById]);
  const renders = useMemo(() => getVisibleForContainer(allRenders, activeAccountId), [allRenders, activeAccountId]);
  const videoStats = useMemo(() => getVisibleForContainer(allVideoStats, activeAccountId, importsById), [allVideoStats, activeAccountId, importsById]);

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

  // Unidades vendidas y videos publicados por día — ambos conteos, una sola escala.
  // Tendencia bloque a bloque: cada punto es un período completo. Null en 'Máximo'.
  const history = useMemo(() => buildPeriodHistory(currencyOrders, period, now), [currencyOrders, period, now]);
  const { granularity: dailyPerfGranularity, buckets: dailyPerfBuckets } = useMemo(
    () => buildDailyPerformanceBuckets(currencyOrders, videoStats, period, now),
    [currencyOrders, videoStats, period, now]
  );

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
              { key: 'd7', label: t.analytics_period_d7 },
              { key: 'd30', label: t.analytics_period_d30 },
              { key: 'm6', label: t.analytics_period_m6 },
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
              {/* Las tres métricas de dinero primero: GMV, comisión, y qué porcentaje del GMV
                  representa esa comisión. El porcentaje se calcula con los dos números de arriba
                  para que cuadre si el usuario los divide a mano. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                <KpiCard
                  label={t.analytics_metric_gmv}
                  value={formatCurrency(currentMetrics.gmvTotal, selectedCurrency)}
                  deltaPct={delta(currentMetrics.gmvTotal, previousMetrics.gmvTotal)}
                  comparisonLabel={comparisonLabel}
                />
                <KpiCard
                  label={t.analytics_metric_revenue}
                  value={formatCurrency(currentMetrics.revenueTotal, selectedCurrency)}
                  deltaPct={delta(currentMetrics.revenueTotal, previousMetrics.revenueTotal)}
                  comparisonLabel={comparisonLabel}
                />
                <KpiCard
                  label={t.analytics_metric_commission_pct}
                  value={currentMetrics.gmvTotal > 0
                    ? `${(computeCommissionRate(currentMetrics.revenueTotal, currentMetrics.gmvTotal) * 100).toFixed(1)}%`
                    : '—'}
                  deltaPct={delta(
                    computeCommissionRate(currentMetrics.revenueTotal, currentMetrics.gmvTotal),
                    computeCommissionRate(previousMetrics.revenueTotal, previousMetrics.gmvTotal),
                  )}
                  comparisonLabel={comparisonLabel}
                />
              </div>

              {/* Gráfica diaria: unidades vendidas y videos publicados */}
              <SectionCard title={t.analytics_daily_chart_title}>
                <DailyPerformanceChart
                  buckets={dailyPerfBuckets}
                  granularity={dailyPerfGranularity}
                  emptyText={t.analytics_daily_chart_empty}
                  unitsLabel={t.analytics_metric_units}
                  videosLabel={t.analytics_video_metric_published}
                />
              </SectionCard>

              {/* El resto de las métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
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

              {/* Tendencia período a período. No aplica en 'Máximo'. */}
              {history && (
                <SectionCard title={t.dashboard_history_title}>
                  <PeriodHistoryChart
                    points={history}
                    blockLabel={
                      period === 'd7' ? t.dashboard_history_block_d7
                        : period === 'd30' ? t.dashboard_history_block_d30
                          : t.dashboard_history_block_m6
                    }
                    currentLabel={t.dashboard_history_current}
                    deltaLabel={t.dashboard_history_previous}
                    emptyText={t.dashboard_history_empty}
                  />
                </SectionCard>
              )}

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
