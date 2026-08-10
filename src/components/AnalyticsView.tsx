import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Upload, FileSpreadsheet, RefreshCw, ShieldAlert, CheckCircle2,
  AlertTriangle, X, Info, Sparkles, Scissors, Layers,
} from 'lucide-react';
import { db } from '../services/databaseService';
import type { AnalyticsOrder, Render } from '../services/databaseService';
import { parseAnalyticsFile, AnalyticsImportError } from '../services/analyticsImport';
import { useT } from '../context/LanguageContext';
import type { Translations } from '../i18n';

type Period = 'week' | 'month' | 'year' | 'all';

// ── Date helpers (period filtering) ─────────────────────────────────────────

// Todas las fronteras se calculan en UTC porque las fechas del export se guardan como hora de
// pared anclada a UTC (ver parseTikTokDate). Mezclarlas con fronteras en hora local metería un
// desfase del tamaño del offset del usuario y movería órdenes de un período a otro.
function startOfWeekMonday(d: Date): Date {
  const nd = new Date(d);
  const day = nd.getUTCDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  nd.setUTCDate(nd.getUTCDate() + diff);
  nd.setUTCHours(0, 0, 0, 0);
  return nd;
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function filterByPeriod(orders: AnalyticsOrder[], period: Period): AnalyticsOrder[] {
  if (period === 'all') return orders;
  const now = new Date();
  const cutoff = period === 'week' ? startOfWeekMonday(now) : period === 'month' ? startOfMonth(now) : startOfYear(now);
  return orders.filter(o => o.orderDate !== null && new Date(o.orderDate) >= cutoff);
}

// ── Currency formatting ──────────────────────────────────────────────────────

function formatCurrency(value: number, currency: string): string {
  if (!currency) return value.toLocaleString();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

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

// ── Aggregation helpers ──────────────────────────────────────────────────────

interface CategoryAgg {
  key: string;
  gmv: number;
  revenue: number;
  orderIds: Set<string>;
  settledOrderIds: Set<string>;
}

function aggregateBy(orders: AnalyticsOrder[], keyFn: (o: AnalyticsOrder) => string): Map<string, CategoryAgg> {
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

// ── Small presentational pieces ──────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="glass-card" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
    <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h4>
    {children}
  </div>
);

const StatTile: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div style={{
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '0.65rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0,
  }}>
    <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {label}
    </span>
    <span style={{
      fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)',
      color: accent ?? 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {value}
    </span>
  </div>
);

/** A single sequential/categorical bar: rounded-end SVG rect on a track, label left, value right. */
const BarRow: React.FC<{ label: string; pct: number; color: string; valueLabel: string }> = ({ label, pct, color, valueLabel }) => {
  const clamped = Math.max(0, Math.min(1, pct));
  const fillWidth = clamped > 0 ? Math.max(clamped * 100, 3) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{
        fontSize: '0.72rem', color: 'var(--text-secondary)', width: '92px', flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={label}>
        {label}
      </span>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ flex: 1, height: 10, minWidth: 0, display: 'block' }} aria-hidden="true">
        <rect x={0} y={0} width={100} height={10} rx={4} fill="var(--bg-input)" />
        {fillWidth > 0 && <rect x={0} y={0} width={fillWidth} height={10} rx={4} fill={color} />}
      </svg>
      <span style={{
        fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', width: '96px', textAlign: 'right',
        flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {valueLabel}
      </span>
    </div>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
    {label}
  </span>
);

/** Settlement rate as a 2-segment stacked bar (status colors: success = settled, warning = the rest). */
const SettlementBar: React.FC<{ settledPct: number; settledLabel: string; otherLabel: string }> = ({ settledPct, settledLabel, otherLabel }) => {
  const pct = Math.max(0, Math.min(1, settledPct));
  const settledWidth = Math.max(pct * 100 - (pct > 0 && pct < 1 ? 0.6 : 0), 0);
  const otherWidth = Math.max(100 - pct * 100 - (pct > 0 && pct < 1 ? 0.6 : 0), 0);
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.4rem' }}>
        <LegendDot color="var(--success)" label={settledLabel} />
        <LegendDot color="var(--warning)" label={otherLabel} />
      </div>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" style={{ width: '100%', height: 12, display: 'block' }} aria-hidden="true">
        <rect x={0} y={0} width={100} height={12} rx={5} fill="var(--bg-input)" />
        {settledWidth > 0 && <rect x={0} y={0} width={settledWidth} height={12} rx={4} fill="var(--success)" />}
        {otherWidth > 0 && <rect x={100 - otherWidth} y={0} width={otherWidth} height={12} rx={4} fill="var(--warning)" />}
      </svg>
    </div>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────────

export const AnalyticsView: React.FC = () => {
  const t = useT();

  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [renders, setRenders] = useState<Render[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [period, setPeriod] = useState<Period>('all');
  const [selectedCurrency, setSelectedCurrency] = useState('');

  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [importSummary, setImportSummary] = useState<{ total: number; created: number; updated: number; discarded: number } | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [orderRows, renderRows] = await Promise.all([db.getAnalyticsOrders(), db.getRenders()]);
      setOrders(orderRows);
      setRenders(renderRows);
    } catch (err) {
      console.error(err);
      setLoadError(t.analytics_error_load);
    } finally {
      setLoading(false);
    }
  }, [t.analytics_error_load]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Currency: group by currency, never sum across currencies ──────────────
  const currencies = useMemo(() => Array.from(new Set(orders.map(o => o.currency).filter(Boolean))), [orders]);

  const dominantCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    orders.forEach(o => totals.set(o.currency, (totals.get(o.currency) ?? 0) + o.gmv));
    let best = '';
    let bestVal = -Infinity;
    totals.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
    return best;
  }, [orders]);

  useEffect(() => {
    if (currencies.length === 0) { setSelectedCurrency(''); return; }
    if (!currencies.includes(selectedCurrency)) setSelectedCurrency(dominantCurrency);
  }, [currencies, dominantCurrency, selectedCurrency]);

  const currencyOrders = useMemo(
    () => (selectedCurrency ? orders.filter(o => o.currency === selectedCurrency) : orders),
    [orders, selectedCurrency]
  );
  const periodOrders = useMemo(() => filterByPeriod(currencyOrders, period), [currencyOrders, period]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const gmvTotal = periodOrders.reduce((s, o) => s + o.gmv, 0);
    const settled = periodOrders.filter(o => o.settlementStatus === 'Settled');
    const revenueTotal = settled.reduce((s, o) => s + o.totalFinalEarnedAmount, 0);
    const orderIds = new Set(periodOrders.map(o => o.orderId));
    const settledOrderIds = new Set(settled.map(o => o.orderId));
    const unitsSold = periodOrders.reduce((s, o) => s + o.itemsSold, 0);
    const refunds = periodOrders.reduce((s, o) => s + o.itemsRefunded, 0);
    const settlementRate = orderIds.size > 0 ? settledOrderIds.size / orderIds.size : 0;
    return { gmvTotal, revenueTotal, orderCount: orderIds.size, unitsSold, refunds, settlementRate };
  }, [periodOrders]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; gmv: number }>();
    periodOrders.forEach(o => {
      if (!o.productId) return;
      const entry = map.get(o.productId) ?? { productId: o.productId, productName: o.productName, gmv: 0 };
      entry.gmv += o.gmv;
      map.set(o.productId, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv).slice(0, 5);
  }, [periodOrders]);

  const contentTypeAgg = useMemo(() => aggregateBy(periodOrders, o => o.contentType), [periodOrders]);
  const orderTypeAgg = useMemo(() => aggregateBy(periodOrders, o => o.orderType), [periodOrders]);

  const revenueByVideo = useMemo(() => {
    const map = new Map<string, { contentId: string; contentType: string; gmv: number; revenue: number; orderIds: Set<string> }>();
    periodOrders.forEach(o => {
      if (!o.contentId) return;
      const entry = map.get(o.contentId) ?? { contentId: o.contentId, contentType: o.contentType, gmv: 0, revenue: 0, orderIds: new Set<string>() };
      entry.gmv += o.gmv;
      if (o.settlementStatus === 'Settled') entry.revenue += o.totalFinalEarnedAmount;
      entry.orderIds.add(o.orderId);
      map.set(o.contentId, entry);
    });
    return Array.from(map.values())
      .map(entry => ({
        ...entry,
        orderCount: entry.orderIds.size,
        render: renders.find(r => r.tiktokVideoId === entry.contentId),
      }))
      .sort((a, b) => b.revenue - a.revenue || b.gmv - a.gmv)
      .slice(0, 8);
  }, [periodOrders, renders]);

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
      const { newCount, updatedCount } = await db.importAnalyticsOrders(parsed.orders);
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

  const hasData = orders.length > 0;
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
            <Upload size={14} /> {hasData ? t.analytics_import_another : t.analytics_import_button}
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
      ) : !hasData ? (
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
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '2px' }}>
            {(['week', 'month', 'year', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '0.35rem 0.9rem', borderRadius: '999px', minHeight: '44px',
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: period === p ? 'var(--gradient)' : 'var(--bg-card)',
                  color: period === p ? '#fff' : 'var(--text-secondary)',
                  border: period === p ? '1px solid transparent' : '1px solid var(--border)',
                }}
              >
                {p === 'week' ? t.analytics_period_week : p === 'month' ? t.analytics_period_month : p === 'year' ? t.analytics_period_year : t.analytics_period_all}
              </button>
            ))}
          </div>

          {/* Currency selector — never sums across currencies */}
          {currencies.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <Info size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>{t.analytics_currency_note}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {currencies.map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedCurrency(c)}
                    style={{
                      padding: '0.3rem 0.9rem', borderRadius: '999px', minHeight: '44px', fontSize: '0.7rem', fontWeight: 700,
                      cursor: 'pointer', background: selectedCurrency === c ? 'var(--secondary-glow)' : 'var(--bg-card)',
                      color: selectedCurrency === c ? 'var(--secondary)' : 'var(--text-secondary)',
                      border: selectedCurrency === c ? '1px solid var(--secondary-glow)' : '1px solid var(--border)',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {periodOrders.length === 0 ? (
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
        </div>
      )}
    </div>
  );
};
