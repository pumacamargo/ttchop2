// TikTok OAuth + upload — Phase 6. All token exchange, refresh, and Storage→TikTok
// upload happens server-side (Cloud Functions); this module only builds the authorize
// URL, guards the OAuth `state` against CSRF, and wraps calls to those functions with
// the caller's Firebase ID token so the function can verify who's asking.
import { auth } from '../config/firebase';

const FUNCTIONS_BASE = 'https://us-central1-ttchop2.cloudfunctions.net';
const TIKTOK_CLIENT_KEY = import.meta.env.VITE_TIKTOK_CLIENT_KEY as string;
// Must match the redirect URI registered in the TikTok developer portal character for
// character — used both when building the authorize URL and in the token exchange.
export const TIKTOK_REDIRECT_URI = 'https://ttchop2.web.app/auth/tiktok/callback';
const OAUTH_STATE_STORAGE_KEY = 'ttchop_tiktok_oauth_state';

export interface TikTokAccount {
  openId: string;
  displayName: string;
  avatarUrl: string;
  connectedAt: string;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Builds the TikTok authorize URL and stashes a fresh CSRF `state` in sessionStorage. */
export function buildTikTokAuthorizeUrl(): string {
  const state = randomState();
  sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: 'user.info.basic,video.upload',
    response_type: 'code',
    redirect_uri: TIKTOK_REDIRECT_URI,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

/** Checks the `state` returned by TikTok against the one we stashed, then clears it (one-time use). */
export function consumeTikTokOAuthState(receivedState: string | null): boolean {
  const saved = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
  return Boolean(saved) && Boolean(receivedState) && saved === receivedState;
}

function extractErrorMessage(json: unknown): string {
  if (json && typeof json === 'object' && 'error' in json) {
    const value = (json as { error?: unknown }).error;
    if (typeof value === 'string') return value;
  }
  return 'Something went wrong talking to the server.';
}

async function callFunction<T>(name: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('You need to sign in again.');
  const idToken = await user.getIdToken();
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(extractErrorMessage(json));
  }
  return json as T;
}

export interface TikTokExchangeResult {
  openId: string;
  displayName: string;
  avatarUrl: string;
}

export async function exchangeTikTokCode(code: string): Promise<TikTokExchangeResult> {
  return callFunction<TikTokExchangeResult>('tiktokExchange', {
    body: { code, redirectUri: TIKTOK_REDIRECT_URI },
  });
}

export async function getTikTokAccounts(): Promise<TikTokAccount[]> {
  const result = await callFunction<{ accounts: TikTokAccount[] }>('tiktokAccounts', { method: 'GET' });
  return result.accounts;
}

export async function disconnectTikTokAccount(openId: string): Promise<void> {
  await callFunction<{ ok: boolean }>('tiktokDisconnect', { body: { openId } });
}

export async function uploadRenderToTikTok(renderId: string, openId: string): Promise<{ publishId: string }> {
  return callFunction<{ publishId: string }>('tiktokUpload', { body: { renderId, openId } });
}
