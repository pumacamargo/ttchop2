import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { db, getVisibleForContainer, isGeneralContainer } from '../services/databaseService';
import type { Product, Render } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import { RefreshCw, Sparkles, Scissors, Layers, Play, Share2, ShieldAlert, Film, Link2, Check, Pencil } from 'lucide-react';
import { MoveToContainerMenu } from './MoveToContainerMenu';

interface ProductRendersTabProps {
  product: Product;
}

// There's no getRendersForProduct() on databaseService, so we fetch all renders for the user
// and filter client-side by productId — matches the instruction not to add a new query method.
export const ProductRendersTab: React.FC<ProductRendersTabProps> = ({ product }) => {
  const t = useT();
  const { activeAccountId } = useContainer();
  const [allRenders, setAllRenders] = useState<Render[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const all = await db.getRenders();
      setAllRenders(all.filter(r => r.productId === product.id));
    } catch (err) {
      console.error(err);
      setErrorMsg(t.renders_load_failed);
    } finally {
      setLoading(false);
    }
  }, [product.id, t.renders_load_failed]);

  useEffect(() => { load(); }, [load]);

  // getRenders() isn't container-filtered server side — re-derive on activeAccountId change
  // instead of re-fetching (same pattern as ProductsView/SessionsView).
  const renders = useMemo(() => getVisibleForContainer(allRenders, activeAccountId), [allRenders, activeAccountId]);

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
      {renders.map(r => <ProductRenderCard key={r.id} render={r} product={product} onMoved={load} />)}
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

const ProductRenderCard: React.FC<{ render: Render; product: Product; onMoved: () => void }> = ({ render, product, onMoved }) => {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tiktokVideoId, setTiktokVideoId] = useState(render.tiktokVideoId ?? '');
  const [editingTiktok, setEditingTiktok] = useState(false);
  const [tiktokInput, setTiktokInput] = useState('');
  const [savingTiktok, setSavingTiktok] = useState(false);
  const [tiktokError, setTiktokError] = useState('');
  const [tiktokSaved, setTiktokSaved] = useState(false);

  const startEditingTiktok = () => {
    setTiktokInput(tiktokVideoId);
    setTiktokError('');
    setEditingTiktok(true);
  };

  const handleSaveTiktok = async () => {
    const value = tiktokInput.trim();
    if (!value) return;
    setSavingTiktok(true);
    setTiktokError('');
    try {
      await db.linkRenderToTikTok(render.id, value);
      setTiktokVideoId(value);
      setEditingTiktok(false);
      setTiktokSaved(true);
      setTimeout(() => setTiktokSaved(false), 2000);
    } catch (err) {
      console.error(err);
      setTiktokError(t.render_tiktok_link_error);
    } finally {
      setSavingTiktok(false);
    }
  };

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
        <MoveToContainerMenu
          currentAccountId={render.accountId}
          onMove={target => db.moveRenderToContainer(render.id, target)}
          onMoved={onMoved}
          itemLabel={t.move_render_item_label}
          ariaLabel={t.move_container_action_label}
          getWarning={target => (
            !isGeneralContainer(product.accountId) && product.accountId !== (target || null)
              ? t.move_container_product_warning
              : null
          )}
        />
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

      {/* TikTok video link — lets the user tie this render to the published TikTok
          video so Analytics can match order-export rows (by Content ID) back to it. */}
      {render.status === 'done' && render.videoUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {!editingTiktok ? (
            tiktokVideoId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 600,
                  background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)',
                }}>
                  <Check size={10} /> {t.render_tiktok_linked}
                </span>
                <span style={{
                  fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                }}>
                  {tiktokVideoId}
                </span>
                <button
                  onClick={startEditingTiktok}
                  aria-label={t.render_tiktok_link_edit}
                  style={{
                    minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Pencil size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditingTiktok}
                style={{
                  minHeight: '44px', padding: '4px 10px', borderRadius: 6, fontSize: '0.73rem', fontWeight: 600,
                  background: 'color-mix(in srgb, var(--secondary) 6%, transparent)', border: '1px dashed var(--border)',
                  color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
                }}
              >
                <Link2 size={12} /> {t.render_tiktok_link_cta}
              </button>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input
                  value={tiktokInput}
                  onChange={e => setTiktokInput(e.target.value)}
                  placeholder={t.render_tiktok_link_placeholder}
                  disabled={savingTiktok}
                  style={{
                    flex: 1, minHeight: '44px', padding: '0 8px', borderRadius: 6, fontSize: '0.75rem',
                    background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={handleSaveTiktok}
                  disabled={savingTiktok || !tiktokInput.trim()}
                  style={{
                    minHeight: '44px', minWidth: '44px', padding: '0 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                    background: 'var(--primary)', border: 'none', color: '#fff',
                    cursor: savingTiktok || !tiktokInput.trim() ? 'default' : 'pointer',
                    opacity: savingTiktok || !tiktokInput.trim() ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {savingTiktok ? <RefreshCw size={13} className="loading-spinner" /> : t.save}
                </button>
                <button
                  onClick={() => setEditingTiktok(false)}
                  disabled={savingTiktok}
                  style={{
                    minHeight: '44px', padding: '0 10px', borderRadius: 6, fontSize: '0.75rem',
                    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer',
                  }}
                >
                  {t.cancel}
                </button>
              </div>
              {tiktokError && (
                <p style={{ fontSize: '0.68rem', color: 'var(--danger)', margin: 0 }}>{tiktokError}</p>
              )}
            </div>
          )}
          {tiktokSaved && (
            <span style={{ fontSize: '0.65rem', color: 'var(--success)' }}>{t.render_tiktok_link_saved}</span>
          )}
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
