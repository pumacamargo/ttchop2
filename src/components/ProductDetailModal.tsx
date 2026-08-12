import React, { useState } from 'react';
import { db } from '../services/databaseService';
import type { Product, ProductMoveSummary } from '../services/databaseService';
import { ArrowLeft, Trash2, RefreshCw, X, Link, ExternalLink, AlertTriangle, Info, Clapperboard, Film, ArrowRightLeft, Globe, User, Check } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import { ProductClipsTab } from './ProductClipsTab';
import { ProductRendersTab } from './ProductRendersTab';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
  /**
   * Called after a move that keeps the product visible in the active container (e.g. moved to
   * general, or the account that's already active) — the caller should refresh its list without
   * closing this modal. A move that makes the product invisible instead calls `onClose`, which
   * every current caller already wires to close-and-refresh (same as `onDeleted`).
   */
  onProductUpdated?: () => void;
}

/** A move target the picker can offer: general (`accountId: null`) or one connected account. */
interface MoveTarget {
  accountId: string | null;
  label: string;
}

type DetailTab = 'info' | 'clips' | 'renders';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_DAYS = 30;

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onDeleted, onProductUpdated }) => {
  const t = useT();
  const { accounts, activeAccountId } = useContainer();
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showFullTitle, setShowFullTitle] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- Move to another container ---
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<MoveTarget | null>(null);
  const [movePreview, setMovePreview] = useState<ProductMoveSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [moveSuccessLabel, setMoveSuccessLabel] = useState('');

  const currentAccount = product.accountId ? accounts.find(a => a.openId === product.accountId) : undefined;
  const currentContainerLabel = product.accountId
    ? (currentAccount?.displayName || product.accountId)
    : t.move_container_current_general;

  // Picking a target closes the picker and loads exact numbers for the confirmation dialog —
  // sessions/renders counts must never be guessed client-side, `previewProductMove` and the actual
  // `moveProductToContainer` mutation share the same computation (see databaseService.ts).
  const handlePickTarget = async (target: MoveTarget) => {
    setShowMovePicker(false);
    setPendingTarget(target);
    setMovePreview(null);
    setMoveError('');
    setPreviewError('');
    setPreviewLoading(true);
    try {
      const summary = await db.previewProductMove(product.id, target.accountId);
      setMovePreview(summary);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t.move_container_preview_error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const cancelMove = () => {
    setPendingTarget(null);
    setMovePreview(null);
    setPreviewError('');
    setMoveError('');
  };

  const confirmMove = async () => {
    if (!pendingTarget) return;
    setIsMoving(true);
    setMoveError('');
    try {
      await db.moveProductToContainer(product.id, pendingTarget.accountId);
      // General is visible from every container; a specific account is visible only while it (or
      // general) is active — see getVisibleForContainer. Anything else means the product just left
      // the container we're looking at, so showing it here further would be stale.
      const stillVisible = pendingTarget.accountId === null || pendingTarget.accountId === activeAccountId;
      const targetLabel = pendingTarget.label;
      setPendingTarget(null);
      setMovePreview(null);
      if (stillVisible) {
        // The modal stays open here, so it needs its own success cue — same fire-and-forget
        // timeout pattern as handleShare's "Copied" cue above. The "moved out" branch below
        // closes the modal instead, which (like onDeleted) is feedback enough on its own.
        onProductUpdated?.();
        setMoveSuccessLabel(t.move_container_success.replace('{target}', targetLabel));
        setTimeout(() => setMoveSuccessLabel(''), 3000);
      } else {
        onClose();
      }
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : t.move_container_error);
    } finally {
      setIsMoving(false);
    }
  };

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

          {/* Move to another container — hidden entirely with zero TikTok accounts connected:
              there is nowhere else to move a product to. This is a rare action, so it sits
              discreetly at the end of the tab, next to delete. */}
          {accounts.length > 0 && (
            <div style={{ marginBottom: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <p style={{
                fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', margin: '0 0 0.6rem', fontWeight: 700
              }}>
                {t.move_container_title}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: 0, flex: 1 }}>
                  {product.accountId
                    ? <User size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    : <Globe size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentContainerLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowMovePicker(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                    background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '0 0.75rem', minHeight: '44px', color: 'var(--text-primary)',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  <ArrowRightLeft size={14} /> {t.move_container_move_button}
                </button>
              </div>
              {moveSuccessLabel && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--success)' }}>{moveSuccessLabel}</p>
              )}
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

      {/* Move-to-container: pick target */}
      {showMovePicker && (
        <div
          onClick={() => setShowMovePicker(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t.move_container_picker_title}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-card"
            style={{ maxWidth: '360px', width: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.move_container_picker_title}</h4>
              <button
                onClick={() => setShowMovePicker(false)}
                aria-label={t.cancel}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <MoveTargetOption
              isCurrent={!product.accountId}
              icon={<Globe size={16} />}
              name={t.container_general_name}
              currentTag={t.move_container_picker_current_tag}
              onClick={() => handlePickTarget({ accountId: null, label: t.container_general_name })}
            />

            {accounts.map(account => (
              <MoveTargetOption
                key={account.openId}
                isCurrent={product.accountId === account.openId}
                icon={<User size={16} />}
                avatarUrl={account.avatarUrl}
                name={account.displayName || account.openId}
                currentTag={t.move_container_picker_current_tag}
                onClick={() => handlePickTarget({ accountId: account.openId, label: account.displayName || account.openId })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Move-to-container: confirm, with exact numbers of what moves along */}
      {pendingTarget && (
        <div
          onClick={cancelMove}
          role="dialog"
          aria-modal="true"
          aria-label={t.move_container_confirm_question.replace('{target}', pendingTarget.label)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-card"
            style={{ maxWidth: '380px', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {t.move_container_confirm_question.replace('{target}', pendingTarget.label)}
            </h4>

            {previewLoading && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={14} className="loading-spinner" /> {t.move_container_loading}
              </p>
            )}

            {previewError && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger)' }}>{previewError}</p>
            )}

            {movePreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(movePreview.sessions > 0 || movePreview.renders > 0) && (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {t.move_container_confirm_clips
                      .replace('{sessions}', String(movePreview.sessions))
                      .replace('{renders}', String(movePreview.renders))}
                  </p>
                )}
                {movePreview.sessionsLeftBehind > 0 && (
                  <div style={{
                    display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                    background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
                    borderRadius: '8px', padding: '0.6rem 0.75rem'
                  }}>
                    <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {t.move_container_confirm_shared_left.replace('{count}', String(movePreview.sessionsLeftBehind))}
                    </p>
                  </div>
                )}
              </div>
            )}

            {moveError && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger)' }}>{moveError}</p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={confirmMove}
                disabled={previewLoading || isMoving || !!previewError}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: '44px', fontSize: '0.82rem', padding: '0.4rem' }}
              >
                {isMoving
                  ? <><RefreshCw size={12} className="loading-spinner" /> {t.move_container_moving}</>
                  : moveError ? t.retry : t.move_container_confirm_button}
              </button>
              <button
                onClick={cancelMove}
                disabled={isMoving}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: '44px', fontSize: '0.82rem', padding: '0.4rem' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function MoveTargetOption({ isCurrent, name, avatarUrl, icon, currentTag, onClick }: {
  isCurrent: boolean;
  name: string;
  avatarUrl?: string;
  icon: React.ReactNode;
  currentTag: string;
  onClick: () => void;
}) {
  const [avatarBroken, setAvatarBroken] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isCurrent}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%', minHeight: '44px',
        padding: '0.5rem 0.65rem', borderRadius: '10px', border: '1px solid var(--border)',
        background: isCurrent ? 'var(--primary-glow)' : 'var(--bg-input)',
        cursor: isCurrent ? 'default' : 'pointer', textAlign: 'left', color: 'var(--text-primary)'
      }}
    >
      {avatarUrl && !avatarBroken ? (
        <img
          src={avatarUrl}
          alt=""
          onError={() => setAvatarBroken(true)}
          style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
        />
      ) : (
        <span style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-card-hover)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        {isCurrent && (
          <div style={{ fontSize: '0.68rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Check size={10} /> {currentTag}
          </div>
        )}
      </span>
    </button>
  );
}
