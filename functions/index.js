const functions = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

const REGION_LABELS = { jp: 'Japan', mx: 'Mexico' };

// ── TikTok integration (Phase 6) ────────────────────────────────────────────
// The client secret lives ONLY here (Secret Manager, via defineSecret) — it never
// reaches the frontend bundle. The client key is public by design (it travels in the
// authorize URL) so it's safe to hardcode; it must match VITE_TIKTOK_CLIENT_KEY.
const TIKTOK_CLIENT_SECRET = defineSecret('TIKTOK_CLIENT_SECRET');
const TIKTOK_CLIENT_KEY = 'sbaw16c6l5vcoee1i0';
const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const ALLOWED_ORIGINS = ['https://ttchop2.web.app', 'http://localhost:5173'];

// Every TikTok function verifies the caller's Firebase ID token and derives userId from
// it — the body/query userId is never trusted, otherwise anyone could act on someone
// else's connected TikTok account.
async function verifyAuth(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Missing Authorization header.');
    err.statusCode = 401;
    throw err;
  }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch (e) {
    const err = new Error('Invalid or expired session — please sign in again.');
    err.statusCode = 401;
    throw err;
  }
}

function tiktokAccountDocId(userId, openId) {
  return `${userId}_${openId}`;
}

// TikTok's OAuth endpoint returns OAuth2-style errors ({error, error_description}); its
// other v2 endpoints wrap everything in {data, error: {code, message}} where code is
// the string 'ok' on success. This normalizes both shapes into a human message.
function describeTikTokError(json) {
  if (!json) return null;
  if (typeof json.error === 'string') {
    return json.error_description || json.error;
  }
  if (json.error && typeof json.error === 'object' && json.error.code && json.error.code !== 'ok') {
    return json.error.message || json.error.code;
  }
  return null;
}

async function tiktokTokenRequest(params) {
  const body = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET.value(),
    ...params,
  });
  const res = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || describeTikTokError(json)) {
    throw new Error(describeTikTokError(json) || `TikTok token request failed (${res.status}).`);
  }
  return json; // { access_token, expires_in, refresh_token, refresh_expires_in, open_id, scope }
}

// Returns a valid access token for this account, refreshing (and persisting the refresh)
// if the current one is expired or about to expire.
async function getValidAccessToken(accountSnap) {
  const data = accountSnap.data();
  const now = Date.now();
  if (data.expiresAt && data.expiresAt > now + 60000) {
    return data.accessToken;
  }
  if (data.refreshExpiresAt && data.refreshExpiresAt <= now) {
    const err = new Error('Your TikTok session expired — reconnect the account.');
    err.statusCode = 409;
    throw err;
  }
  const refreshed = await tiktokTokenRequest({ grant_type: 'refresh_token', refresh_token: data.refreshToken });
  const updated = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: now + refreshed.expires_in * 1000,
    refreshExpiresAt: now + refreshed.refresh_expires_in * 1000,
    scope: refreshed.scope || data.scope,
  };
  await accountSnap.ref.update(updated);
  return updated.accessToken;
}

function sendError(res, err, fallbackMessage) {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || fallbackMessage });
}

// Exchanges an OAuth `code` for tokens, fetches the TikTok user's public profile, and
// stores everything (including the tokens) server-side. Only non-sensitive fields are
// returned to the client.
exports.tiktokExchange = functions.https.onRequest(
  { cors: ALLOWED_ORIGINS, secrets: [TIKTOK_CLIENT_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }
    try {
      const userId = await verifyAuth(req);
      const { code, redirectUri } = req.body || {};
      if (!code || !redirectUri) { res.status(400).json({ error: 'Missing code or redirectUri.' }); return; }

      const tokenData = await tiktokTokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
      const { access_token, refresh_token, expires_in, refresh_expires_in, open_id, scope } = tokenData;
      if (!access_token || !open_id) throw new Error('TikTok did not return a valid token.');

      const userInfoRes = await fetch(`${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,display_name,avatar_url`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userInfoJson = await userInfoRes.json().catch(() => ({}));
      if (!userInfoRes.ok || describeTikTokError(userInfoJson)) {
        throw new Error(describeTikTokError(userInfoJson) || 'Could not read the TikTok account profile.');
      }
      const info = userInfoJson.data?.user || {};

      const now = Date.now();
      const docId = tiktokAccountDocId(userId, open_id);
      await db.collection('tiktok_accounts').doc(docId).set({
        userId,
        openId: open_id,
        displayName: info.display_name || '',
        avatarUrl: info.avatar_url || '',
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: now + expires_in * 1000,
        refreshExpiresAt: now + refresh_expires_in * 1000,
        scope: scope || '',
        connectedAt: new Date().toISOString(),
      }, { merge: true });

      res.status(200).json({ openId: open_id, displayName: info.display_name || '', avatarUrl: info.avatar_url || '' });
    } catch (err) {
      sendError(res, err, 'Could not connect the TikTok account.');
    }
  }
);

// Returns the caller's connected TikTok accounts WITHOUT tokens — the client never
// reads tiktok_accounts directly (Firestore rules deny it outright).
exports.tiktokAccounts = functions.https.onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
  try {
    const userId = await verifyAuth(req);
    const snap = await db.collection('tiktok_accounts').where('userId', '==', userId).get();
    const accounts = snap.docs.map(d => {
      const data = d.data();
      return { openId: data.openId, displayName: data.displayName, avatarUrl: data.avatarUrl, connectedAt: data.connectedAt };
    });
    res.status(200).json({ accounts });
  } catch (err) {
    sendError(res, err, 'Could not load TikTok accounts.');
  }
});

exports.tiktokDisconnect = functions.https.onRequest({ cors: ALLOWED_ORIGINS }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }
  try {
    const userId = await verifyAuth(req);
    const { openId } = req.body || {};
    if (!openId) { res.status(400).json({ error: 'Missing openId.' }); return; }
    await db.collection('tiktok_accounts').doc(tiktokAccountDocId(userId, openId)).delete();
    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Could not disconnect the TikTok account.');
  }
});

// Downloads the render's video from Storage and uploads it to the TikTok drafts inbox
// (FILE_UPLOAD — PULL_FROM_URL would require a verified domain, which firebasestorage.app
// is not). Verifies the render belongs to the caller before touching anything.
exports.tiktokUpload = functions.https.onRequest(
  { cors: ALLOWED_ORIGINS, secrets: [TIKTOK_CLIENT_SECRET], timeoutSeconds: 300, memory: '1GiB' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return; }
    try {
      const userId = await verifyAuth(req);
      const { renderId, openId } = req.body || {};
      if (!renderId || !openId) { res.status(400).json({ error: 'Missing renderId or openId.' }); return; }

      const renderRef = db.collection('renders').doc(renderId);
      const renderSnap = await renderRef.get();
      if (!renderSnap.exists) { res.status(404).json({ error: 'Render not found.' }); return; }
      const render = renderSnap.data();
      if (render.userId !== userId) { res.status(403).json({ error: 'You do not have access to this render.' }); return; }
      if (!render.videoUrl) { res.status(400).json({ error: 'This render has no finished video yet.' }); return; }

      const accountRef = db.collection('tiktok_accounts').doc(tiktokAccountDocId(userId, openId));
      const accountSnap = await accountRef.get();
      if (!accountSnap.exists) { res.status(404).json({ error: 'That TikTok account is not connected.' }); return; }

      const accessToken = await getValidAccessToken(accountSnap);

      const videoRes = await fetch(render.videoUrl);
      if (!videoRes.ok) throw new Error('Could not download the video from Storage.');
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      const videoSize = videoBuffer.length;

      const initRes = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          source_info: { source: 'FILE_UPLOAD', video_size: videoSize, chunk_size: videoSize, total_chunk_count: 1 },
        }),
      });
      const initJson = await initRes.json().catch(() => ({}));
      if (!initRes.ok || describeTikTokError(initJson)) {
        throw new Error(describeTikTokError(initJson) || 'TikTok rejected the upload request.');
      }
      const { publish_id, upload_url } = initJson.data || {};
      if (!publish_id || !upload_url) throw new Error('TikTok did not return an upload URL.');

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}` },
        body: videoBuffer,
      });
      if (!putRes.ok) throw new Error(`Uploading the video to TikTok failed (${putRes.status}).`);

      await renderRef.update({
        tiktokPublishId: publish_id,
        tiktokUploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      res.status(200).json({ publishId: publish_id });
    } catch (err) {
      sendError(res, err, 'Could not upload the video to TikTok.');
    }
  }
);

exports.productPage = functions.https.onRequest(async (req, res) => {
  // Extract product ID from path: /p/prod_xxx
  const match = req.path.match(/^\/p\/([^/]+)/);
  const productId = match ? match[1] : req.query.id;

  if (!productId) {
    res.status(400).send('<h1>Missing product ID</h1>');
    return;
  }

  try {
    const snap = await db.collection('products').doc(productId).get();
    if (!snap.exists) {
      res.status(404).send('<h1>Product not found</h1>');
      return;
    }

    const p = snap.data();
    const region = p.region && REGION_LABELS[p.region] ? REGION_LABELS[p.region] : null;
    const images = (p.modelSheetUrls || []).map(url =>
      `<img src="${url}" alt="${esc(p.name)}" style="width:100%;border-radius:10px;border:1px solid #222;display:block;">`
    ).join('');

    const imageGrid = p.modelSheetUrls?.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">${images}</div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(p.name)} — TTChop</title>
  <meta name="description" content="${esc(p.description || p.name)}">
  <!-- Mismo icono que la app de TikTok y que el resto del sitio. -->
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#050507">
  <meta property="og:title" content="${esc(p.name)} — TTChop">
  <meta property="og:image" content="https://ttchop2.web.app/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0b0f19;color:#f3f4f6;font-family:'Inter',system-ui,sans-serif;padding:2rem 1rem;min-height:100vh}
    .card{max-width:680px;margin:0 auto;background:rgba(17,24,39,0.9);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:1.75rem;display:flex;flex-direction:column;gap:1.5rem}
    .header{display:flex;align-items:center;gap:.5rem;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:1rem}
    .logo{width:32px;height:32px;object-fit:contain;display:block;flex-shrink:0}
    .region{display:inline-block;font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#06b6d4;background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.25);border-radius:4px;padding:2px 8px}
    h1{font-size:1.5rem;font-weight:700;line-height:1.3;color:#f3f4f6}
    p.desc{color:#9ca3af;font-size:.9rem;line-height:1.6;white-space:pre-wrap}
    .label{color:#6b7280;font-size:.72rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:.75rem}
    .footer{color:#4b5563;font-size:.75rem;text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:1rem}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img class="logo" src="/logo/logo-mark.png" alt="TTChop">
      <span style="color:#f3f4f6;font-weight:700;font-size:1rem">TTChop</span>
    </div>
    <div>
      ${region ? `<span class="region">${region}</span><br><br>` : ''}
      <h1>${esc(p.name)}</h1>
      ${p.description ? `<br><p class="desc">${esc(p.description)}</p>` : ''}
    </div>
    ${imageGrid ? `<div><p class="label">Product Images (${p.modelSheetUrls.length})</p>${imageGrid}</div>` : ''}
    <p class="footer">Shared via TTChop · AI Video Studio</p>
  </div>
</body>
</html>`;

    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('<h1>Error loading product</h1>');
  }
});

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
