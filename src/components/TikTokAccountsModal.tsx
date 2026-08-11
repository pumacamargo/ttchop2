import { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, AlertTriangle, UserRoundPlus, Trash2, Check } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { db } from '../services/databaseService';
import { getTikTokAccounts, disconnectTikTokAccount, buildTikTokAuthorizeUrl } from '../services/tiktokService';
import type { TikTokAccount } from '../services/tiktokService';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

export function TikTokAccountsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [activeOpenId, setActiveOpenId] = useState<string | null>(null);
  const [confirmingOpenId, setConfirmingOpenId] = useState<string | null>(null);
  const [disconnectingOpenId, setDisconnectingOpenId] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState('');
  const [settingActiveOpenId, setSettingActiveOpenId] = useState<string | null>(null);

  // Guards setState calls that resolve after the modal has already been closed.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const [list, pref] = await Promise.all([getTikTokAccounts(), db.getUserPref('activeTiktokAccountId')]);
      if (!mountedRef.current) return;
      setAccounts(list);
      setActiveOpenId(pref);
      setLoadState(list.length === 0 ? 'empty' : 'ready');
    } catch (err) {
      if (!mountedRef.current) return;
      setLoadError(err instanceof Error ? err.message : t.tiktok_accounts_load_error);
      setLoadState('error');
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const handleSetActive = async (openId: string) => {
    setSettingActiveOpenId(openId);
    try {
      await db.setUserPref('activeTiktokAccountId', openId);
      if (!mountedRef.current) return;
      setActiveOpenId(openId);
    } finally {
      if (mountedRef.current) setSettingActiveOpenId(null);
    }
  };

  const handleDisconnect = async (openId: string) => {
    setDisconnectingOpenId(openId);
    setDisconnectError('');
    try {
      await disconnectTikTokAccount(openId);
      if (!mountedRef.current) return;
      const remaining = accounts.filter(a => a.openId !== openId);
      setAccounts(remaining);
      setConfirmingOpenId(null);
      if (remaining.length === 0) setLoadState('empty');
      if (activeOpenId === openId) {
        await db.setUserPref('activeTiktokAccountId', '');
        if (mountedRef.current) setActiveOpenId(null);
      }
    } catch (err) {
      if (mountedRef.current) setDisconnectError(err instanceof Error ? err.message : t.tiktok_disconnect_error);
    } finally {
      if (mountedRef.current) setDisconnectingOpenId(null);
    }
  };

  const handleConnectNew = () => {
    window.location.href = buildTikTokAuthorizeUrl();
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.tiktok_accounts_modal_title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card"
        style={{ maxWidth: '400px', width: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1.25rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.tiktok_accounts_modal_title}</h4>
          <button
            onClick={onClose}
            aria-label={t.cancel}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {loadState === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.25rem 0', color: 'var(--text-muted)', fontSize: '0.85rem', justifyContent: 'center' }}>
            <RefreshCw size={16} className="loading-spinner" /> {t.tiktok_accounts_loading}
          </div>
        )}

        {loadState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.75rem 0', textAlign: 'center' }}>
            <AlertTriangle size={26} style={{ color: 'var(--danger)', margin: '0 auto' }} />
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{loadError}</p>
            <button onClick={load} className="btn btn-secondary" style={{ minHeight: '44px' }}>{t.retry}</button>
          </div>
        )}

        {loadState === 'empty' && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
            {t.tiktok_accounts_empty}
          </p>
        )}

        {loadState === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {accounts.map(account => (
              <div
                key={account.openId}
                style={{
                  display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.6rem 0.7rem', borderRadius: '10px',
                  border: '1px solid var(--border)', background: activeOpenId === account.openId ? 'var(--primary-glow)' : 'var(--bg-input)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {account.avatarUrl
                    ? <img src={account.avatarUrl} alt={account.displayName} style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-card-hover)' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {account.displayName || account.openId}
                    </div>
                    {activeOpenId === account.openId && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Check size={10} /> {t.tiktok_active_account}
                      </div>
                    )}
                  </div>
                </div>

                {confirmingOpenId === account.openId ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleDisconnect(account.openId)}
                      disabled={disconnectingOpenId === account.openId}
                      className="btn btn-danger"
                      style={{ flex: 1, fontSize: '0.75rem', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {disconnectingOpenId === account.openId ? <RefreshCw size={12} className="loading-spinner" /> : t.confirm_delete}
                    </button>
                    <button
                      onClick={() => setConfirmingOpenId(null)}
                      disabled={disconnectingOpenId === account.openId}
                      className="btn btn-secondary"
                      style={{ flex: 1, fontSize: '0.75rem', minHeight: '40px' }}
                    >
                      {t.cancel}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleSetActive(account.openId)}
                      disabled={activeOpenId === account.openId || settingActiveOpenId === account.openId}
                      className="btn btn-secondary"
                      style={{ flex: 1, fontSize: '0.75rem', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {settingActiveOpenId === account.openId
                        ? <RefreshCw size={12} className="loading-spinner" />
                        : activeOpenId === account.openId ? t.tiktok_active_account : t.tiktok_set_active}
                    </button>
                    <button
                      onClick={() => setConfirmingOpenId(account.openId)}
                      className="btn btn-danger"
                      style={{ flex: 1, fontSize: '0.75rem', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <Trash2 size={13} /> {t.tiktok_disconnect}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {disconnectError && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--danger)' }}>{disconnectError}</p>}

        {(loadState === 'ready' || loadState === 'empty') && (
          <button
            onClick={handleConnectNew}
            className="btn btn-primary"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <UserRoundPlus size={16} /> {t.tiktok_connect_account}
          </button>
        )}
      </div>
    </div>
  );
}
