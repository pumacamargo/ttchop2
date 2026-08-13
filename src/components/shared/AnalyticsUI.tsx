// Small presentational pieces shared between AnalyticsView and DashboardView — both render
// the same shape of data (currency amounts, category bars, settlement splits) and should look
// like one system rather than two hand-rolled copies.
import React, { useRef, useState } from 'react';
import type { DailyPerformanceBucket, BucketGranularity, PeriodHistoryPoint } from '../../utils/analytics';
import { formatBucketLabel } from '../../utils/analytics';

export const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="glass-card" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
    <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h4>
    {children}
  </div>
);

export const StatTile: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
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
export const BarRow: React.FC<{ label: string; pct: number; color: string; valueLabel: string }> = ({ label, pct, color, valueLabel }) => {
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

export const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
    {label}
  </span>
);

/** Settlement rate as a 2-segment stacked bar (status colors: success = settled, warning = the rest). */
export const SettlementBar: React.FC<{ settledPct: number; settledLabel: string; otherLabel: string }> = ({ settledPct, settledLabel, otherLabel }) => {
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

/** Pill-button period selector (week/month/year/all), identical look on both views. */
export const PeriodSelector: React.FC<{
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}> = ({ value, options, onChange }) => (
  <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '2px' }}>
    {options.map(opt => (
      <button
        key={opt.key}
        onClick={() => onChange(opt.key)}
        style={{
          padding: '0.35rem 0.9rem', borderRadius: '999px', minHeight: '44px',
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em', cursor: 'pointer', whiteSpace: 'nowrap',
          background: value === opt.key ? 'var(--gradient)' : 'var(--bg-card)',
          color: value === opt.key ? '#fff' : 'var(--text-secondary)',
          border: value === opt.key ? '1px solid transparent' : '1px solid var(--border)',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

/** Pill-button currency selector, shown only when the imported data spans more than one currency. */
export const CurrencySelector: React.FC<{
  currencies: string[];
  selected: string;
  onSelect: (currency: string) => void;
  note: React.ReactNode;
}> = ({ currencies, selected, onSelect, note }) => {
  if (currencies.length <= 1) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
        {note}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {currencies.map(c => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            style={{
              padding: '0.3rem 0.9rem', borderRadius: '999px', minHeight: '44px', fontSize: '0.7rem', fontWeight: 700,
              cursor: 'pointer', background: selected === c ? 'var(--secondary-glow)' : 'var(--bg-card)',
              color: selected === c ? 'var(--secondary)' : 'var(--text-secondary)',
              border: selected === c ? '1px solid var(--secondary-glow)' : '1px solid var(--border)',
            }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Gráfica diaria de dos series (Analytics y Dashboard) ────────────────────
// Dos series diarias — unidades vendidas y videos publicados. Ambas son CONTEOS, así que
// comparten una sola escala y caben en una gráfica: no hay problema de doble eje aquí.
export const DailyPerformanceChart: React.FC<{
  buckets: DailyPerformanceBucket[];
  granularity: BucketGranularity;
  emptyText: string;
  unitsLabel: string;
  videosLabel: string;
}> = ({ buckets, granularity, emptyText, unitsLabel, videosLabel }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (buckets.length === 0) {
    return <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{emptyText}</p>;
  }

  const H = 150;
  const VB_W = 100;
  const VB_H = 400;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 20;
  const n = buckets.length;
  const usableH = VB_H - PAD_TOP - PAD_BOTTOM;
  const maxVal = Math.max(1, ...buckets.map(b => Math.max(b.unitsSold, b.videoCount)));

  const pointsFor = (pick: (b: DailyPerformanceBucket) => number) =>
    buckets.map((b, i) => ({
      x: n === 1 ? VB_W / 2 : (i / (n - 1)) * VB_W,
      y: PAD_TOP + usableH - (pick(b) / maxVal) * usableH,
    }));

  const pathOf = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  const unitPts = pointsFor(b => b.unitsSold);
  const videoPts = pointsFor(b => b.videoCount);
  const baselineY = VB_H - PAD_BOTTOM;

  const updateHover = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(frac * (n - 1)));
  };

  const hovered = hoverIndex !== null ? buckets[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? unitPts[hoverIndex].x : 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <LegendDot color="var(--secondary)" label={unitsLabel} />
        <LegendDot color="var(--accent)" label={videosLabel} />
      </div>

      <div
        ref={containerRef}
        role="img"
        aria-label={`${unitsLabel} / ${videosLabel}`}
        tabIndex={0}
        onPointerMove={e => updateHover(e.clientX)}
        onPointerDown={e => updateHover(e.clientX)}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setHoverIndex(i => Math.max(0, (i ?? 0) - 1)); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); setHoverIndex(i => Math.min(n - 1, (i ?? -1) + 1)); }
          else if (e.key === 'Escape') setHoverIndex(null);
        }}
        style={{ position: 'relative', touchAction: 'pan-y', outline: 'none', paddingLeft: '1.6rem' }}
      >
        {/* Referencias de escala. Van en HTML y no como <text> del SVG porque el viewBox se
            estira con preserveAspectRatio="none" y deformaría cualquier tipografía dentro. */}
        <span style={{
          position: 'absolute', left: 0, top: `${(PAD_TOP / VB_H) * H - 6}px`,
          fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1,
        }}>{maxVal.toLocaleString()}</span>
        <span style={{
          position: 'absolute', left: 0, top: `${(baselineY / VB_H) * H - 5}px`,
          fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1,
        }}>0</span>

        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }} aria-hidden="true">
          {/* Guía superior del máximo, tenue: da referencia sin competir con los datos */}
          <line x1={0} y1={PAD_TOP} x2={VB_W} y2={PAD_TOP} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          {/* Línea del cero: sólida y más marcada que la guía, es la base de lectura */}
          <line x1={0} y1={baselineY} x2={VB_W} y2={baselineY} stroke="var(--text-muted)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.55} />
          {hoverIndex !== null && (
            <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={baselineY} stroke="var(--text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />
          )}
          <path d={pathOf(unitPts)} fill="none" stroke="var(--secondary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={pathOf(videoPts)} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          <span>{formatBucketLabel(buckets[0].date, granularity)}</span>
          <span>{formatBucketLabel(buckets[n - 1].date, granularity)}</span>
        </div>

        {hovered && (
          <div style={{
            marginTop: '0.4rem', padding: '0.4rem 0.6rem', borderRadius: 8,
            background: 'var(--bg-card-hover)', border: '1px solid var(--border)',
            fontSize: '0.72rem', color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>{formatBucketLabel(hovered.date, granularity)}</strong>
            {' · '}<span style={{ color: 'var(--secondary)' }}>{unitsLabel}: {hovered.unitsSold}</span>
            {' · '}<span style={{ color: 'var(--accent)' }}>{videosLabel}: {hovered.videoCount}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Historial por bloques de período ────────────────────────────────────────
// Una sola línea donde cada punto es UN período completo agregado: el de la derecha es el
// período en curso, el de su izquierda son los 7 días (o 30 días / 6 meses) previos, y así
// hacia atrás. Puntos marcados para que cada bloque se lea como un valor discreto, no como
// una curva continua — porque eso es lo que son.
export const PeriodHistoryChart: React.FC<{
  points: PeriodHistoryPoint[];
  blockLabel: string;
  currentLabel: string;
  deltaLabel: string;
  emptyText: string;
}> = ({ points, blockLabel, currentLabel, deltaLabel, emptyText }) => {
  if (points.length === 0 || points.every(p => p.unitsSold === 0)) {
    return <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0 }}>{emptyText}</p>;
  }

  const H = 140;
  const VB_W = 100;
  const VB_H = 340;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 20;
  const n = points.length;
  const usableH = VB_H - PAD_TOP - PAD_BOTTOM;
  const maxVal = Math.max(1, ...points.map(p => p.unitsSold));
  const baselineY = VB_H - PAD_BOTTOM;

  const xy = points.map((p, i) => ({
    x: n === 1 ? VB_W / 2 : (i / (n - 1)) * VB_W,
    y: PAD_TOP + usableH - (p.unitsSold / maxVal) * usableH,
  }));
  const path = xy.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');

  const current = points[n - 1];
  const previous = n > 1 ? points[n - 2] : null;
  const deltaPct = previous && previous.unitsSold > 0
    ? ((current.unitsSold - previous.unitsSold) / previous.unitsSold) * 100
    : null;
  const deltaColor = deltaPct === null ? 'var(--text-muted)'
    : deltaPct >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
        <span style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          {current.unitsSold.toLocaleString()}
        </span>
        {deltaPct !== null && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: deltaColor }}>
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
          </span>
        )}
        {previous && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {deltaLabel} ({previous.unitsSold.toLocaleString()})
          </span>
        )}
      </div>

      <div style={{ position: 'relative', paddingLeft: '1.7rem' }}>
        {/* Escala como overlay HTML: el SVG usa preserveAspectRatio="none" y deformaría el texto. */}
        <span style={{ position: 'absolute', left: 0, top: `${(PAD_TOP / VB_H) * H - 6}px`, fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1 }}>
          {maxVal.toLocaleString()}
        </span>
        <span style={{ position: 'absolute', left: 0, top: `${(baselineY / VB_H) * H - 5}px`, fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1 }}>0</span>

        <div style={{ position: 'relative', height: H }}>
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }} aria-hidden="true">
            <line x1={0} y1={PAD_TOP} x2={VB_W} y2={PAD_TOP} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={baselineY} x2={VB_W} y2={baselineY} stroke="var(--text-muted)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.55} />
            <path d={path} fill="none" stroke="var(--secondary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>

          {/* Los puntos van como overlay HTML, no como <circle>: dentro del SVG estirado
              (preserveAspectRatio="none") se deforman en elipses al ensanchar la pantalla. */}
          {xy.map((q, i) => {
            const size = i === n - 1 ? 9 : 7;
            return (
              <span
                key={points[i].offset}
                style={{
                  position: 'absolute',
                  left: `${(q.x / VB_W) * 100}%`,
                  top: `${(q.y / VB_H) * H}px`,
                  width: size, height: size,
                  marginLeft: -size / 2, marginTop: -size / 2,
                  borderRadius: '50%',
                  background: i === n - 1 ? 'var(--secondary)' : 'var(--bg-space)',
                  border: '1.5px solid var(--secondary)',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}
              />
            );
          })}
        </div>

        {/* Etiquetas del eje X: cuántos bloques atrás está cada punto. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
          {points.map((p, i) => (
            <span
              key={p.offset}
              style={{
                fontSize: '0.58rem', lineHeight: 1,
                color: i === n - 1 ? 'var(--secondary)' : 'var(--text-muted)',
                fontWeight: i === n - 1 ? 700 : 500,
                textAlign: 'center', flex: 1, minWidth: 0,
              }}
            >
              {i === n - 1 ? currentLabel : `-${p.offset}`}
            </span>
          ))}
        </div>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.62rem', color: 'var(--text-muted)' }}>{blockLabel}</p>
      </div>
    </div>
  );
};
