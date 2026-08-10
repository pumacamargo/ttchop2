import React from 'react';
import { FileBarChart } from 'lucide-react';
import { useT } from '../context/LanguageContext';

export const ReportsView: React.FC = () => {
  const t = useT();

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

      <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <FileBarChart size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
        <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>{t.reports_empty_title}</h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.5, margin: 0 }}>
          {t.reports_empty_text}
        </p>
      </div>
    </div>
  );
};
