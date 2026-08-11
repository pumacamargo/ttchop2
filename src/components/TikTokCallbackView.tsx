import { useEffect, useRef, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useT } from '../context/LanguageContext';
import { exchangeTikTokCode, consumeTikTokOAuthState, buildTikTokAuthorizeUrl } from '../services/tiktokService';

type CallbackPhase =
  | { kind: 'processing' }
  | { kind: 'success'; displayName: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }
  | { kind: 'need_login' };

// Handles the `/auth/tiktok/callback` redirect. Lives inside App.tsx (not main.tsx)
// because the token exchange needs the caller's Firebase ID token, i.e. a logged-in
// user — this route only makes sense once the AuthProvider has resolved.
export function TikTokCallbackView({ onDone }: { onDone: () => void }) {
  const { user, loading } = useAuth();
  const t = useT();
  const [phase, setPhase] = useState<CallbackPhase>({ kind: 'processing' });
  const ranRef = useRef(false);

  useEffect(() => {
    if (loading || ranRef.current) return;
    ranRef.current = true;

    const params = new URLSearchParams(window.location.search);
    // Clean the URL immediately so a refresh never resubmits a one-time-use code.
    window.history.replaceState(null, '', '/');

    if (params.get('error')) {
      setPhase({ kind: 'cancelled' });
      return;
    }

    const code = params.get('code');
    const stateOk = consumeTikTokOAuthState(params.get('state'));
    if (!code || !stateOk) {
      setPhase({ kind: 'error', message: t.tiktok_callback_invalid_state });
      return;
    }

    if (!user) {
      setPhase({ kind: 'need_login' });
      return;
    }

    exchangeTikTokCode(code)
      .then(account => setPhase({ kind: 'success', displayName: account.displayName }))
      .catch((err: unknown) => setPhase({ kind: 'error', message: err instanceof Error ? err.message : t.tiktok_callback_error }));
    // Intentionally runs once per mount (guarded by ranRef) — re-running on every
    // `t` change would replay the exchange with an already-consumed code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  useEffect(() => {
    if (phase.kind !== 'success') return;
    const id = setTimeout(onDone, 1600);
    return () => clearTimeout(id);
  }, [phase, onDone]);

  const handleRetryFullFlow = () => {
    window.location.href = buildTikTokAuthorizeUrl();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      background: 'var(--bg-space)', padding: '1.25rem',
    }}>
      <div className="glass-card" style={{ maxWidth: '360px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.5rem', textAlign: 'center' }}>
        {(phase.kind === 'processing' || loading) && (
          <>
            <RefreshCw size={30} className="loading-spinner" style={{ color: 'var(--primary)' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.tiktok_callback_processing}</p>
          </>
        )}

        {phase.kind === 'success' && (
          <>
            <CheckCircle2 size={32} style={{ color: 'var(--success)' }} />
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.tiktok_callback_success}</p>
            {phase.displayName && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {t.tiktok_callback_connected_as.replace('{name}', phase.displayName)}
              </p>
            )}
          </>
        )}

        {phase.kind === 'cancelled' && (
          <>
            <AlertTriangle size={28} style={{ color: 'var(--warning)' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.tiktok_callback_cancelled}</p>
            <button onClick={onDone} className="btn btn-primary" style={{ minHeight: '44px' }}>{t.tiktok_callback_continue}</button>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <AlertTriangle size={28} style={{ color: 'var(--danger)' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{phase.message}</p>
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
              <button onClick={handleRetryFullFlow} className="btn btn-secondary" style={{ flex: 1, minHeight: '44px', fontSize: '0.8rem' }}>
                {t.tiktok_callback_retry}
              </button>
              <button onClick={onDone} className="btn btn-primary" style={{ flex: 1, minHeight: '44px', fontSize: '0.8rem' }}>
                {t.tiktok_callback_continue}
              </button>
            </div>
          </>
        )}

        {phase.kind === 'need_login' && (
          <>
            <LogIn size={28} style={{ color: 'var(--warning)' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.tiktok_callback_need_login}</p>
            <button onClick={onDone} className="btn btn-primary" style={{ minHeight: '44px' }}>{t.tiktok_callback_continue}</button>
          </>
        )}
      </div>
    </div>
  );
}
