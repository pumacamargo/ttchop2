// Small presentational pieces shared between AnalyticsView and DashboardView — both render
// the same shape of data (currency amounts, category bars, settlement splits) and should look
// like one system rather than two hand-rolled copies.
import React from 'react';

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
