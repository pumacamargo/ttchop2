import React, { useState, useEffect } from 'react';
import { db } from '../services/databaseService';
import type { Product } from '../services/databaseService';
import { ShieldAlert, Package } from 'lucide-react';
import { ProductDetailModal } from './ProductDetailModal';
import { useT } from '../context/LanguageContext';

const REGION_FLAGS: Record<string, string> = { jp: '🇯🇵', mx: '🇲🇽' };
const REGION_ORDER = ['jp', 'mx'];

export const ProductsView: React.FC = () => {
  const t = useT();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      setProducts(await db.getProducts());
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to connect to the products database.');
    } finally {
      setLoading(false);
    }
  };

  if (selectedProduct) {
    return (
      <div className="view-content">
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => { setSelectedProduct(null); fetchProducts(); }}
          onDeleted={() => { setSelectedProduct(null); fetchProducts(); }}
        />
      </div>
    );
  }

  const availableRegions = REGION_ORDER.filter(r => products.some(p => p.region === r));
  const filtered = regionFilter === 'all' ? products : products.filter(p => p.region === regionFilter);

  return (
    <div className="view-content">
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
          {t.products_title}
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {t.products_subtitle}
        </p>
      </div>

      {errorMsg && (
        <div className="glass-card" style={{
          borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.08)',
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
          marginBottom: '1rem', padding: '0.8rem 1rem'
        }}>
          <ShieldAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{errorMsg}</p>
        </div>
      )}

      {/* Region filter pills */}
      {!loading && availableRegions.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '2px' }}>
          {(['all', ...availableRegions] as string[]).map(r => (
            <button
              key={r}
              onClick={() => setRegionFilter(r)}
              style={{
                padding: '0.35rem 0.9rem', borderRadius: '999px',
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                background: regionFilter === r ? 'var(--gradient)' : 'var(--bg-card)',
                color: regionFilter === r ? '#fff' : 'var(--text-secondary)',
                border: regionFilter === r ? '1px solid transparent' : '1px solid var(--border)',
                boxShadow: regionFilter === r ? '0 2px 12px rgba(109,59,215,0.3)' : 'none',
              }}
            >
              {r === 'all' ? t.filter_all_products : `${REGION_FLAGS[r] || ''} ${r === 'mx' ? t.region_mx : r === 'jp' ? t.region_jp : r.toUpperCase()}`}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeletons — grid shape */}
      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card pulsing-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4/5', background: 'rgba(255,255,255,0.04)' }} />
              <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ height: '13px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', width: '70%' }} />
                <div style={{ height: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px' }} />
                <div style={{ height: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          <Package size={48} style={{ opacity: 0.15, marginBottom: '1rem', color: 'var(--primary)' }} />
          <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t.products_empty}</h4>
          <p style={{ fontSize: '0.8rem' }}>{t.products_empty_hint}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '0.85rem' }}>{t.products_no_region}</p>
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
          ))}
        </div>
      )}
    </div>
  );
};

const ProductCard: React.FC<{ product: Product; onClick: () => void }> = ({ product: p, onClick }) => {
  const t = useT();
  return (
  <div
    className="glass-card"
    onClick={onClick}
    style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
  >
    {/* Image */}
    <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: '#0a0a0a', flexShrink: 0 }}>
      {p.modelSheetUrls[0]
        ? <img
            src={p.modelSheetUrls[0]}
            alt={p.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s ease', display: 'block' }}
          />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={32} style={{ opacity: 0.15, color: 'var(--primary)' }} />
          </div>
      }
      {/* Region badge */}
      {p.region && (
        <span style={{
          position: 'absolute', top: '0.5rem', left: '0.5rem',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
          padding: '2px 8px', borderRadius: '999px',
          fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          whiteSpace: 'nowrap'
        }}>
          {REGION_FLAGS[p.region]} {p.region === 'mx' ? t.region_mx : p.region === 'jp' ? t.region_jp : p.region}
        </span>
      )}
    </div>

    {/* Info */}
    <div style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <h3 style={{
        fontSize: '0.88rem', fontWeight: 700, color: '#fff', margin: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {p.name}
      </h3>
      {p.description && (
        <p style={{
          fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          {p.description}
        </p>
      )}
      {p.modelSheetUrls.length > 0 && (
        <span style={{
          marginTop: '0.25rem', display: 'inline-flex', alignItems: 'center', gap: '3px',
          fontSize: '0.62rem', color: 'var(--secondary)',
          background: 'rgba(76,215,246,0.1)', border: '1px solid rgba(76,215,246,0.2)',
          padding: '2px 7px', borderRadius: '999px', width: 'fit-content'
        }}>
          {p.modelSheetUrls.length} {t.photos}
        </span>
      )}
    </div>
  </div>
  );
};
