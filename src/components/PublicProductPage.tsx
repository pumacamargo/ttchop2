import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase';

interface Product {
  name: string;
  description: string;
  modelSheetUrls: string[];
  region?: string;
}

const REGION_LABELS: Record<string, string> = { jp: 'Japan', mx: 'Mexico' };

const db = (() => {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
})();

export const PublicProductPage: React.FC<{ productId: string }> = ({ productId }) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Reset body styles set by the main app layout
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    document.body.style.overflow = 'auto';
  }, []);

  useEffect(() => {
    getDoc(doc(db, 'products', productId)).then(snap => {
      if (snap.exists()) setProduct(snap.data() as Product);
      else setNotFound(true);
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [productId]);

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
    </div>
  );

  if (notFound) return (
    <div style={styles.center}>
      <p style={{ color: '#9ca3af', fontSize: '1rem' }}>Product not found.</p>
    </div>
  );

  if (!product) return null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>TT</div>
          <span style={styles.logoText}>TTChop</span>
        </div>

        {/* Product info */}
        <div style={styles.meta}>
          {product.region && REGION_LABELS[product.region] && (
            <span style={styles.region}>{REGION_LABELS[product.region]}</span>
          )}
          <h1 style={styles.title}>{product.name}</h1>
          {product.description && (
            <p style={styles.description}>{product.description}</p>
          )}
        </div>

        {/* Images */}
        {product.modelSheetUrls?.length > 0 && (
          <div>
            <p style={styles.sectionLabel}>Product Images ({product.modelSheetUrls.length})</p>
            <div style={styles.imageGrid}>
              {product.modelSheetUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`${product.name} ${i + 1}`} style={styles.image} />
                </a>
              ))}
            </div>
          </div>
        )}

        <p style={styles.footer}>
          Share this page with an AI to provide product context and images.
        </p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0b0f19',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '2rem 1rem',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: '640px',
    background: 'rgba(17, 24, 39, 0.9)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    paddingBottom: '1rem',
  },
  logo: {
    background: 'rgba(99,102,241,0.25)',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6366f1',
    fontWeight: 800,
    fontSize: '1rem',
  },
  logoText: {
    color: '#f3f4f6',
    fontWeight: 700,
    fontSize: '1rem',
  },
  meta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  region: {
    display: 'inline-block',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#06b6d4',
    background: 'rgba(6,182,212,0.12)',
    border: '1px solid rgba(6,182,212,0.25)',
    borderRadius: '4px',
    padding: '2px 8px',
    width: 'fit-content',
  },
  title: {
    color: '#f3f4f6',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.3,
  },
  description: {
    color: '#9ca3af',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  sectionLabel: {
    color: '#6b7280',
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    margin: '0 0 0.75rem',
  },
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '0.75rem',
  },
  image: {
    width: '100%',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    objectFit: 'cover',
    display: 'block',
    cursor: 'zoom-in',
  },
  footer: {
    color: '#4b5563',
    fontSize: '0.75rem',
    textAlign: 'center',
    margin: 0,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: '1rem',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0b0f19',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(99,102,241,0.2)',
    borderTop: '3px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
