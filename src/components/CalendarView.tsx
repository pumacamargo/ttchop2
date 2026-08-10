import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Clock, Trash2, RefreshCw, Pencil, Copy, Sparkles, Scissors, Layers, Play, Share2 } from 'lucide-react';
import { db } from '../services/databaseService';
import type { Product, Session, Template, ScheduledRender, Render } from '../services/databaseService';
import { useT } from '../context/LanguageContext';

// ── Timezones ────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { label: '🇲🇽 Mexico City', value: 'America/Mexico_City' },
  { label: '🇯🇵 Osaka', value: 'Asia/Tokyo' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function toTzDate(date: Date, tz: string) {
  return new Date(date.toLocaleString('en-US', { timeZone: tz }));
}

function getTodayInTz(tz: string) {
  const now = new Date();
  const tzDate = toTzDate(now, tz);
  return { y: tzDate.getFullYear(), m: tzDate.getMonth(), d: tzDate.getDate() };
}

function scheduledAtUTC(dateStr: string, timeStr: string, tz: string): string {
  // dateStr = 'YYYY-MM-DD', timeStr = 'HH:MM'
  // Strategy: treat the input as UTC, then correct by the actual tz offset using formatToParts.
  // This avoids parsing locale strings with new Date() which is unreliable across browsers.
  const [y, mo, day] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);

  const guess = new Date(Date.UTC(y, mo - 1, day, h, min, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(guess);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
  const tzH   = get('hour') % 24; // hour12:false can return 24 for midnight
  const tzMin = get('minute');
  const tzDay = get('day');
  const tzMo  = get('month');
  const tzY   = get('year');

  // How far off is our guess (in tz) from what we actually want?
  const wantedMs = Date.UTC(y, mo - 1, day, h, min, 0);
  const gotMs    = Date.UTC(tzY, tzMo - 1, tzDay, tzH, tzMin, 0);

  return new Date(guess.getTime() + (wantedMs - gotMs)).toISOString();
}

function formatScheduledTime(isoUtc: string, tz: string): string {
  return new Date(isoUtc).toLocaleString('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
type VideoType = 'collage' | 'overlay' | 'collage+overlay' | 'ai';

type Region = 'mx' | 'jp';

interface NewJobForm {
  type: VideoType;
  region: Region;
  productId: string;
  sessionIds: string[];
  voiceTemplateId: string;
  collageTemplateId: string;
  language: string;
  overlayTemplateId: string;
  aiTemplateId: string;
  model: string;
  extraNotes: string;
  time: string; // HH:MM
}

const EMPTY_FORM: NewJobForm = {
  type: 'collage+overlay',
  region: 'mx',
  productId: '',
  sessionIds: [],
  voiceTemplateId: '',
  collageTemplateId: '',
  language: 'spanish',
  overlayTemplateId: '',
  aiTemplateId: '',
  model: 'veo3',
  extraNotes: '',
  time: '09:00',
};

// ── Render row inside day panel ───────────────────────────────────────────────
function DayRenderRow({ render: r }: { render: Render }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const statusColor = r.status === 'done' ? '#10b981' : r.status === 'failed' ? '#ef4444' : r.status === 'processing' ? '#6366f1' : '#eab308';
  const typeIcon = r.type === 'ai' ? <Sparkles size={9} /> : r.type === 'overlay' ? <Layers size={9} /> : <Scissors size={9} />;
  const typeLabel = r.type === 'ai' ? 'AI' : r.type === 'collage+overlay' ? 'C+O' : r.type === 'overlay' ? 'Overlay' : 'Collage';

  const handleCopy = () => {
    if (!r.videoUrl) return;
    navigator.clipboard.writeText(r.videoUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.12)', borderRadius: '8px', padding: '0.5rem 0.7rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 5px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}>
          {typeIcon} {typeLabel}
        </span>
        <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.productName || '—'}</span>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {new Date(r.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
      </div>
      {r.status === 'processing' && (
        <div style={{ fontSize: '0.65rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={10} className="loading-spinner" /> Rendering…
        </div>
      )}
      {r.status === 'failed' && r.errorMessage && (
        <p style={{ fontSize: '0.65rem', color: '#ef4444', margin: 0 }}>{r.errorMessage}</p>
      )}
      {r.status === 'done' && r.videoUrl && (
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button onClick={() => setExpanded(e => !e)} style={{ flex: 1, padding: '3px 6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: '#06b6d4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <Play size={9} /> {expanded ? 'Hide' : 'Preview'}
          </button>
          <button onClick={handleCopy} style={{ padding: '3px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600, background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(109,59,215,0.07)', border: `1px solid ${copied ? 'rgba(16,185,129,0.35)' : 'rgba(109,59,215,0.18)'}`, color: copied ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Share2 size={9} /> {copied ? '✓' : 'Copy'}
          </button>
        </div>
      )}
      {expanded && r.videoUrl && (
        <video src={r.videoUrl} controls playsInline style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6, background: '#000' }} />
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CalendarView() {
  const t = useT();
  const DAYS_SHORT = t.days_short.split(',');
  const MONTHS = t.months_long.split(',');

  // Timezone — localStorage as fast cache, Firestore as source of truth
  const [tz, setTz] = useState<string>(() =>
    localStorage.getItem('ttchop_calendar_tz') || 'America/Mexico_City'
  );

  useEffect(() => {
    db.getUserPref('calendarTimezone').then(saved => {
      if (saved) setTz(saved);
    });
  }, []);

  // Navigation
  const today = getTodayInTz(tz);
  const [viewYear,  setViewYear]  = useState(today.y);
  const [viewMonth, setViewMonth] = useState(today.m); // 0-indexed

  // Selected day
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // 'YYYY-MM-DD'

  // Data
  const [products,  setProducts]  = useState<Product[]>([]);
  const [sessions,  setSessions]  = useState<Session[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledRender[]>([]);
  const [renders,   setRenders]   = useState<Render[]>([]);

  // Form state
  const [nowStr, setNowStr] = useState('');
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 640);
  const [showForm,      setShowForm]      = useState(false);
  const [editingJobId,  setEditingJobId]  = useState<string | null>(null);
  const [form,          setForm]          = useState<NewJobForm>(EMPTY_FORM);
  const [showDupDay,    setShowDupDay]    = useState(false);
  const [dupSourceDay,  setDupSourceDay]  = useState('');
  const [duplicating,   setDuplicating]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('ttchop_calendar_tz', tz);
    db.setUserPref('calendarTimezone', tz);
    // Update calendar view to match the new timezone's current date
    const newToday = getTodayInTz(tz);
    setViewYear(newToday.y);
    setViewMonth(newToday.m);
  }, [tz]);

  const loadData = useCallback(async () => {
    const [p, s, t, sc, r] = await Promise.all([
      db.getProducts(),
      db.getSessions(),
      db.getTemplates(),
      db.getScheduledRenders(),
      db.getRenders(),
    ]);
    setProducts(p);
    setSessions(s);
    setTemplates(t);
    setScheduled(sc);
    setRenders(r);
  }, []);

  // Auto-poll every 5s while renders are pending/processing
  useEffect(() => {
    const hasPending = renders.some(r => r.status === 'pending' || r.status === 'processing');
    if (!hasPending) return;
    const id = setInterval(() => db.getRenders().then(setRenders), 5000);
    return () => clearInterval(id);
  }, [renders]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth >= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Live clock in selected timezone
  useEffect(() => {
    const update = () => {
      setNowStr(new Date().toLocaleString('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [tz]);

  // ── Calendar grid ──────────────────────────────────────────────────────────
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth,     0).getDate();

  const cells: { dateStr: string | null; day: number; isCurrentMonth: boolean }[] = [];

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = viewMonth - 1 < 0 ? 11 : viewMonth - 1;
    const y = viewMonth - 1 < 0 ? viewYear - 1 : viewYear;
    cells.push({ dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, isCurrentMonth: false });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      isCurrentMonth: true,
    });
  }

  // Next month leading days
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth + 1 > 11 ? 0 : viewMonth + 1;
    const y = viewMonth + 1 > 11 ? viewYear + 1 : viewYear;
    cells.push({ dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, isCurrentMonth: false });
  }

  const todayStr = `${today.y}-${String(today.m + 1).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;

  function isPast(dateStr: string) {
    return dateStr < todayStr;
  }

  function jobsForDay(dateStr: string) {
    return scheduled.filter(s => s.localDate === dateStr);
  }

  function rendersForDay(dateStr: string) {
    return renders.filter(r => {
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(r.createdAt));
      return local === dateStr;
    });
  }

  // ── Derived lists ──────────────────────────────────────────────────────────
  const voiceTemplates    = templates.filter(t => t.type === 'voice');
  const collageTemplates  = templates.filter(t => t.type === 'collage');
  const overlayTemplates  = templates.filter(t => t.type === 'overlay');
  const aiTemplates       = templates.filter(t => t.type === 'aiGen');

  const productSessions = form.productId
    ? sessions.filter(s => s.productIds?.includes(form.productId))
    : sessions;

  // ── Save / Update ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.productId || !selectedDay) return;
    setSaving(true);
    try {
      const utcIso = scheduledAtUTC(selectedDay, form.time, tz);
      const payload = {
        type: form.type,
        scheduledAt: utcIso,
        localDate: selectedDay,
        timezone: tz,
        productId: form.productId,
        productName: products.find(p => p.id === form.productId)?.name || '',
        sessionIds: form.sessionIds,
        voiceTemplateId: form.voiceTemplateId,
        collageTemplateId: form.collageTemplateId,
        language: form.language,
        overlayTemplateId: form.overlayTemplateId,
        aiTemplateId: form.aiTemplateId,
        model: form.model,
        extraNotes: form.extraNotes,
      };
      if (editingJobId) {
        await db.updateScheduledRender(editingJobId, payload);
      } else {
        await db.createScheduledRender({ ...payload, status: 'pending' });
      }
      setShowForm(false);
      setEditingJobId(null);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit job ──────────────────────────────────────────────────────────────
  const jobToForm = (job: ScheduledRender): NewJobForm => {
    const timeStr = new Date(job.scheduledAt).toLocaleString('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).replace(',', '');
    return {
      type: job.type,
      region: job.language === 'japanese' ? 'jp' : 'mx',
      productId: job.productId,
      sessionIds: job.sessionIds || [],
      voiceTemplateId: job.voiceTemplateId || '',
      collageTemplateId: job.collageTemplateId || '',
      language: job.language,
      overlayTemplateId: job.overlayTemplateId || '',
      aiTemplateId: job.aiTemplateId || '',
      model: job.model || 'seedance',
      extraNotes: job.extraNotes || '',
      time: timeStr.slice(0, 5),
    };
  };

  const handleEdit = (job: ScheduledRender) => {
    setForm(jobToForm(job));
    setEditingJobId(job.id);
    setShowForm(true);
  };

  const handleDuplicate = (job: ScheduledRender) => {
    setForm(jobToForm(job));
    setEditingJobId(null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await db.deleteScheduledRender(id);
      await loadData();
    } finally {
      setDeleting(null);
    }
  };

  const dayJobs = selectedDay ? jobsForDay(selectedDay) : [];
  const dayRenders = selectedDay ? rendersForDay(selectedDay) : [];

  // ── Duplicate day ─────────────────────────────────────────────────────────
  const handleDuplicateDay = async () => {
    if (!dupSourceDay || !selectedDay) return;
    const sourceJobs = jobsForDay(dupSourceDay);
    if (sourceJobs.length === 0) return;
    setDuplicating(true);
    try {
      for (const job of sourceJobs) {
        // Keep same HH:MM but on the target day
        const timeStr = new Date(job.scheduledAt).toLocaleString('en-US', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).replace(',', '').slice(0, 5);
        const utcIso = scheduledAtUTC(selectedDay, timeStr, tz);
        await db.createScheduledRender({
          type: job.type,
          scheduledAt: utcIso,
          localDate: selectedDay,
          timezone: tz,
          status: 'pending',
          productId: job.productId,
          productName: job.productName,
          sessionIds: job.sessionIds || [],
          voiceTemplateId: job.voiceTemplateId || '',
          collageTemplateId: job.collageTemplateId || '',
          language: job.language,
          overlayTemplateId: job.overlayTemplateId || '',
          aiTemplateId: job.aiTemplateId || '',
          model: job.model || '',
          extraNotes: job.extraNotes || '',
        });
      }
      setShowDupDay(false);
      setDupSourceDay('');
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setDuplicating(false);
    }
  };

  // ── Day panel JSX (reused in both layouts) ──────────────────────────────
  const dayPanel = selectedDay ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Panel header */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {!showForm && !showDupDay && (<>
            <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); }} className="btn btn-primary"
              style={{ padding: '5px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={12} /> {t.cal_new_video}
            </button>
            <button onClick={() => { setShowDupDay(true); setDupSourceDay(''); }} className="btn btn-secondary"
              style={{ padding: '5px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Copy size={12} /> {t.cal_duplicate_day}
            </button>
          </>)}
          <button onClick={() => { setSelectedDay(null); setShowForm(false); setShowDupDay(false); setEditingJobId(null); setForm(EMPTY_FORM); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Duplicate day picker */}
      {showDupDay && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.06)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{t.cal_copy_plans_from}</span>
          <input
            type="date"
            className="form-input"
            value={dupSourceDay}
            onChange={e => setDupSourceDay(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
          {dupSourceDay && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {jobsForDay(dupSourceDay).length === 0
                ? t.cal_no_plans_day
                : `${jobsForDay(dupSourceDay).length} ${t.cal_plans_found}`}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => { setShowDupDay(false); setDupSourceDay(''); }} className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem' }}>{t.cancel}</button>
            <button
              onClick={handleDuplicateDay}
              disabled={!dupSourceDay || jobsForDay(dupSourceDay).length === 0 || duplicating}
              className="btn btn-primary"
              style={{ flex: 2, fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {duplicating
                ? <><RefreshCw size={13} className="loading-spinner" /> {t.cal_duplicating}</>
                : <><Copy size={13} /> {t.cal_duplicate_day}{dupSourceDay ? ` (${jobsForDay(dupSourceDay).length})` : ''}</>}
            </button>
          </div>
        </div>
      )}

      {/* Existing jobs */}
      {dayJobs.length > 0 && (
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {dayJobs.map(job => (
            <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2px' }}>
                  <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{formatScheduledTime(job.scheduledAt, tz)}</span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                    color: job.type === 'collage+overlay' ? 'var(--accent)' : job.type === 'overlay' ? 'var(--secondary)' : 'var(--primary)' }}>
                    {job.type}
                  </span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', marginLeft: 'auto',
                    color: job.status === 'done' ? 'var(--success)' : job.status === 'failed' ? 'var(--danger)' : job.status === 'running' ? 'var(--secondary)' : '#eab308' }}>
                    {job.status}
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.productName}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                <button onClick={() => handleDuplicate(job)} title={t.cal_duplicate}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                  <Copy size={13} />
                </button>
                {job.status === 'pending' && (<>
                  <button onClick={() => handleEdit(job)} title={t.save}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(job.id)} disabled={deleting === job.id} title={t.delete}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', opacity: deleting === job.id ? 0.5 : 1 }}>
                    {deleting === job.id ? <RefreshCw size={13} className="loading-spinner" /> : <Trash2 size={13} />}
                  </button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {dayJobs.length === 0 && !showForm && dayRenders.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {t.cal_no_videos_day}
        </div>
      )}

      {/* Renders section */}
      {dayRenders.length > 0 && (
        <div style={{ padding: '0.6rem 1rem', borderTop: dayJobs.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
            Renders · {dayRenders.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {dayRenders.map(r => (
              <DayRenderRow key={r.id} render={r} />
            ))}
          </div>
        </div>
      )}

      {/* New / Edit job form */}
      {showForm && (
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: dayJobs.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: editingJobId ? 'var(--accent)' : 'var(--primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {editingJobId ? t.cal_editing_video : t.cal_new_scheduled_video}
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{t.cal_video_type}</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {([
                { t: 'collage+overlay', color: 'var(--accent)',     bg: 'rgba(168,85,247,0.2)'  },
                { t: 'collage',         color: 'var(--primary)',    bg: 'rgba(99,102,241,0.2)'  },
                { t: 'overlay',         color: 'var(--secondary)',  bg: 'rgba(6,182,212,0.2)'   },
                { t: 'ai',              color: '#f59e0b',           bg: 'rgba(245,158,11,0.2)'  },
              ] as { t: VideoType; color: string; bg: string }[]).map(({ t, color, bg }) => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                  flex: 1, minWidth: '60px', padding: '5px 2px', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                  borderRadius: '8px', border: '1px solid', cursor: 'pointer',
                  background: form.type === t ? bg : 'rgba(255,255,255,0.03)',
                  borderColor: form.type === t ? color : 'var(--border)',
                  color: form.type === t ? color : 'var(--text-muted)',
                }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{t.cal_trigger_time} ({tz.split('/')[1]?.replace('_', ' ') || tz})</label>
            <input type="time" className="form-input" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={{ fontSize: '0.85rem' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{t.cal_region}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {([
                { value: 'mx' as Region, label: t.cal_region_mx, lang: 'spanish' },
                { value: 'jp' as Region, label: t.cal_region_jp, lang: 'japanese' },
              ]).map(r => (
                <button key={r.value} onClick={() => setForm(f => ({ ...f, region: r.value, language: r.lang, productId: '', sessionIds: [] }))}
                  style={{
                    flex: 1, padding: '7px 4px', fontSize: '0.78rem', fontWeight: 700,
                    borderRadius: '8px', border: '1px solid', cursor: 'pointer',
                    background: form.region === r.value ? 'rgba(109,59,215,0.25)' : 'rgba(255,255,255,0.03)',
                    borderColor: form.region === r.value ? 'var(--primary)' : 'var(--border)',
                    color: form.region === r.value ? 'var(--primary)' : 'var(--text-muted)',
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{t.cal_product}</label>
            <select className="form-select" value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value, sessionIds: [] }))}>
              <option value="">{t.cal_select_product}</option>
              {products
                .filter(p => !p.region || p.region === form.region)
                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {(form.type === 'collage' || form.type === 'collage+overlay') && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.cal_sessions}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                {productSessions.length === 0
                  ? <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{form.productId ? t.cal_no_sessions_product : t.cal_no_sessions_select}</span>
                  : productSessions.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.sessionIds.includes(s.id)}
                        onChange={e => setForm(f => ({ ...f, sessionIds: e.target.checked ? [...f.sessionIds, s.id] : f.sessionIds.filter(id => id !== s.id) }))} />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{s.name}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{s.videos.length} clips</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
          {(form.type === 'collage' || form.type === 'collage+overlay') && (<>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.collage_voice_label}</label>
              <select className="form-select" value={form.voiceTemplateId} onChange={e => setForm(f => ({ ...f, voiceTemplateId: e.target.value }))}>
                <option value="">{t.cal_select_voice}</option>
                {voiceTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.collage_template_label}</label>
              <select className="form-select" value={form.collageTemplateId} onChange={e => setForm(f => ({ ...f, collageTemplateId: e.target.value }))}>
                <option value="">{t.cal_select_template}</option>
                {collageTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.collage_language_label}</label>
              <select className="form-select" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                <option value="japanese">{t.cal_lang_japanese}</option>
                <option value="spanish">{t.cal_lang_spanish}</option>
                <option value="english">{t.cal_lang_english}</option>
              </select>
            </div>
          </>)}
          {(form.type === 'overlay' || form.type === 'collage+overlay') && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.cal_overlay_template}</label>
              <select className="form-select" value={form.overlayTemplateId} onChange={e => setForm(f => ({ ...f, overlayTemplateId: e.target.value }))}>
                <option value="">{t.cal_default_overlay}</option>
                {overlayTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}
          {form.type === 'ai' && (<>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.cal_ai_template}</label>
              <select className="form-select" value={form.aiTemplateId} onChange={e => setForm(f => ({ ...f, aiTemplateId: e.target.value }))}>
                <option value="">{t.cal_select_template}</option>
                {aiTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.cal_model}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['seedance', 'veo3'] as const).map(m => (
                  <button key={m} onClick={() => setForm(f => ({ ...f, model: m }))} style={{
                    flex: 1, padding: '7px 4px', fontSize: '0.75rem', fontWeight: 700,
                    borderRadius: '8px', border: '1px solid', cursor: 'pointer',
                    background: form.model === m ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.03)',
                    borderColor: form.model === m ? '#f59e0b' : 'var(--border)',
                    color: form.model === m ? '#f59e0b' : 'var(--text-muted)',
                  }}>{m}</button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.cal_extra_notes}</label>
              <input className="form-input" value={form.extraNotes} onChange={e => setForm(f => ({ ...f, extraNotes: e.target.value }))}
                placeholder={t.cal_extra_notes_ph} style={{ fontSize: '0.82rem' }} />
            </div>
          </>)}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => { setShowForm(false); setEditingJobId(null); setForm(EMPTY_FORM); }} className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }}>{t.cancel}</button>
            <button onClick={handleSave} className="btn btn-primary" disabled={!form.productId || saving}
              style={{ flex: 2, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {saving
                ? <><RefreshCw size={14} className="loading-spinner" /> {t.cal_saving}</>
                : editingJobId
                  ? <><Pencil size={14} /> {t.cal_update_video}</>
                  : <><Clock size={14} /> {t.cal_schedule_video}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  // ── Calendar grid JSX ────────────────────────────────────────────────────
  // Note: no aspectRatio on cells — grid fills available height via gridTemplateRows
  const calendarGrid = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 0.5rem 0.5rem', overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flexShrink: 0 }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: 'center', padding: '0.3rem 0', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>
      {/* Day cells — fills remaining height, 6 equal rows */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', gap: '2px' }}>
        {cells.map((cell, i) => {
          const isToday    = cell.dateStr === todayStr;
          const isPastDay  = cell.dateStr ? isPast(cell.dateStr) : false;
          const isSelected = cell.dateStr === selectedDay;
          const jobs = cell.dateStr ? jobsForDay(cell.dateStr) : [];
          const dayRenders = cell.dateStr ? rendersForDay(cell.dateStr) : [];
          return (
            <div key={i} onClick={() => cell.isCurrentMonth && cell.dateStr && setSelectedDay(cell.dateStr)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px', cursor: cell.isCurrentMonth ? 'pointer' : 'default', gap: '2px',
              background: isSelected ? 'var(--primary)' : isToday ? 'rgba(109,59,215,0.25)' : 'transparent',
              border: isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
              opacity: cell.isCurrentMonth ? 1 : 0.2, transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: isToday ? 700 : 500,
                color: isSelected ? '#fff' : isPastDay && !isToday ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {cell.day}
              </span>
              {/* Scheduled job dots (plan) */}
              {jobs.length > 0 && (
                <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                  {jobs.slice(0, 3).map((j, ji) => (
                    <div key={ji} style={{ width: '4px', height: '4px', borderRadius: '50%',
                      background: isSelected ? 'rgba(255,255,255,0.7)' : j.status === 'done' ? 'var(--success)' : j.status === 'failed' ? 'var(--danger)' : j.status === 'running' ? 'var(--secondary)' : '#eab308' }} />
                  ))}
                </div>
              )}
              {/* Render dots (actual output) — slightly smaller, different color */}
              {dayRenders.length > 0 && (
                <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                  {dayRenders.slice(0, 3).map((r, ri) => (
                    <div key={ri} style={{ width: '3px', height: '3px', borderRadius: '50%',
                      background: isSelected ? 'rgba(255,255,255,0.5)' : r.status === 'done' ? '#06b6d4' : r.status === 'failed' ? 'var(--danger)' : 'rgba(6,182,212,0.5)' }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Timezone bar ─────────────────────────────────────────────────── */}
      <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {TIMEZONES.map(z => (
            <button key={z.value} onClick={() => setTz(z.value)} style={{
              padding: '4px 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, border: '1px solid',
              background: tz === z.value ? 'rgba(109,59,215,0.25)' : 'rgba(255,255,255,0.03)',
              borderColor: tz === z.value ? 'var(--primary)' : 'var(--border)',
              color: tz === z.value ? 'var(--primary)' : 'var(--text-muted)', transition: 'all 0.15s',
            }}>{z.label}</button>
          ))}
        </div>
        {nowStr && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: 'auto' }}>{nowStr}</span>}
      </div>

      {/* ── Main area: calendar + optional side panel ─────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: isWide && selectedDay ? 'row' : 'column' }}>

        {/* Calendar column — fills height in column mode, fixed width in row mode */}
        <div style={{
          ...(isWide && selectedDay ? { flexShrink: 0, width: '55%' } : { flex: 1, width: '100%' }),
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Month navigation */}
          <div style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{MONTHS[viewMonth]}</span>
              <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '2px 6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                {Array.from({ length: 10 }, (_, i) => today.y - 1 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={18} />
            </button>
          </div>
          {/* Grid */}
          {calendarGrid}
        </div>

        {/* Day panel — side on wide, bottom on narrow */}
        {selectedDay && (
          <div style={{
            flex: 1,
            overflow: 'auto',
            borderLeft: isWide ? '1px solid var(--border)' : undefined,
            borderTop: !isWide ? '1px solid var(--border)' : undefined,
            background: 'rgba(17,24,39,0.6)',
          }}>
            {dayPanel}
          </div>
        )}
      </div>
    </div>
  );
}
