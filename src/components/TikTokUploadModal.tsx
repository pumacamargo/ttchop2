import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, RefreshCw, CheckCircle2, AlertTriangle, Plug } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { db } from '../services/databaseService';
import type { Render } from '../services/databaseService';
import { getTikTokAccounts, uploadRenderToTikTok, buildTikTokAuthorizeUrl } from '../services/tiktokService';
import type { TikTokAccount } from '../services/tiktokService';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';
type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function TikTokUploadModal({ render, onClose, onUploaded }: { render: Render; onClose: () => void; onUploaded?: () => void }) {
  const t = useT();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [selectedOpenId, setSelectedOpenId] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState('');

  // Guards setState calls that resolve after the modal has already been closed.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const [list, preferred] = await Promise.all([getTikTokAccounts(), db.getUserPref('activeTiktokAccountId')]);
      if (!mountedRef.current) return;
      setAccounts(list);
      if (list.length === 0) {
        setLoadState('empty');
      } else {
        setLoadState('ready');
        setSelectedOpenId(preferred && list.some(a => a.openId === preferred) ? preferred : list[0].openId);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setLoadError(err instanceof Error ? err.message : t.tiktok_accounts_load_error);
      setLoadState('error');
    }
  }, [t]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const handleUpload = async () => {
    if (!selectedOpenId) return;
    setUploadState('uploading');
    setUploadError('');
    try {
      await uploadRenderToTikTok(render.id, selectedOpenId);
      if (!mountedRef.current) return;
      setUploadState('success');
      onUploaded?.();
    } catch (err) {
      if (!mountedRef.current) return;
      setUploadError(err instanceof Error ? err.message : t.tiktok_upload_error);
      setUploadState('error');
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
      aria-label={t.tiktok_upload_modal_title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card"
        style={{ maxWidth: '380px', width: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1.25rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.tiktok_upload_modal_title}</h4>
          <button
            onClick={onClose}
            aria-label={t.cancel}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {uploadState === 'success' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--success)' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.tiktok_upload_success}</p>
            <button onClick={onClose} className="btn btn-primary" style={{ minHeight: '44px' }}>{t.tiktok_upload_done}</button>
          </div>
        ) : loadState === 'loading' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem', justifyContent: 'center' }}>
            <RefreshCw size={16} className="loading-spinner" /> {t.tiktok_accounts_loading}
          </div>
        ) : loadState === 'error' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.5rem 0', textAlign: 'center' }}>
            <AlertTriangle size={26} style={{ color: 'var(--danger)', margin: '0 auto' }} />
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{loadError}</p>
            <button onClick={loadAccounts} className="btn btn-secondary" style={{ minHeight: '44px' }}>{t.retry}</button>
          </div>
        ) : loadState === 'empty' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.5rem 0', textAlign: 'center' }}>
            <Plug size={26} style={{ color: 'var(--warning)', margin: '0 auto' }} />
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.tiktok_upload_no_account}</p>
            <button onClick={handleConnectNew} className="btn btn-primary" style={{ minHeight: '44px' }}>{t.tiktok_connect_account}</button>
          </div>
        ) : (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{t.tiktok_select_account}</label>
              <select className="form-select" value={selectedOpenId} onChange={e => setSelectedOpenId(e.target.value)}>
                {accounts.map(a => <option key={a.openId} value={a.openId}>{a.displayName || a.openId}</option>)}
              </select>
            </div>
            <button onClick={handleConnectNew} className="btn btn-secondary" style={{ minHeight: '40px', fontSize: '0.78rem' }}>
              {t.tiktok_connect_another}
            </button>
            {uploadState === 'error' && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--danger)' }}>{uploadError}</p>
            )}
            <button
              onClick={handleUpload}
              disabled={uploadState === 'uploading' || !selectedOpenId}
              className="btn btn-primary"
              style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {uploadState === 'uploading'
                ? <><RefreshCw size={14} className="loading-spinner" /> {t.tiktok_uploading}</>
                : <><Upload size={14} /> {uploadState === 'error' ? t.retry : t.tiktok_upload_confirm}</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
