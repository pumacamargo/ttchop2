importScripts('firebase-config.js');

const AUTH_KEY = 'ttchop_auth';
const TIKTOK_ACCOUNTS_URL = 'https://us-central1-ttchop2.cloudfunctions.net/tiktokAccounts';

async function getStoredAuth() {
  const data = await chrome.storage.local.get(AUTH_KEY);
  return data[AUTH_KEY] || null;
}

async function setStoredAuth(auth) {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

async function clearStoredAuth() {
  await chrome.storage.local.remove(AUTH_KEY);
}

async function signIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Error al iniciar sesion');

  const auth = {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    uid: data.localId,
    email: data.email,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000
  };
  await setStoredAuth(auth);
  return auth;
}

async function refreshIdToken(auth) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo refrescar la sesion');

  const updated = {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    uid: data.user_id,
    email: auth.email,
    expiresAt: Date.now() + Number(data.expires_in) * 1000
  };
  await setStoredAuth(updated);
  return updated;
}

async function getValidAuth() {
  let auth = await getStoredAuth();
  if (!auth) return null;
  if (Date.now() > auth.expiresAt - 60000) {
    auth = await refreshIdToken(auth);
  }
  return auth;
}

function toFirestoreFields(product) {
  const fields = {
    id: { stringValue: product.id },
    userId: { stringValue: product.userId },
    name: { stringValue: product.name },
    description: { stringValue: product.description },
    modelSheetUrls: {
      arrayValue: { values: product.modelSheetUrls.map(url => ({ stringValue: url })) }
    },
    videos: { arrayValue: { values: [] } },
    createdAt: { stringValue: product.createdAt }
  };
  if (product.region) fields.region = { stringValue: product.region };
  if (product.sourceId) fields.sourceId = { stringValue: product.sourceId };
  if (product.sourceUrl) fields.sourceUrl = { stringValue: product.sourceUrl };
  if (product.scrapedAt) fields.scrapedAt = { stringValue: product.scrapedAt };
  // accountId solo se escribe si hay un contenedor de cuenta elegido: el
  // contenedor "General" se representa como AUSENCIA del campo, nunca ''.
  if (product.accountId) fields.accountId = { stringValue: product.accountId };
  return fields;
}

// Cuentas de TikTok conectadas (sin datos sensibles), vía Cloud Function.
// Se usa para ofrecer el selector de contenedor al importar.
async function fetchTikTokAccounts(auth) {
  const res = await fetch(TIKTOK_ACCOUNTS_URL, {
    headers: { Authorization: `Bearer ${auth.idToken}` }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Error al obtener las cuentas (${res.status})`);
  }
  const data = await res.json();
  return data.accounts || [];
}

async function findExistingProductBySourceId(auth, sourceId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.idToken}`
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'products' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'userId' },
                  op: 'EQUAL',
                  value: { stringValue: auth.uid }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'sourceId' },
                  op: 'EQUAL',
                  value: { stringValue: sourceId }
                }
              }
            ]
          }
        },
        limit: 1
      }
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Error al buscar el producto (${res.status})`);
  }

  const rows = await res.json();
  const found = rows.find(r => r.document);
  return found ? found.document : null;
}

// Extrae el id de "products/{prodId}" del `name` que devuelve Firestore.
function docIdFromName(docName) {
  const parts = docName.split('/');
  return parts[parts.length - 1];
}

async function updateProduct(auth, prodId, scraped) {
  const updated = {
    id: prodId,
    userId: auth.uid,
    name: scraped.name,
    description: scraped.description,
    modelSheetUrls: scraped.modelSheetUrls,
    region: scraped.regionCode || null,
    sourceId: scraped.sourceId || null,
    sourceUrl: scraped.sourceUrl || null,
    accountId: scraped.accountId || null,
    scrapedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // accountId va en el mask aunque venga vacío: así, si el producto ya
  // existía y se re-scrapea eligiendo otro contenedor (o "General"), el
  // campo se actualiza o se borra del documento en vez de quedar viejo.
  const fieldsToUpdate = ['name', 'description', 'modelSheetUrls', 'region', 'sourceId', 'sourceUrl', 'accountId', 'scrapedAt', 'updatedAt'];
  const mask = fieldsToUpdate.map(f => `updateMask.fieldPaths=${f}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/products/${prodId}?${mask}`;

  const allFields = toFirestoreFields({ ...updated, createdAt: '' });
  const fields = {};
  for (const f of fieldsToUpdate) fields[f] = allFields[f];

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.idToken}`
    },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Error al actualizar el producto (${res.status})`);
  }

  return { ...updated, replaced: true };
}

async function createProduct(auth, scraped) {
  if (scraped.sourceId) {
    const existing = await findExistingProductBySourceId(auth, scraped.sourceId);
    if (existing) {
      const prodId = docIdFromName(existing.name);
      return updateProduct(auth, prodId, scraped);
    }
  }

  const prodId = `prod_${Math.random().toString(36).substring(2, 9)}`;
  const product = {
    id: prodId,
    userId: auth.uid,
    name: scraped.name,
    description: scraped.description,
    modelSheetUrls: scraped.modelSheetUrls,
    region: scraped.regionCode || null,
    sourceId: scraped.sourceId || null,
    sourceUrl: scraped.sourceUrl || null,
    accountId: scraped.accountId || null,
    scrapedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/products?documentId=${prodId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.idToken}`
    },
    body: JSON.stringify({ fields: toFirestoreFields(product) })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Error al crear el producto (${res.status})`);
  }

  return { ...product, replaced: false };
}

// Estadísticas de videos publicados, capturadas desde TikTok Studio.
// Un doc por video (`{userId}_{itemId}`): cada guardado SOBRESCRIBE el
// documento entero con el dato más fresco (los contadores cambian con el
// tiempo, no queremos historial acá, sino la última foto).
const TIKTOK_VIDEOS_COMMIT_BATCH_SIZE = 400; // margen bajo el límite de 500 writes por :commit

// Mismas reglas de normalización que en studio-content.js: sin arroba, sin espacios, en
// minúsculas. El handle es el dato duradero que dice de qué cuenta son estos videos — se
// valida acá también (no solo en el content script) porque este es el único lugar que
// efectivamente escribe en Firestore.
function normalizeTikTokUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();
}

function toVideoStatsFields(auth, item, accountId, tiktokUsername) {
  const fields = {
    userId: { stringValue: auth.uid },
    itemId: { stringValue: item.itemId },
    tiktokUsername: { stringValue: tiktokUsername },
    playCount: { integerValue: String(item.playCount || 0) },
    likeCount: { integerValue: String(item.likeCount || 0) },
    commentCount: { integerValue: String(item.commentCount || 0) },
    shareCount: { integerValue: String(item.shareCount || 0) },
    favoriteCount: { integerValue: String(item.favoriteCount || 0) },
    durationMs: { integerValue: String(item.durationMs || 0) },
    desc: { stringValue: item.desc || '' },
    coverUrl: { stringValue: item.coverUrl || '' },
    capturedAt: { stringValue: new Date().toISOString() }
  };
  if (item.postedAt) fields.postedAt = { stringValue: item.postedAt };
  // accountId solo se escribe si hay un contenedor de cuenta elegido: el
  // contenedor "General" se representa como AUSENCIA del campo, nunca ''.
  if (accountId) fields.accountId = { stringValue: accountId };
  return fields;
}

async function saveVideoStats(auth, items, accountId, tiktokUsername) {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const documentsBase = `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
  const writes = items
    .filter(item => item && item.itemId)
    .map(item => ({
      update: {
        name: `${documentsBase}/tiktok_videos/${auth.uid}_${item.itemId}`,
        fields: toVideoStatsFields(auth, item, accountId, tiktokUsername)
      }
    }));

  let saved = 0;
  for (let i = 0; i < writes.length; i += TIKTOK_VIDEOS_COMMIT_BATCH_SIZE) {
    const batch = writes.slice(i, i + TIKTOK_VIDEOS_COMMIT_BATCH_SIZE);
    const res = await fetch(`https://firestore.googleapis.com/v1/${documentsBase}:commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.idToken}`
      },
      body: JSON.stringify({ writes: batch })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message || `Error al guardar las estadisticas (${res.status})`);
    }
    saved += batch.length;
  }
  return saved;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'LOGIN') {
        const auth = await signIn(message.email, message.password);
        sendResponse({ ok: true, email: auth.email });
      } else if (message.type === 'LOGOUT') {
        await clearStoredAuth();
        sendResponse({ ok: true });
      } else if (message.type === 'GET_SESSION') {
        const auth = await getStoredAuth();
        sendResponse({ ok: true, email: auth?.email || null });
      } else if (message.type === 'GET_ACCOUNTS') {
        const auth = await getValidAuth();
        if (!auth) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }
        const accounts = await fetchTikTokAccounts(auth);
        sendResponse({ ok: true, accounts });
      } else if (message.type === 'CREATE_PRODUCT') {
        const auth = await getValidAuth();
        if (!auth) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }
        const product = await createProduct(auth, message.product);
        sendResponse({ ok: true, product });
      } else if (message.type === 'SAVE_VIDEO_STATS') {
        const auth = await getValidAuth();
        if (!auth) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }
        // El handle es el punto de todo el cambio: sin él, un video guardado queda igual de
        // "huérfano" que los 50 de @arts.choice que motivaron esto. Se rechaza el guardado
        // completo en vez de guardar con un campo vacío.
        const tiktokUsername = normalizeTikTokUsername(message.tiktokUsername);
        if (!tiktokUsername) {
          sendResponse({ ok: false, error: 'MISSING_USERNAME' });
          return;
        }
        const saved = await saveVideoStats(auth, message.items, message.accountId, tiktokUsername);
        sendResponse({ ok: true, saved });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // respuesta async
});
