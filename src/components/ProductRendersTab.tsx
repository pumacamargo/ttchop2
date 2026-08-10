import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../services/databaseService';
import type { Product, Render } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { RefreshCw, Sparkles, Scissors, Layers, Play, Share2, ShieldAlert, Film } from 'lucide-react';

interface ProductRendersTabProps {
  product: Product;
}

// There's no getRendersForProduct() on databaseService, so we fetch all renders for the user
// and filter client-side by productId — matches the instruction not to add a new query method.
export const ProductRendersTab: React.FC<ProductRendersTabProps> = ({ product }) => {
  const t = useT();
  const [renders, setRenders] = useState<Render[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const all = await db.getRenders();
      setRenders(all.filter(r => r.productId === product.id));
    } catch (err) {
      console.error(err);
      setErrorMsg(t.renders_load_failed);
    } finally {
      setLoading(false);
    }
  }, [product.id, t.renders_load_failed]);

  useEffect(() => { load(); }, [load]);

  // Poll while something is still rendering, same pattern as WeeklyRendersView.
  useEffect(() => {
    const hasPending = renders.some(r => r.status === 'pending' || r.status === 'processing');
    if (!hasPending) return;
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [renders, load]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        <RefreshCw size={22} className="loading-spinner" style={{ marginBottom: '0.5rem' }} />
        <p style={{ margin: 0, fontSize: '0.85rem' }}>{t.loading_renders}</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="glass-card" style={{
        borderColor: 'var(--danger)',
        background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
        display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.8rem 1rem'
      }}>
        <ShieldAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{errorMsg}</p>
          <button
            onClick={load}
            className="btn btn-secondary"
            style={{ marginTop: '0.6rem', width: 'auto', minHeight: '36px', padding: '0 0.9rem', fontSize: '0.75rem' }}
          >
            <RefreshCw size={14} /> {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (renders.length === 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
        <Film size={48} style={{ opacity: 0.15, marginBottom: '1rem', color: 'var(--primary)' }} />
        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{t.product_renders_empty}</h4>
        <p style={{ fontSize: '0.8rem' }}>{t.product_renders_empty_hint}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {renders.map(r => <ProductRenderCard key={r.id} render={r} />)}
    </div>
  );
};

const TYPE_STYLE: Record<Render['type'], { bg: string; color: string }> = {
  ai:                { bg: 'var(--accent-glow)', color: 'var(--accent)' },
  overlay:           { bg: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' },
  collage:           { bg: 'var(--secondary-glow)', color: 'var(--secondary)' },
  'collage+overlay': { bg: 'var(--secondary-glow)', color: 'var(--secondary)' },
};

const TYPE_ICON: Record<Render['type'], React.ReactNode> = {
  ai: <Sparkles size={9} />,
  overlay: <Layers size={9} />,
  collage: <Scissors size={9} />,
  'collage+overlay': <Scissors size={9} />,
};

const STATUS_COLOR: Record<Render['status'], string> = {
  pending: 'var(--warning)',
  processing: 'var(--primary)',
  done: 'var(--success)',
  failed: 'var(--danger)',
};

const ProductRenderCard: React.FC<{ render: Render }> = ({ render }) => {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const typeLabel: Record<Render['type'], string> = {
    ai: t.render_type_ai,
    collage: t.render_type_collage,
    overlay: t.render_type_overlay,
    'collage+overlay': t.render_type_collage_overlay,
  };

  const handleCopy = () => {
    if (!render.videoUrl) return;
    navigator.clipboard.writeText(render.videoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const style = TYPE_STYLE[render.type] ?? TYPE_STYLE.collage;
  const statusColor = STATUS_COLOR[render.status];

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '0.6rem 0.8rem',
      display: 'flex', flexDirection: 'column', gap: '0.45rem',
    }}>
      {/* Row: dot · type · time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: statusColor,
          display: 'inline-block', flexShrink: 0,
          boxShadow: render.status === 'processing' ? `0 0 6px ${statusColor}` : 'none',
        }} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '1px 6px', borderRadius: 999, fontSize: '0.63rem', fontWeight: 700,
          background: style.bg, color: style.color,
        }}>
          {TYPE_ICON[render.type] ?? TYPE_ICON.collage} {typeLabel[render.type] ?? render.type}
        </span>
        <span style={{ flex: 1, textAlign: 'right', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          {new Date(render.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Actions for done renders */}
      {render.status === 'done' && render.videoUrl && (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              flex: 1, minHeight: '44px', padding: '4px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
              background: expanded ? 'var(--secondary-glow)' : 'color-mix(in srgb, var(--secondary) 7%, transparent)',
              border: '1px solid var(--secondary-glow)', color: 'var(--secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <Play size={12} /> {expanded ? t.render_hide : t.render_preview}
          </button>
          <button
            onClick={handleCopy}
            style={{
              minHeight: '44px', padding: '4px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
              background: copied ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'var(--primary-glow)',
              border: `1px solid ${copied ? 'color-mix(in srgb, var(--success) 35%, transparent)' : 'var(--primary-glow)'}`,
              color: copied ? 'var(--success)' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Share2 size={12} /> {copied ? t.copied : t.copy_link}
          </button>
        </div>
      )}

      {/* Processing indicator */}
      {render.status === 'processing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--primary)' }}>
          <RefreshCw size={11} className="loading-spinner" /> {t.render_rendering}
        </div>
      )}

      {/* Error message */}
      {render.status === 'failed' && render.errorMessage && (
        <p style={{ fontSize: '0.68rem', color: 'var(--danger)', margin: 0, wordBreak: 'break-word' }}>
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
