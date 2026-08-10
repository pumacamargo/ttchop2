import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../services/databaseService';
import type { Product, Session } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { SessionsPanel } from './SessionsPanel';
import { SessionDetailModal } from './SessionDetailModal';

interface ProductClipsTabProps {
  product: Product;
}

// Clips tab of the product detail view: same CRUD as the standalone Clips nav (SessionsPanel +
// SessionDetailModal, both reused as-is) but scoped to sessions linked to this one product.
export const ProductClipsTab: React.FC<ProductClipsTabProps> = ({ product }) => {
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
      const [sessionsData, productsData] = await Promise.all([
        db.getSessionsForProduct(product.id),
        db.getProducts(),
      ]);
      setSessions(sessionsData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setProducts(productsData);
    } catch (err) {
      console.error(err);
      setErrorMsg(t.sessions_load_failed);
    } finally {
      setLoading(false);
    }
  }, [product.id, t.sessions_load_failed]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (selectedSession) {
    return (
      <SessionDetailModal
        session={selectedSession}
        scopedProductId={product.id}
        onClose={() => { setSelectedSession(null); fetchAll(); }}
        onDeleted={() => { setSelectedSession(null); fetchAll(); }}
      />
    );
  }

  return (
    <SessionsPanel
      sessions={sessions}
      products={products}
      loading={loading}
      errorMsg={errorMsg}
      onRetry={fetchAll}
      emptyTitle={t.product_clips_empty}
      emptyHint={t.product_clips_empty_hint}
      createLabel={t.create_new_session}
      onCreate={async name => { await db.saveSession(name, [product.id]); await fetchAll(); }}
      onSelect={setSelectedSession}
    />
  );
};
