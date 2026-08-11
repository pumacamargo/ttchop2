import React, { useState } from 'react';
import { db } from '../services/databaseService';
import type { Product } from '../services/databaseService';
import { ArrowLeft, Trash2, RefreshCw, X, Link, ExternalLink, AlertTriangle, Info, Clapperboard, Film } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { ProductClipsTab } from './ProductClipsTab';
import { ProductRendersTab } from './ProductRendersTab';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}

type DetailTab = 'info' | 'clips' | 'renders';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_DAYS = 30;

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onDeleted }) => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showFullTitle, setShowFullTitle] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/p/${product.id}`;
  const handleShare = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const TITLE_CLAMP = 50;
  const isTitleClamped = product.name.length > TITLE_CLAMP;
  const clampedTitle = isTitleClamped ? `${product.name.slice(0, TITLE_CLAMP)}...` : product.name;

  const handleDeleteProduct = async () => {
    setIsDeleting(true);
    setError('');

    try {
      await db.deleteProduct(product.id);
      onDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(t.delete_product_failed + msg);
      setIsDeleting(false);
    }
  };

  const scrapedDaysAgo = product.scrapedAt
    ? Math.floor((Date.now() - new Date(product.scrapedAt).getTime()) / MS_PER_DAY)
    : null;
  const isStale = scrapedDaysAgo !== null && scrapedDaysAgo > STALE_THRESHOLD_DAYS;
  const scrapedLabel = scrapedDaysAgo === null ? null
    : scrapedDaysAgo <= 0 ? t.scraped_today
    : scrapedDaysAgo === 1 ? t.scraped_yesterday
    : t.scraped_days_ago.replace('{days}', String(scrapedDaysAgo));

  const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: t.product_tab_info, icon: <Info size={14} /> },
    { key: 'clips', label: t.product_tab_clips, icon: <Clapperboard size={14} /> },
    { key: 'renders', label: t.product_tab_renders, icon: <Film size={14} /> },
  ];

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <button
          onClick={onClose}
          aria-label={t.cancel}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h2
          onClick={() => isTitleClamped && setShowFullTitle(true)}
          style={{ fontSize: '1.25rem', margin: 0, lineHeight: 1.3, flex: 1, cursor: isTitleClamped ? 'pointer' : 'default' }}
        >
          {clampedTitle}
        </h2>
        <button
          onClick={handleShare}
          title={t.copy_public_link}
          aria-label={t.copy_public_link}
          style={{
            background: copied ? 'color-mix(in srgb, var(--success) 15%, transparent)' : 'var(--secondary-glow)',
            border: `1px solid ${copied ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'var(--secondary-glow)'}`,
            borderRadius: '8px',
            padding: '6px 10px',
            minHeight: '44px',
            color: copied ? 'var(--success)' : 'var(--secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '0.75rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          <Link size={13} />
          {copied ? t.copied : t.share}
        </button>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '0.55rem 0.25rem',
              minHeight: '44px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === tab.key ? 'var(--gradient)' : 'var(--primary-glow)',
              color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
              border: activeTab === tab.key ? '1px solid transparent' : '1px solid var(--primary-glow)',
              transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <>
          {error && (
            <div style={{
              background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
              border: '1px solid var(--danger)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: 'var(--danger)',
              fontSize: '0.85rem'
            }}>
              {error}
            </div>
          )}

          {/* Source link + scrape freshness */}
          {product.sourceUrl && (
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  minHeight: '44px', padding: '0 1rem', borderRadius: '8px',
                  background: 'var(--primary-glow)', border: '1px solid var(--primary-glow)',
                  color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 600,
                  textDecoration: 'none', width: '100%'
                }}
              >
                <ExternalLink size={15} /> {t.view_on_tiktok}
              </a>

              {scrapedLabel && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                  {scrapedLabel}
                </p>
              )}

              {isStale && (
                <div style={{
                  display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
                  background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
                  borderRadius: '8px', padding: '0.7rem 0.85rem'
                }}>
                  <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                    {t.scrape_stale_warning}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Photos */}
          {product.modelSheetUrls.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '0.4rem' }}>
                {product.modelSheetUrls.map((url, idx) => (
                  <img
                    key={url}
                    src={url}
                    alt={`${product.name}-${idx}`}
                    onClick={() => setLightboxUrl(url)}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Clamped description */}
          {product.description && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap'
              }}>
                {product.description}
              </p>
              <button
                type="button"
                onClick={() => setShowFullDescription(true)}
                style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.8rem', padding: '6px 0 0', cursor: 'pointer', minHeight: '44px' }}
              >
                {t.view_full_description}
              </button>
            </div>
          )}

          {/* Delete product */}
          {showDeleteConfirm ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleDeleteProduct}
                disabled={isDeleting}
                className="btn btn-danger"
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem', minHeight: '44px' }}
              >
                {isDeleting ? <><RefreshCw size={12} className="loading-spinner" /> {t.deleting}</> : t.confirm_delete}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem', minHeight: '44px' }}
                disabled={isDeleting}
              >
                {t.cancel}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%',
                minHeight: '44px',
                background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                color: 'var(--danger)',
                border: '1px solid var(--danger)'
              }}
            >
              <Trash2 size={16} /> {t.delete_product}
            </button>
          )}
        </>
      )}

      {activeTab === 'clips' && <ProductClipsTab product={product} />}
      {activeTab === 'renders' && <ProductRendersTab product={product} />}

      {/* Photo lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', cursor: 'zoom-out'
          }}
        >
          <img src={lightboxUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} />
          <button
            onClick={() => setLightboxUrl(null)}
            aria-label={t.cancel}
            style={{
              position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.6)', border: 'none',
              borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Full description */}
      {showFullDescription && (
        <div
          onClick={() => setShowFullDescription(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-card"
            style={{ maxWidth: '520px', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '1.5rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{t.full_description_title}</h3>
              <button
                onClick={() => setShowFullDescription(false)}
                aria-label={t.cancel}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-secondary)', margin: 0 }}>
              {product.description}
            </p>
          </div>
        </div>
      )}

      {/* Full title */}
      {showFullTitle && (
        <div
          onClick={() => setShowFullTitle(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-card"
            style={{ maxWidth: '520px', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '1.5rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{t.full_title_title}</h3>
              <button
                onClick={() => setShowFullTitle(false)}
                aria-label={t.cancel}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)', margin: 0 }}>
              {product.name}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
