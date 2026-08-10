import React, { useState } from 'react';
import { db } from '../services/databaseService';
import type { Product } from '../services/databaseService';
import { ArrowLeft, Trash2, RefreshCw, X, Link } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onDeleted }) => {
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
    } catch (err: any) {
      setError('Failed to delete the product: ' + (err.message || ''));
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
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
          title="Copy public link"
          style={{
            background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(76,215,246,0.1)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(76,215,246,0.25)'}`,
            borderRadius: '8px',
            padding: '6px 10px',
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
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
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

      {/* Photos */}
      {product.modelSheetUrls.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '0.4rem' }}>
            {product.modelSheetUrls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`photo-${idx}`}
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
            style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '0.8rem', padding: '6px 0 0', cursor: 'pointer' }}
          >
            View full description
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
            style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}
          >
            {isDeleting ? <><RefreshCw size={12} className="loading-spinner" /> Deleting...</> : 'Confirm Delete'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}
            disabled={isDeleting}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="btn btn-danger"
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            width: '100%',
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--danger)',
            border: '1px solid var(--danger)'
          }}
        >
          <Trash2 size={16} /> Delete Product
        </button>
      )}

      {/* Photo lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', cursor: 'zoom-out'
          }}
        >
          <img src={lightboxUrl} alt="full size" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.6)', border: 'none',
              borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Full description</h3>
              <button
                onClick={() => setShowFullDescription(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
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
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Full title</h3>
              <button
                onClick={() => setShowFullTitle(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: '1.5', color: '#fff', margin: 0 }}>
              {product.name}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
