import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, getVisibleForContainer, isGeneralContainer } from '../services/databaseService';
import type { Render } from '../services/databaseService';
import {
  ChevronLeft, ChevronRight, RefreshCw,
  Sparkles, Scissors, Layers, Play, Share2,
} from 'lucide-react';
import { useContainer } from '../context/ContainerContext';
import { useT } from '../context/LanguageContext';
import { MoveToContainerMenu } from './MoveToContainerMenu';

// ── Week helpers ──────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayKey(date: Date): string {
  // YYYY-MM-DD in local time
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Small type + status badges ────────────────────────────────────────────────

const TypeChip: React.FC<{ type: Render['type'] }> = ({ type }) => {
  const cfg = {
    ai:              { bg: 'rgba(168,85,247,0.18)', color: '#a855f7', icon: <Sparkles size={9} />, label: 'AI' },
    overlay:         { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b', icon: <Layers size={9} />,   label: 'Overlay' },
    collage:         { bg: 'rgba(6,182,212,0.18)',  color: '#06b6d4', icon: <Scissors size={9} />, label: 'Collage' },
    'collage+overlay':{ bg: 'rgba(6,182,212,0.18)',  color: '#06b6d4', icon: <Scissors size={9} />, label: 'C+O' },
  }[type] ?? { bg: 'rgba(255,255,255,0.1)', color: '#fff', icon: null, label: type };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 6px', borderRadius: 999, fontSize: '0.63rem', fontWeight: 700,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

const StatusDot: React.FC<{ status: Render['status'] }> = ({ status }) => {
  const color = {
    pending:    '#eab308',
    processing: '#6366f1',
    done:       '#10b981',
    failed:     '#ef4444',
  }[status] ?? '#888';
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', background: color,
      display: 'inline-block', flexShrink: 0,
      boxShadow: status === 'processing' ? `0 0 6px ${color}` : 'none',
    }} />
  );
};

// ── Compact render row ────────────────────────────────────────────────────────

const WeekRenderCard: React.FC<{ render: Render; productAccountId: string | null; onMoved: () => void }> = ({ render, productAccountId, onMoved }) => {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!render.videoUrl) return;
    navigator.clipboard.writeText(render.videoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      padding: '0.6rem 0.8rem',
      display: 'flex', flexDirection: 'column', gap: '0.45rem',
    }}>
      {/* Row: dot · type · name · time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <StatusDot status={render.status} />
        <TypeChip type={render.type} />
        <span style={{
          flex: 1, fontSize: '0.82rem', fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {render.productName || '—'}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {new Date(render.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
        <MoveToContainerMenu
          currentAccountId={render.accountId}
          onMove={target => db.moveRenderToContainer(render.id, target)}
          onMoved={onMoved}
          itemLabel={t.move_render_item_label}
          ariaLabel={t.move_container_action_label}
          getWarning={target => (
            !isGeneralContainer(productAccountId) && productAccountId !== (target || null)
              ? t.move_container_product_warning
              : null
          )}
        />
      </div>

      {/* Actions for done renders */}
      {render.status === 'done' && render.videoUrl && (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              flex: 1, padding: '4px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
              background: expanded ? 'rgba(6,182,212,0.15)' : 'rgba(6,182,212,0.07)',
              border: '1px solid rgba(6,182,212,0.22)', color: 'var(--secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <Play size={10} /> {expanded ? 'Hide' : 'Preview'}
          </button>
          <button
            onClick={handleCopy}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
              background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(109,59,215,0.07)',
              border: `1px solid ${copied ? 'rgba(16,185,129,0.35)' : 'rgba(109,59,215,0.2)'}`,
              color: copied ? '#10b981' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Share2 size={10} /> {copied ? '✓' : 'Copy'}
          </button>
        </div>
      )}

      {/* Processing indicator */}
      {render.status === 'processing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--primary)' }}>
          <RefreshCw size={11} className="loading-spinner" /> Rendering…
        </div>
      )}

      {/* Error message */}
      {render.status === 'failed' && render.errorMessage && (
        <p style={{ fontSize: '0.68rem', color: '#ef4444', margin: 0, wordBreak: 'break-word' }}>
          {render.errorMessage}
        </p>
      )}

      {/* Inline video preview */}
      {expanded && render.videoUrl && (
        <video
          src={render.videoUrl}
          controls
          playsInline
          style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 8, background: '#000' }}
        />
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const WeeklyRendersView: React.FC = () => {
  const { activeAccountId } = useContainer();
  const [allRenders, setAllRenders] = useState<Render[]>([]);
  // Products aren't shown here, only fetched to look up each render's product's own container —
  // that's what lets MoveToContainerMenu warn when a render is about to move somewhere its
  // (denormalized) product won't be visible from. See getWarning below.
  const [productAccountById, setProductAccountById] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [data, products] = await Promise.all([db.getRenders(), db.getProducts()]);
    setAllRenders(data);
    setProductAccountById(new Map(products.map(p => [p.id, p.accountId ?? null])));
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // getRenders() isn't container-filtered server side — re-derive on activeAccountId change
  // instead of re-fetching (same pattern as ProductsView/SessionsView).
  const renders = useMemo(() => getVisibleForContainer(allRenders, activeAccountId), [allRenders, activeAccountId]);

  useEffect(() => {
    const hasPending = renders.some(r => r.status === 'pending' || r.status === 'processing');
    if (!hasPending) return;
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, [renders, load]);

  // Group renders by local date key
  const rendersByDay = useMemo(() => {
    const map: Record<string, Render[]> = {};
    renders.forEach(r => {
      const key = dayKey(new Date(r.createdAt));
      (map[key] ??= []).push(r);
    });
    return map;
  }, [renders]);

  const weekEnd = addDays(weekStart, 6);
  const today = dayKey(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const weekRenderCount = days.reduce((acc, d) => acc + (rendersByDay[dayKey(d)]?.length ?? 0), 0);

  const weekLabel = (() => {
    const s = weekStart, e = weekEnd;
    if (s.getMonth() === e.getMonth()) {
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  return (
    <div className="view-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)', margin: 0 }}>
            Renders
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
            {renders.length} total · {weekRenderCount} esta semana
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 4, marginTop: 4 }}
        >
          <RefreshCw size={16} className={loading ? 'loading-spinner' : ''} />
        </button>
      </div>

      {/* Week navigator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        marginBottom: '1.25rem',
        background: 'rgba(109,59,215,0.06)',
        border: '1px solid rgba(109,59,215,0.15)',
        borderRadius: 10, padding: '0.5rem 0.75rem',
      }}>
        <button
          onClick={() => setWeekStart(d => addDays(d, -7))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {weekLabel}
        </span>
        <button
          onClick={() => setWeekStart(d => addDays(d, 7))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={22} className="loading-spinner" style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando renders…</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {days.map(day => {
            const key = dayKey(day);
            const dayRenders = rendersByDay[key] ?? [];
            const isToday = key === today;
            // day.getDay(): 0=Sun,1=Mon...6=Sat → map to Mon-first index
            const dayIdx = day.getDay() === 0 ? 6 : day.getDay() - 1;

            return (
              <div key={key} style={{ marginBottom: '0.6rem' }}>
                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                    color: isToday ? 'var(--primary)' : 'var(--text-muted)',
                    width: 30,
                  }}>
                    {DAY_NAMES[dayIdx]}
                  </span>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.78rem', fontWeight: 700,
                    background: isToday ? 'var(--primary)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}>
                    {day.getDate()}
                  </span>
                  {dayRenders.length > 0 && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 2 }}>
                      {dayRenders.length} render{dayRenders.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>

                {/* Renders for this day */}
                {dayRenders.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingLeft: '0.5rem' }}>
                    {dayRenders.map(r => (
                      <WeekRenderCard
                        key={r.id}
                        render={r}
                        productAccountId={productAccountById.get(r.productId) ?? null}
                        onMoved={() => load(true)}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ paddingLeft: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.1)' }}>—</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
