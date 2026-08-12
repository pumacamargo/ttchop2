import React, { useState } from 'react';
import { FolderInput, Check, X, AlertTriangle, RefreshCw, Globe, User } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';

/** A move target the picker can offer: general (`accountId: null`) or one connected account. */
interface MoveTarget {
  accountId: string | null;
  label: string;
}

export interface MoveToContainerMenuProps {
  /** Container the item currently lives in — undefined/null means general. */
  currentAccountId?: string | null;
  /** Performs the actual move (wire to `moveRenderToContainer`/`moveScheduledRenderToContainer`).
   * Throwing surfaces the error in the confirm dialog with a retry — it never closes on error. */
  onMove: (targetAccountId: string | null) => Promise<void>;
  /** Called after a successful move so the caller can refresh/refilter its list — a move that
   * makes the item invisible in the active container should make it disappear from view. */
  onMoved?: () => void;
  /** Sentence fragment identifying what's being moved (e.g. "this render") — plugged into the
   * shared `move_container_generic_*` i18n keys so every caller gets consistent wording without
   * duplicating whole sentences per item type. */
  itemLabel: string;
  /** Optional per-target warning shown in the confirm step once a target is picked (e.g. the
   * item's product won't be visible in the destination container). Return null/undefined for no
   * warning — it's informational only and never blocks the move. */
  getWarning?: (targetAccountId: string | null) => string | null | undefined;
  /** aria-label/title for the trigger icon button. */
  ariaLabel: string;
}

/**
 * Discreet "move to another container" action shared by ProductRendersTab, WeeklyRendersView and
 * CalendarView (renders and scheduled jobs) — see ProductDetailModal's own product-move UI for the
 * visual/textual reference this mirrors. Renders nothing when the user has no connected TikTok
 * accounts: with zero accounts there is nowhere else to move an item to, so the app behaves
 * exactly as it did before this feature existed.
 */
export const MoveToContainerMenu: React.FC<MoveToContainerMenuProps> = ({
  currentAccountId, onMove, onMoved, itemLabel, getWarning, ariaLabel,
}) => {
  const t = useT();
  const { accounts } = useContainer();
  const [showPicker, setShowPicker] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<MoveTarget | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [justMoved, setJustMoved] = useState(false);

  // Nowhere to move to with zero connected accounts.
  if (accounts.length === 0) return null;

  const normalizedCurrent = currentAccountId || null;

  const pickTarget = (target: MoveTarget) => {
    setShowPicker(false);
    setMoveError('');
    setPendingTarget(target);
  };

  const cancelMove = () => {
    setPendingTarget(null);
    setMoveError('');
  };

  const confirmMove = async () => {
    if (!pendingTarget) return;
    setIsMoving(true);
    setMoveError('');
    try {
      await onMove(pendingTarget.accountId);
      setPendingTarget(null);
      onMoved?.();
      setJustMoved(true);
      setTimeout(() => setJustMoved(false), 2000);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : t.move_container_generic_error.replace('{item}', itemLabel));
    } finally {
      setIsMoving(false);
    }
  };

  const warning = pendingTarget ? getWarning?.(pendingTarget.accountId) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        aria-label={ariaLabel}
        title={ariaLabel}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, color: justMoved ? 'var(--success)' : 'var(--text-muted)',
        }}
      >
        {justMoved ? <Check size={14} /> : <FolderInput size={14} />}
      </button>

      {/* Pick target */}
      {showPicker && (
        <div
          onClick={() => setShowPicker(false)}
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
                onClick={() => setShowPicker(false)}
                aria-label={t.cancel}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <MoveTargetOption
              isCurrent={!normalizedCurrent}
              icon={<Globe size={16} />}
              name={t.container_general_name}
              currentTag={t.move_container_picker_current_tag}
              onClick={() => pickTarget({ accountId: null, label: t.container_general_name })}
            />

            {accounts.map(account => (
              <MoveTargetOption
                key={account.openId}
                isCurrent={normalizedCurrent === account.openId}
                icon={<User size={16} />}
                avatarUrl={account.avatarUrl}
                name={account.displayName || account.openId}
                currentTag={t.move_container_picker_current_tag}
                onClick={() => pickTarget({ accountId: account.openId, label: account.displayName || account.openId })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Confirm */}
      {pendingTarget && (
        <div
          onClick={cancelMove}
          role="dialog"
          aria-modal="true"
          aria-label={t.move_container_generic_confirm_question.replace('{item}', itemLabel).replace('{target}', pendingTarget.label)}
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
              {t.move_container_generic_confirm_question.replace('{item}', itemLabel).replace('{target}', pendingTarget.label)}
            </h4>

            {warning && (
              <div style={{
                display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
                borderRadius: '8px', padding: '0.6rem 0.75rem'
              }}>
                <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{warning}</p>
              </div>
            )}

            {moveError && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger)' }}>{moveError}</p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={confirmMove}
                disabled={isMoving}
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
