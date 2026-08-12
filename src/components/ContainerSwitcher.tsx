// Compact "which container am I looking at" indicator + switcher for SidePanel. A container is
// either the general/shared one (default, works with zero TikTok accounts connected) or a
// connected TikTok account's own private data — see ContainerContext / containerVisibility.ts.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Globe, User, Check } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import { TikTokAccountsModal } from './TikTokAccountsModal';
import type { TikTokAccount } from '../services/tiktokService';

export function ContainerSwitcher() {
  const t = useT();
  const { activeAccountId, activeAccount, accounts, loading, switchContainer } = useContainer();
  const [showSelector, setShowSelector] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const activeName = activeAccount ? (activeAccount.displayName || activeAccount.openId) : t.container_general_name;

  const handleOpen = () => {
    if (loading) return;
    // Nothing connected yet: there is nothing to switch to, so the block's job is to get the
    // user connecting instead of opening an empty list.
    if (accounts.length === 0) setShowConnectModal(true);
    else setShowSelector(true);
  };

  return (
    <>
      <button
        type="button"
        className="side-panel-container-switcher"
        onClick={handleOpen}
        aria-label={`${t.container_switcher_label}: ${activeName}`}
        aria-haspopup="dialog"
      >
        {activeAccount && activeAccount.avatarUrl && !avatarBroken ? (
          <img
            src={activeAccount.avatarUrl}
            alt=""
            className="side-panel-container-avatar"
            // TikTok avatar URLs expire — fall back to a plain person icon instead of a broken image.
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <span className="side-panel-container-icon">
            {activeAccount ? <User size={16} /> : <Globe size={16} />}
          </span>
        )}
        <span className="side-panel-container-info">
          <span className="side-panel-container-eyebrow">{t.container_switcher_label}</span>
          <span className="side-panel-container-name">
            {activeName}
            {/* General container gets an explicit "Shared" cue since its content is visible from every account. */}
            {!activeAccount && ` · ${t.container_general_hint}`}
          </span>
        </span>
      </button>

      {showSelector && (
        <ContainerSelectorModal
          activeAccountId={activeAccountId}
          accounts={accounts}
          onSelect={async accountId => {
            await switchContainer(accountId);
            setShowSelector(false);
          }}
          onClose={() => setShowSelector(false)}
        />
      )}

      {showConnectModal && <TikTokAccountsModal onClose={() => setShowConnectModal(false)} />}
    </>
  );
}

function ContainerSelectorModal({
  activeAccountId,
  accounts,
  onSelect,
  onClose,
}: {
  activeAccountId: string | null;
  accounts: TikTokAccount[];
  onSelect: (accountId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [switchingTo, setSwitchingTo] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');

  const handlePick = async (accountId: string | null) => {
    setSwitchingTo(accountId);
    setError('');
    try {
      await onSelect(accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.container_switch_error);
    } finally {
      setSwitchingTo(undefined);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.container_modal_title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card"
        style={{ maxWidth: '360px', width: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.1rem' }}
      >
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.container_modal_title}</h4>

        <ContainerOption
          isActive={!activeAccountId}
          icon={<Globe size={16} />}
          name={t.container_general_name}
          hint={t.container_option_general_hint}
          loading={switchingTo === null}
          onClick={() => handlePick(null)}
        />

        {accounts.map(account => (
          <AccountOption
            key={account.openId}
            account={account}
            isActive={activeAccountId === account.openId}
            loading={switchingTo === account.openId}
            onClick={() => handlePick(account.openId)}
          />
        ))}

        {error && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</p>}
      </div>
    </div>
  );
}

function ContainerOption({
  isActive, icon, name, hint, loading, onClick,
}: {
  isActive: boolean;
  icon: ReactNode;
  name: string;
  hint: string;
  loading: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isActive || loading}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%', minHeight: '44px',
        padding: '0.5rem 0.65rem', borderRadius: '10px', border: '1px solid var(--border)',
        background: isActive ? 'var(--primary-glow)' : 'var(--bg-input)',
        cursor: isActive || loading ? 'default' : 'pointer', textAlign: 'left',
        color: 'var(--text-primary)', opacity: loading ? 0.7 : 1,
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--primary-glow)',
        color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: '0.68rem', color: isActive ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          {isActive ? <><Check size={10} /> {t.tiktok_active_account}</> : hint}
        </div>
      </span>
    </button>
  );
}

function AccountOption({
  account, isActive, loading, onClick,
}: {
  account: TikTokAccount;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const [avatarBroken, setAvatarBroken] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isActive || loading}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%', minHeight: '44px',
        padding: '0.5rem 0.65rem', borderRadius: '10px', border: '1px solid var(--border)',
        background: isActive ? 'var(--primary-glow)' : 'var(--bg-input)',
        cursor: isActive || loading ? 'default' : 'pointer', textAlign: 'left',
        color: 'var(--text-primary)', opacity: loading ? 0.7 : 1,
      }}
    >
      {account.avatarUrl && !avatarBroken ? (
        <img
          src={account.avatarUrl}
          alt=""
          onError={() => setAvatarBroken(true)}
          style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
        />
      ) : (
        <span style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-card-hover)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={16} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {account.displayName || account.openId}
        </div>
        {isActive && (
          <div style={{ fontSize: '0.68rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Check size={10} /> {t.tiktok_active_account}
          </div>
        )}
      </span>
    </button>
  );
}
