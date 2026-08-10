import React, { useCallback, useEffect, useState } from 'react';
import {
  FileBarChart, RefreshCw, AlertTriangle, Sparkles, Trash2, X, ChevronRight, Clock,
} from 'lucide-react';
import { db } from '../services/databaseService';
import type {
  AnalyticsOrder, Render, BrandConcept, ReportHistoryEntry, ReportOrderSummary, ReportRenderInfo,
} from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { renderMarkdown } from '../utils/markdown';

// The server only ever needs a summary of recent activity, never the raw
// order ledger — sending thousands of order lines per report would blow past
// reasonable request sizes and LLM context for no analytical benefit.
const ORDER_WINDOW_DAYS = 90;
const MAX_RAW_ORDER_ROWS = 250; // above this, orders are grouped by contentId before sending

function buildReportOrders(orders: AnalyticsOrder[]): ReportOrderSummary[] {
  const cutoffMs = Date.now() - ORDER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recent = orders.filter(o => o.orderDate !== null && new Date(o.orderDate).getTime() >= cutoffMs);

  const toSummary = (o: AnalyticsOrder): ReportOrderSummary => ({
    contentId: o.contentId,
    gmv: o.gmv,
    revenue: o.settlementStatus === 'Settled' ? o.totalFinalEarnedAmount : 0,
    itemsSold: o.itemsSold,
    productId: o.productId,
    productName: o.productName,
    contentType: o.contentType,
    orderType: o.orderType,
    settled: o.settlementStatus === 'Settled',
    orderDate: o.orderDate,
  });

  if (recent.length <= MAX_RAW_ORDER_ROWS) return recent.map(toSummary);

  // Still too many for a single request: aggregate by contentId (one row per video/showcase).
  const grouped = new Map<string, ReportOrderSummary>();
  recent.forEach(o => {
    const summary = toSummary(o);
    const key = summary.contentId || `${summary.productId}_no_content`;
    const existing = grouped.get(key);
    if (existing) {
      existing.gmv += summary.gmv;
      existing.revenue += summary.revenue;
      existing.itemsSold += summary.itemsSold;
      if (summary.orderDate && (!existing.orderDate || summary.orderDate > existing.orderDate)) {
        existing.orderDate = summary.orderDate;
      }
    } else {
      grouped.set(key, summary);
    }
  });
  return Array.from(grouped.values());
}

function toReportRender(r: Render): ReportRenderInfo {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    type: r.type,
    tiktokVideoId: r.tiktokVideoId,
    scriptTemplateId: r.scriptTemplateId,
    voiceTemplateId: r.voiceTemplateId,
    aiTemplateId: r.aiTemplateId,
    language: r.language,
    createdAt: r.createdAt,
  };
}

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="glass-card" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
    <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      {icon}{title}
    </h4>
    {children}
  </div>
);

export const ReportsView: React.FC = () => {
  const t = useT();
  const reportLanguage = localStorage.getItem('ttchop_language') || 'English';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [renders, setRenders] = useState<Render[]>([]);
  const [brandConcept, setBrandConcept] = useState<BrandConcept | null>(null);
  const [strategy, setStrategy] = useState('');
  const [history, setHistory] = useState<ReportHistoryEntry[]>([]);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [openReport, setOpenReport] = useState<ReportHistoryEntry | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [orderRows, renderRows, concept, calStrategy, historyRows] = await Promise.all([
        db.getAnalyticsOrders(),
        db.getRenders(),
        db.getBrandConcept(),
        db.getCalendarStrategy(),
        db.getReportHistory(),
      ]);
      setOrders(orderRows);
      setRenders(renderRows);
      setBrandConcept(concept);
      setStrategy(calStrategy?.strategy ?? '');
      setHistory(historyRows);
    } catch (err) {
      console.error(err);
      setLoadError(t.reports_load_error);
    } finally {
      setLoading(false);
    }
  }, [t.reports_load_error]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const hasData = orders.length > 0 || renders.length > 0;

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const report = await db.generateReport({
        strategy,
        brandConcept: brandConcept
          ? { description: brandConcept.description, niche: brandConcept.niche, style: brandConcept.style }
          : null,
        orders: buildReportOrders(orders),
        renders: renders.map(toReportRender),
        language: reportLanguage,
      });
      const entry = await db.saveReportToHistory(report);
      setHistory(prev => [entry, ...prev]);
      setOpenReport(entry);
    } catch (err) {
      console.error(err);
      setGenerateError(t.reports_generate_error);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    setDeleteError('');
    try {
      await db.deleteReportFromHistory(id);
      setHistory(prev => prev.filter(h => h.id !== id));
      setOpenReport(prev => (prev?.id === id ? null : prev));
    } catch (err) {
      console.error(err);
      setDeleteError(t.reports_history_delete_error);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="view-content">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
          {t.reports_title}
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {t.reports_subtitle}
        </p>
      </div>

      {loading ? (
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <RefreshCw size={16} className="loading-spinner" /> {t.reports_loading}
        </div>
      ) : loadError ? (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.5rem', alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{loadError}</span>
          <button onClick={loadAll} className="btn btn-secondary" style={{ width: 'auto', minHeight: '44px', padding: '0 1rem' }}>
            <RefreshCw size={14} /> {t.retry}
          </button>
        </div>
      ) : !hasData ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <FileBarChart size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t.reports_no_data_title}</h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.5, margin: 0 }}>
            {t.reports_no_data_text}
          </p>
          <button onClick={loadAll} className="btn btn-secondary" style={{ width: 'auto', minHeight: '44px', padding: '0 1rem', marginTop: '0.5rem' }}>
            <RefreshCw size={14} /> {t.reports_refresh}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <SectionCard title={t.reports_generate_button} icon={<Sparkles size={15} style={{ color: 'var(--primary)' }} />}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{t.reports_scope_note}</p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn btn-primary"
              style={{ width: 'auto', alignSelf: 'flex-start', minHeight: '44px', padding: '0 1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {generating
                ? <><RefreshCw size={14} className="loading-spinner" /> {t.reports_generating}</>
                : <><Sparkles size={14} /> {t.reports_generate_button}</>}
            </button>
            {generateError && !generating && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: 8,
                background: 'color-mix(in srgb, var(--danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              }}>
                <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <p style={{ fontSize: '0.76rem', color: 'var(--text-primary)', margin: 0, flex: 1 }}>{generateError}</p>
                <button onClick={handleGenerate} className="btn btn-secondary" style={{ width: 'auto', minHeight: '36px', padding: '0 0.7rem', fontSize: '0.72rem' }}>
                  {t.retry}
                </button>
              </div>
            )}
          </SectionCard>

          {openReport && (
            <div className="glass-card" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{t.reports_viewer_title}</h4>
                <button
                  onClick={() => setOpenReport(null)}
                  aria-label={t.cancel}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div>{renderMarkdown(openReport.report)}</div>
            </div>
          )}

          <SectionCard title={t.reports_history_title} icon={<Clock size={15} style={{ color: 'var(--secondary)' }} />}>
            {deleteError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{deleteError}</span>}
            {history.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>{t.reports_history_empty}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {history.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem',
                    background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
                  }}>
                    <span style={{ flex: 1, fontSize: '0.76rem', color: 'var(--text-secondary)', minWidth: '140px' }}>
                      {t.reports_history_generated_label}: {new Date(entry.generatedAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => setOpenReport(entry)}
                      className="btn btn-secondary"
                      style={{ width: 'auto', minHeight: '36px', padding: '0 0.6rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      {t.reports_history_open} <ChevronRight size={12} />
                    </button>
                    {confirmDeleteId === entry.id ? (
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          onClick={() => handleDeleteHistory(entry.id)}
                          className="btn"
                          style={{
                            width: 'auto', minHeight: '36px', padding: '0 0.6rem', fontSize: '0.7rem',
                            background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)', border: '1px solid var(--danger)',
                          }}
                        >
                          {t.confirm_delete}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="btn btn-secondary" style={{ width: 'auto', minHeight: '36px', padding: '0 0.6rem', fontSize: '0.7rem' }}>
                          {t.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        aria-label={t.delete}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
};
