import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown, ChevronUp, Save, RefreshCw, CheckCircle2, AlertTriangle, Wand2, Trash2,
} from 'lucide-react';
import { db } from '../services/databaseService';
import type { Product, Template, Session, ScheduledRender, ScheduledRenderType } from '../services/databaseService';
import { scheduledAtUTC } from '../utils/calendarTime';
import { useT } from '../context/LanguageContext';

const HORIZON_OPTIONS = [7, 14, 30];
const VALID_TYPES: ScheduledRenderType[] = ['collage', 'overlay', 'collage+overlay', 'ai'];

// ── Proposed job (validated, ready to render/accept) ────────────────────────
interface ProposedJob {
  id: string; // client-only, stable for the review list — never sent to Firestore
  localDate: string;
  time: string;
  productId: string;
  type: ScheduledRenderType;
  voiceTemplateId: string;
  collageTemplateId: string;
  aiTemplateId: string;
  overlayTemplateId: string;
  language: string;
  extraNotes: string;
}

function isLocalDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Validates one raw job from the LLM response. Returns null if it should be discarded. */
function validateJob(
  raw: unknown,
  productIds: Set<string>,
  todayStr: string,
  maxDateStr: string,
  keySeed: number
): ProposedJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  if (!isLocalDate(j.localDate)) return null;
  if (j.localDate < todayStr || j.localDate > maxDateStr) return null;
  if (typeof j.productId !== 'string' || !productIds.has(j.productId)) return null;
  if (typeof j.type !== 'string' || !VALID_TYPES.includes(j.type as ScheduledRenderType)) return null;
  return {
    id: `${j.localDate}-${j.productId}-${keySeed}`,
    localDate: j.localDate,
    time: isTime(j.time) ? j.time : '09:00',
    productId: j.productId,
    type: j.type as ScheduledRenderType,
    voiceTemplateId: asString(j.voiceTemplateId),
    collageTemplateId: asString(j.collageTemplateId),
    aiTemplateId: asString(j.aiTemplateId),
    overlayTemplateId: asString(j.overlayTemplateId),
    language: asString(j.language) || 'spanish',
    extraNotes: asString(j.extraNotes),
  };
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

interface CalendarStrategyPanelProps {
  tz: string;
  todayStr: string;
  products: Product[];
  templates: Template[];
  sessions: Session[];
  scheduled: ScheduledRender[];
  onAccepted: () => void | Promise<void>;
}

export function CalendarStrategyPanel({ tz, todayStr, products, templates, sessions, scheduled, onAccepted }: CalendarStrategyPanelProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  // ── Strategy text ──────────────────────────────────────────────────────
  const [strategyText, setStrategyText] = useState('');
  const [strategyLoading, setStrategyLoading] = useState(true);
  const [strategyLoadError, setStrategyLoadError] = useState('');
  const [strategySaving, setStrategySaving] = useState(false);
  const [strategySaveError, setStrategySaveError] = useState('');
  const [strategySavedAt, setStrategySavedAt] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const loadStrategy = useCallback(async () => {
    setStrategyLoading(true);
    setStrategyLoadError('');
    try {
      const data = await db.getCalendarStrategy();
      setStrategyText(data?.strategy || '');
      setStrategySavedAt(data?.updatedAt || null);
    } catch (err) {
      console.error(err);
      setStrategyLoadError(t.cal_strategy_load_error);
    } finally {
      setStrategyLoading(false);
    }
  }, [t.cal_strategy_load_error]);

  useEffect(() => { loadStrategy(); }, [loadStrategy]);

  // Feedback pill auto-hides after a few seconds; cleared on unmount to avoid a stray setState.
  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(id);
  }, [justSaved]);

  const handleSaveStrategy = async () => {
    setStrategySaving(true);
    setStrategySaveError('');
    try {
      await db.saveCalendarStrategy(strategyText);
      setStrategySavedAt(new Date().toISOString());
      setJustSaved(true);
    } catch (err) {
      console.error(err);
      setStrategySaveError(t.cal_strategy_save_error);
    } finally {
      setStrategySaving(false);
    }
  };

  // ── Populate ───────────────────────────────────────────────────────────
  const [horizonDays, setHorizonDays] = useState(14);
  const [populating, setPopulating] = useState(false);
  const [populateError, setPopulateError] = useState('');
  const [proposals, setProposals] = useState<ProposedJob[]>([]);
  const [reasoning, setReasoning] = useState('');
  const [discardedInvalid, setDiscardedInvalid] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [acceptedMsg, setAcceptedMsg] = useState('');

  const handlePopulate = async () => {
    setPopulating(true);
    setPopulateError('');
    setAcceptError('');
    setAcceptedMsg('');
    setProposals([]);
    setReasoning('');
    setDiscardedInvalid(0);
    try {
      const raw = await db.populateCalendar({
        strategy: strategyText,
        timezone: tz,
        horizonDays,
        products: products.map(p => ({ id: p.id, name: p.name, description: p.description, region: p.region || '' })),
        templates: templates.map(tpl => ({ id: tpl.id, type: tpl.type, title: tpl.title })),
        existingJobs: scheduled.map(s => ({ localDate: s.localDate, productId: s.productId })),
      });

      if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>).jobs)) {
        throw new Error('Unexpected /calendar/populate response shape');
      }
      const data = raw as { jobs: unknown[]; reasoning?: unknown };
      const productIds = new Set(products.map(p => p.id));
      const maxDateStr = addDaysToDateStr(todayStr, horizonDays);

      const valid: ProposedJob[] = [];
      let discarded = 0;
      data.jobs.forEach((jobRaw, idx) => {
        const job = validateJob(jobRaw, productIds, todayStr, maxDateStr, idx);
        if (job) valid.push(job); else discarded++;
      });

      setProposals(valid);
      setDiscardedInvalid(discarded);
      setReasoning(typeof data.reasoning === 'string' ? data.reasoning : '');
    } catch (err) {
      // Any failure mode (network error, non-OK status, unparseable/unexpected JSON) — the
      // /calendar/populate endpoint doesn't exist on the server yet, so this is expected today.
      console.error(err);
      setPopulateError(t.cal_populate_error_unavailable);
    } finally {
      setPopulating(false);
    }
  };

  const handleDiscardOne = (id: string) => setProposals(prev => prev.filter(p => p.id !== id));

  const handleDiscardAll = () => {
    setProposals([]);
    setReasoning('');
    setDiscardedInvalid(0);
  };

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError('');
    try {
      for (const p of proposals) {
        const productName = products.find(pr => pr.id === p.productId)?.name || '';
        // El LLM propone qué y cuándo, pero no de qué clips sale el video. Un job de collage sin
        // sessionIds falla al renderizar, así que aquí se autollenan con las sesiones del producto.
        // Los de tipo 'ai' generan el video desde cero y no necesitan clips.
        const sessionIds = p.type === 'ai'
          ? []
          : sessions.filter(s => s.productIds?.includes(p.productId)).map(s => s.id);
        await db.createScheduledRender({
          type: p.type,
          scheduledAt: scheduledAtUTC(p.localDate, p.time, tz),
          localDate: p.localDate,
          timezone: tz,
          status: 'pending',
          productId: p.productId,
          productName,
          sessionIds,
          voiceTemplateId: p.voiceTemplateId,
          collageTemplateId: p.collageTemplateId,
          language: p.language,
          overlayTemplateId: p.overlayTemplateId,
          aiTemplateId: p.aiTemplateId,
          extraNotes: p.extraNotes,
        });
      }
      setAcceptedMsg(t.cal_populate_accepted.replace('{count}', String(proposals.length)));
      setProposals([]);
      setReasoning('');
      setDiscardedInvalid(0);
      await onAccepted();
    } catch (err) {
      console.error(err);
      setAcceptError(t.cal_populate_accept_error);
    } finally {
      setAccepting(false);
    }
  };

  const canPopulate = strategyText.trim().length > 0 && products.length > 0;

  return (
    <div className="glass-card" style={{ margin: '0.6rem 1rem', padding: 0, overflow: 'hidden', flexShrink: 0 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={{
          width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          <Wand2 size={15} style={{ color: 'var(--primary)' }} /> {t.cal_strategy_title}
        </span>
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Strategy textarea ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>{t.cal_strategy_hint}</p>

            {strategyLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '0.5rem 0' }}>
                <RefreshCw size={14} className="loading-spinner" /> {t.cal_strategy_loading}
              </div>
            ) : strategyLoadError ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{strategyLoadError}</span>
                <button onClick={loadStrategy} className="btn btn-secondary" style={{ fontSize: '0.75rem', minHeight: '40px', padding: '0 0.9rem', width: 'auto' }}>
                  <RefreshCw size={13} /> {t.retry}
                </button>
              </div>
            ) : (
              <>
                <textarea
                  className="form-textarea"
                  value={strategyText}
                  onChange={e => setStrategyText(e.target.value)}
                  placeholder={t.cal_strategy_placeholder}
                  rows={6}
                  style={{ fontSize: '0.85rem', minHeight: '140px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleSaveStrategy}
                    disabled={strategySaving}
                    className="btn btn-primary"
                    style={{ minHeight: '44px', padding: '0 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'auto' }}
                  >
                    {strategySaving
                      ? <><RefreshCw size={14} className="loading-spinner" /> {t.cal_strategy_saving}</>
                      : <><Save size={14} /> {t.cal_strategy_save}</>}
                  </button>
                  {justSaved && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={13} /> {t.cal_strategy_saved}
                    </span>
                  )}
                  {strategySavedAt && !justSaved && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {t.cal_strategy_last_saved}: {new Date(strategySavedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {strategySaveError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{strategySaveError}</span>}
              </>
            )}
          </div>

          {/* ── Populate ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', borderTop: '1px solid var(--border)', paddingTop: '0.9rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.cal_populate_title}</span>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0 }}>{t.cal_populate_hint}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.cal_populate_horizon}</span>
              {HORIZON_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setHorizonDays(d)}
                  disabled={populating}
                  style={{
                    padding: '4px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                    border: '1px solid', minHeight: '36px',
                    background: horizonDays === d ? 'var(--primary-glow)' : 'var(--bg-input)',
                    borderColor: horizonDays === d ? 'var(--primary)' : 'var(--border)',
                    color: horizonDays === d ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  {t.cal_populate_horizon_days.replace('{count}', String(d))}
                </button>
              ))}
            </div>

            {proposals.length === 0 && !populating && (
              <>
                <button
                  onClick={handlePopulate}
                  disabled={!canPopulate}
                  className="btn btn-primary"
                  style={{ minHeight: '44px', padding: '0 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: 'auto', alignSelf: 'flex-start' }}
                >
                  <Wand2 size={14} /> {t.cal_populate_button}
                </button>
                {!strategyText.trim() ? (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.cal_populate_needs_strategy}</span>
                ) : products.length === 0 ? (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.cal_populate_needs_products}</span>
                ) : null}
              </>
            )}

            {populating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.78rem', padding: '0.4rem 0' }}>
                <RefreshCw size={14} className="loading-spinner" /> {t.cal_populate_loading}
              </div>
            )}

            {populateError && !populating && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: 8,
                background: 'color-mix(in srgb, var(--warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 25%, transparent)',
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)' }}>{populateError}</span>
                </div>
                <button onClick={handlePopulate} className="btn btn-secondary" style={{ minHeight: '40px', padding: '0 0.9rem', fontSize: '0.75rem', width: 'auto', alignSelf: 'flex-start' }}>
                  <RefreshCw size={13} /> {t.retry}
                </button>
              </div>
            )}

            {acceptedMsg && proposals.length === 0 && !populating && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--success)', fontSize: '0.78rem' }}>
                <CheckCircle2 size={15} /> {acceptedMsg}
              </div>
            )}

            {proposals.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {reasoning && (
                  <p style={{
                    fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic',
                    background: 'var(--bg-input)', padding: '0.5rem 0.7rem', borderRadius: 8,
                  }}>
                    {reasoning}
                  </p>
                )}
                {discardedInvalid > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--warning)' }}>
                    {t.cal_populate_discarded_invalid.replace('{count}', String(discardedInvalid))}
                  </span>
                )}
                {acceptError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{acceptError}</span>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }}>
                  {proposals.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem',
                      background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <span>{p.localDate}</span><span>·</span><span>{p.time}</span>
                          <span style={{ marginLeft: 'auto', textTransform: 'uppercase', fontWeight: 700, color: 'var(--secondary)' }}>{p.type}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {products.find(pr => pr.id === p.productId)?.name || p.productId}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDiscardOne(p.id)}
                        title={t.cal_populate_discard_one}
                        aria-label={t.cal_populate_discard_one}
                        style={{
                          background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer',
                          padding: '6px', display: 'flex', alignItems: 'center', minWidth: '36px', minHeight: '36px',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleDiscardAll} disabled={accepting} className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', minHeight: '44px' }}>
                    {t.cal_populate_discard_all}
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={accepting || proposals.length === 0}
                    className="btn btn-primary"
                    style={{ flex: 2, fontSize: '0.78rem', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    {accepting
                      ? <><RefreshCw size={14} className="loading-spinner" /> {t.cal_populate_accepting}</>
                      : <><CheckCircle2 size={14} /> {t.cal_populate_accept}</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
