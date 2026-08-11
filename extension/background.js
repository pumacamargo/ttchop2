importScripts('firebase-config.js');

const AUTH_KEY = 'ttchop_auth';

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
  return fields;
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
    scrapedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const fieldsToUpdate = ['name', 'description', 'modelSheetUrls', 'region', 'sourceId', 'sourceUrl', 'scrapedAt', 'updatedAt'];
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
      } else if (message.type === 'CREATE_PRODUCT') {
        const auth = await getValidAuth();
        if (!auth) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }
        const product = await createProduct(auth, message.product);
        sendResponse({ ok: true, product });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // respuesta async
});
