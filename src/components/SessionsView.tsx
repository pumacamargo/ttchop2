import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../services/databaseService';
import type { Product, Session } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { SessionsPanel } from './SessionsPanel';
import { SessionDetailModal } from './SessionDetailModal';

export const SessionsView: React.FC = () => {
  const t = useT();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [sessionsData, productsData] = await Promise.all([db.getSessions(), db.getProducts()]);
      setSessions(sessionsData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setProducts(productsData);
    } catch (err) {
      console.error(err);
      setErrorMsg(t.sessions_load_failed);
    } finally {
      setLoading(false);
    }
  }, [t.sessions_load_failed]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (selectedSession) {
    return (
      <div className="view-content">
        <SessionDetailModal
          session={selectedSession}
          onClose={() => {
            setSelectedSession(null);
            fetchAll();
          }}
          onDeleted={() => {
            setSelectedSession(null);
            fetchAll();
          }}
        />
      </div>
    );
  }

  return (
    <div className="view-content">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>{t.recordings_title}</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t.recordings_subtitle}</p>
      </div>

      <SessionsPanel
        sessions={sessions}
        products={products}
        loading={loading}
        errorMsg={errorMsg}
        onRetry={fetchAll}
        groupByRegion
        emptyTitle={t.no_sessions}
        emptyHint={t.no_sessions_hint}
        createLabel={t.create_new_session}
        onCreate={async name => { await db.saveSession(name, []); await fetchAll(); }}
        onSelect={setSelectedSession}
      />
    </div>
  );
};
