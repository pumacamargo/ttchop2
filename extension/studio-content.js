// Content script aislado para TikTok Studio (https://www.tiktok.com/tiktokstudio/*).
// Escucha lo que captura studio-interceptor.js (world MAIN) via postMessage,
// normaliza y acumula los videos SIN duplicar por item_id, y muestra un panel
// flotante para guardarlos en Firestore.

const STUDIO_ACCOUNTS_CACHE_KEY = 'ttchop_accounts_cache';
const STUDIO_ACCOUNTS_CACHE_TTL_MS = 5 * 60 * 1000;
const STUDIO_LAST_CONTAINER_KEY = 'ttchop_last_container_studio';
const STUDIO_MANUAL_HANDLE_KEY = 'ttchop_manual_handle';

// item_id -> item normalizado. Un Map por item_id ya resuelve la deduplicación:
// si TikTok vuelve a pedir una página que ya vimos (scroll hacia arriba, retry),
// simplemente se pisa la entrada con los datos más frescos.
const capturedItems = new Map();

let accountsPromise = null;
let saving = false;

// --- Handle de TikTok: el dato duradero que acompaña cada captura ------------------------
// Cascada de detección: a) tráfico de la API (studio-interceptor.js) → b) estado embebido en
// el HTML inicial → c) el usuario lo escribe a mano. `detectedHandle` es lo que encontramos
// automáticamente (a o b); `manualHandle` es lo que el usuario tipeó (persistido para la
// próxima vez). El handle efectivo es siempre detectedHandle si existe, si no manualHandle.
let detectedHandle = null;
let manualHandle = '';
let handleBoxMode = null; // 'detected' | 'manual' — controla cuándo se reconstruye el input
let manualHandlePersistTimer = null;

function normalizeHandle(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();
}

function isPlausibleHandle(value) {
  return typeof value === 'string' && /^(?=.*[a-zA-Z])[a-zA-Z0-9_.]{2,24}$/.test(value);
}

// Copia deliberada de la misma búsqueda acotada de studio-interceptor.js: corre en el mundo
// aislado (no comparte variables con el mundo MAIN), así que no hay forma de reusar la función
// sin un mecanismo de módulos que esta extensión no usa.
function findHandleInObject(obj, budget) {
  if (!obj || typeof obj !== 'object' || budget.count <= 0) return null;
  budget.count--;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length && i < 20; i++) {
      const foundInArray = findHandleInObject(obj[i], budget);
      if (foundInArray) return foundInArray;
      if (budget.count <= 0) return null;
    }
    return null;
  }

  const directKeys = ['unique_id', 'uniqueId', 'username'];
  for (const k of directKeys) {
    if (isPlausibleHandle(obj[k])) return obj[k];
  }

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (val && typeof val === 'object') {
      const found = findHandleInObject(val, budget);
      if (found) return found;
    }
    if (budget.count <= 0) return null;
  }
  return null;
}

// Paso b) de la cascada: TikTok mete el estado inicial de la página en un <script> con el
// JSON completo de la hidratación. Si el paso a) (tráfico de la API) todavía no encontró nada,
// probamos leerlo directo del HTML.
function extractHandleFromEmbeddedState() {
  try {
    const selectors = [
      '#__UNIVERSAL_DATA_FOR_REHYDRATION__',
      'script[id*="UNIVERSAL_DATA"]',
      'script#__NEXT_DATA__',
      'script[id*="NEXT_DATA"]',
    ];
    for (const selector of selectors) {
      const script = document.querySelector(selector);
      if (script && script.textContent) {
        const data = JSON.parse(script.textContent);
        const handle = findHandleInObject(data, { count: 800 });
        if (handle) return handle;
      }
    }
  } catch (e) {
    // La página sigue funcionando igual si esto falla; simplemente caemos al siguiente paso.
  }
  return null;
}

function setDetectedHandle(rawHandle) {
  const normalized = normalizeHandle(rawHandle);
  if (!normalized || normalized === detectedHandle) return;
  detectedHandle = normalized;
  renderPanel();
}

function effectiveHandle() {
  return detectedHandle || normalizeHandle(manualHandle);
}

function persistManualHandle() {
  if (manualHandlePersistTimer) clearTimeout(manualHandlePersistTimer);
  manualHandlePersistTimer = setTimeout(() => {
    chrome.storage.local.set({ [STUDIO_MANUAL_HANDLE_KEY]: normalizeHandle(manualHandle) }).catch(() => {});
  }, 400);
}

function onHandleInputChange(e) {
  manualHandle = e.target.value;
  persistManualHandle();
  renderPanel();
}

// `displayName` y el handle son campos distintos de TikTok y no siempre coinciden — esto es
// solo una comparación laxa para un aviso, nunca un bloqueo.
function looksLikeSameAccount(displayName, handle) {
  const a = (displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = (handle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return true;
  return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

// Normaliza un item crudo de item_list al modelo que espera background.js.
// Trampas conocidas: los contadores llegan como string, post_time está en
// SEGUNDOS (hay que *1000 para un Date), y duration ya viene en milisegundos.
function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemId = raw.item_id !== undefined && raw.item_id !== null ? String(raw.item_id) : '';
  if (!itemId) return null;

  const postTimeSec = toInt(raw.post_time !== undefined ? raw.post_time : raw.create_time);
  const coverUrl = Array.isArray(raw.cover_url) && raw.cover_url.length > 0 ? raw.cover_url[0] : '';

  return {
    itemId,
    playCount: toInt(raw.play_count),
    likeCount: toInt(raw.like_count),
    commentCount: toInt(raw.comment_count),
    shareCount: toInt(raw.share_count),
    favoriteCount: toInt(raw.favorite_count),
    postedAt: postTimeSec ? new Date(postTimeSec * 1000).toISOString() : null,
    durationMs: toInt(raw.duration),
    desc: typeof raw.desc === 'string' ? raw.desc : '',
    coverUrl: typeof coverUrl === 'string' ? coverUrl : ''
  };
}

function handlePayload(payload) {
  if (!payload || !Array.isArray(payload.item_list)) return; // forma inesperada: se ignora, no rompe nada.
  let added = 0;
  for (const raw of payload.item_list) {
    const item = normalizeItem(raw);
    if (!item) continue;
    capturedItems.set(item.itemId, item);
    added++;
  }
  if (added > 0) renderPanel();
}

window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (!event.data) return;
  try {
    if (event.data.source === 'ttchop-studio') {
      handlePayload(event.data.payload);
    } else if (event.data.source === 'ttchop-studio-user') {
      setDetectedHandle(event.data.payload && event.data.payload.handle);
    }
  } catch (e) {
    // Nunca romper la página de TikTok por un error de nuestro lado.
  }
});

// --- Cuentas conectadas (mismo patrón/caché que content.js para importar productos) ---

async function fetchAccounts() {
  const cached = (await chrome.storage.local.get(STUDIO_ACCOUNTS_CACHE_KEY))[STUDIO_ACCOUNTS_CACHE_KEY];
  if (cached && Date.now() - cached.at < STUDIO_ACCOUNTS_CACHE_TTL_MS) {
    return { accounts: cached.accounts, failed: false };
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
    if (res && res.ok) {
      const accounts = res.accounts || [];
      await chrome.storage.local.set({ [STUDIO_ACCOUNTS_CACHE_KEY]: { at: Date.now(), accounts } });
      return { accounts, failed: false };
    }
    const failed = !!(res && res.error && res.error !== 'NOT_LOGGED_IN');
    return { accounts: [], failed };
  } catch {
    return { accounts: [], failed: true };
  }
}

function loadAccounts() {
  if (!accountsPromise) accountsPromise = fetchAccounts();
  return accountsPromise;
}

async function getLastContainer() {
  const data = await chrome.storage.local.get(STUDIO_LAST_CONTAINER_KEY);
  return data[STUDIO_LAST_CONTAINER_KEY] || { accountId: '' };
}

async function saveLastContainer(accountId) {
  await chrome.storage.local.set({ [STUDIO_LAST_CONTAINER_KEY]: { accountId: accountId || '' } });
}

// --- Panel flotante ---

const PANEL_ID = 'ttchop-studio-panel';
let panelState = { status: 'idle', message: '', savedCount: 0 }; // idle | saving | success | error
let accountsCache = { accounts: [], failed: false, loaded: false };

function styleEl(el, css) {
  el.style.cssText = `all: initial; display: block; font-family: system-ui, sans-serif; ${css}`;
}

function buildPanel() {
  document.getElementById(PANEL_ID)?.remove();

  const root = document.createElement('div');
  root.id = PANEL_ID;
  root.style.cssText = `
    all: initial;
    position: fixed;
    z-index: 2147483647;
    bottom: 24px;
    right: 24px;
    display: block;
    background: #0f172a;
    color: #f1f5f9;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 14px;
    width: 260px;
    font-family: system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  `;

  const title = document.createElement('div');
  title.textContent = 'TTChop2 — Estadísticas';
  styleEl(title, 'font-size: 13px; font-weight: 600; color: #f1f5f9; margin-bottom: 8px;');
  root.appendChild(title);

  const count = document.createElement('div');
  count.id = 'ttchop-studio-count';
  styleEl(count, 'font-size: 13px; color: #f1f5f9; margin-bottom: 4px;');
  root.appendChild(count);

  const hint = document.createElement('div');
  hint.textContent = 'Hacé scroll en la lista de videos para cargar más.';
  styleEl(hint, 'font-size: 11px; color: #94a3b8; margin-bottom: 10px;');
  root.appendChild(hint);

  const handleBox = document.createElement('div');
  handleBox.id = 'ttchop-studio-handle';
  styleEl(handleBox, 'margin-bottom: 10px;');
  root.appendChild(handleBox);
  handleBoxMode = null; // fuerza reconstruir el contenido la próxima vez que se renderice

  const accountsBox = document.createElement('div');
  accountsBox.id = 'ttchop-studio-accounts';
  styleEl(accountsBox, 'margin-bottom: 10px;');
  root.appendChild(accountsBox);

  const saveBtn = document.createElement('button');
  saveBtn.id = 'ttchop-studio-save-btn';
  saveBtn.textContent = 'Guardar en TTChop2';
  saveBtn.style.cssText = `
    all: initial;
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 8px;
    border-radius: 6px;
    border: none;
    background: #6366f1;
    color: #fff;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    text-align: center;
    cursor: pointer;
  `;
  saveBtn.addEventListener('click', onSaveClick);
  root.appendChild(saveBtn);

  const status = document.createElement('div');
  status.id = 'ttchop-studio-status';
  styleEl(status, 'font-size: 12px; margin-top: 8px;');
  root.appendChild(status);

  document.body.appendChild(root);
  return root;
}

function currentSelectedAccountId() {
  const select = document.getElementById('ttchop-studio-account-select');
  return select ? select.value : '';
}

function renderAccountsBox(box) {
  box.innerHTML = '';
  if (!accountsCache.loaded || accountsCache.accounts.length === 0) return;

  const label = document.createElement('label');
  styleEl(label, 'font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;');
  label.textContent = 'Guardar en:';
  box.appendChild(label);

  const select = document.createElement('select');
  select.id = 'ttchop-studio-account-select';
  select.style.cssText = `
    all: initial;
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 6px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #f1f5f9;
    font-family: system-ui, sans-serif;
    font-size: 12px;
  `;

  const options = [{ value: '', label: 'General (compartido)' }].concat(
    accountsCache.accounts.map(a => ({ value: a.openId, label: a.displayName || a.openId }))
  );
  options.forEach(opt => {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
  });

  getLastContainer().then(last => {
    const value = last.accountId || '';
    if (options.some(o => o.value === value)) select.value = value;
  });

  select.addEventListener('change', () => {
    saveLastContainer(select.value);
    renderMismatchWarning();
  });

  box.appendChild(select);

  const warning = document.createElement('div');
  warning.id = 'ttchop-studio-mismatch-warning';
  box.appendChild(warning);
  renderMismatchWarning();
}

// Aviso NO bloqueante: displayName y el handle son campos distintos de TikTok y no siempre
// coinciden, así que esto solo ayuda a detectar a tiempo si el selector apunta a otra cuenta.
function renderMismatchWarning() {
  const warning = document.getElementById('ttchop-studio-mismatch-warning');
  if (!warning) return;
  warning.textContent = '';
  warning.style.cssText = 'all: initial; display: none;';

  const handle = effectiveHandle();
  const selectedId = currentSelectedAccountId();
  if (!handle || !selectedId) return;

  const account = accountsCache.accounts.find(a => a.openId === selectedId);
  if (!account || looksLikeSameAccount(account.displayName, handle)) return;

  styleEl(warning, 'font-size: 11px; color: #fbbf24; margin-top: 6px; line-height: 1.4;');
  warning.textContent = `⚠ "${account.displayName}" y @${handle} podrían no ser la misma cuenta.`;
}

function renderHandleBox(container) {
  const mode = detectedHandle ? 'detected' : 'manual';

  if (handleBoxMode !== mode) {
    container.innerHTML = '';
    handleBoxMode = mode;

    if (mode === 'manual') {
      const label = document.createElement('label');
      styleEl(label, 'font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px; line-height: 1.4;');
      label.textContent = 'No detectamos la cuenta automáticamente. Escribí el @usuario de TikTok para saber siempre de quién son estos datos:';
      container.appendChild(label);

      const input = document.createElement('input');
      input.id = 'ttchop-studio-handle-input';
      input.type = 'text';
      input.placeholder = '@tu.usuario';
      input.value = manualHandle;
      input.autocomplete = 'off';
      input.style.cssText = `
        all: initial;
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        margin-bottom: 6px;
        border-radius: 6px;
        border: 1px solid #334155;
        background: #1e293b;
        color: #f1f5f9;
        font-family: system-ui, sans-serif;
        font-size: 12px;
      `;
      input.addEventListener('input', onHandleInputChange);
      container.appendChild(input);
    }

    const targetLine = document.createElement('div');
    targetLine.id = 'ttchop-studio-target-line';
    styleEl(targetLine, 'font-size: 12px; margin-top: 2px;');
    container.appendChild(targetLine);
  }

  // El input no se recrea en cada render (perdería el foco/cursor mientras el usuario tipea),
  // pero sí puede necesitar sincronizarse con manualHandle cuando ese valor cambió por otra vía
  // (p. ej. todavía se estaba cargando desde chrome.storage cuando se hizo el primer render).
  const input = document.getElementById('ttchop-studio-handle-input');
  if (input && document.activeElement !== input && input.value !== manualHandle) {
    input.value = manualHandle;
  }

  const targetLine = document.getElementById('ttchop-studio-target-line');
  if (!targetLine) return;
  targetLine.innerHTML = '';
  const handle = effectiveHandle();
  if (handle) {
    targetLine.style.color = '#94a3b8';
    targetLine.textContent = 'Se va a guardar en la cuenta: ';
    const strong = document.createElement('strong');
    strong.style.color = '#6ee7b7';
    strong.textContent = `@${handle}`;
    targetLine.appendChild(strong);
  } else {
    targetLine.style.color = '#fca5a5';
    targetLine.textContent = 'Falta el @usuario — no se puede guardar todavía.';
  }
}

function renderStatus(statusEl) {
  statusEl.innerHTML = '';
  if (panelState.status === 'saving') {
    statusEl.textContent = 'Guardando...';
    statusEl.style.color = '#94a3b8';
  } else if (panelState.status === 'success') {
    statusEl.textContent = `Guardado (${panelState.savedCount} videos).`;
    statusEl.style.color = '#6ee7b7';
  } else if (panelState.status === 'error') {
    const msg = document.createElement('div');
    msg.textContent = panelState.message || 'Error al guardar.';
    styleEl(msg, 'color: #fca5a5; font-size: 12px; margin-bottom: 6px;');
    statusEl.appendChild(msg);

    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Reintentar';
    retryBtn.style.cssText = `
      all: initial;
      display: block;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid #334155;
      background: transparent;
      color: #f1f5f9;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      cursor: pointer;
    `;
    retryBtn.addEventListener('click', onSaveClick);
    statusEl.appendChild(retryBtn);
  }
}

function renderPanel() {
  let root = document.getElementById(PANEL_ID);
  if (!root) root = buildPanel();

  const countEl = document.getElementById('ttchop-studio-count');
  if (countEl) countEl.textContent = `${capturedItems.size} video(s) capturado(s).`;

  const handleBox = document.getElementById('ttchop-studio-handle');
  if (handleBox) renderHandleBox(handleBox);

  const saveBtn = document.getElementById('ttchop-studio-save-btn');
  if (saveBtn) {
    // Nunca se puede guardar sin un handle: es el dato duradero que dice de qué cuenta son
    // estos videos, y sin él quedan igual de "huérfanos" que los 50 de @arts.choice.
    saveBtn.disabled = saving || capturedItems.size === 0 || !effectiveHandle();
    saveBtn.style.opacity = saveBtn.disabled ? '0.6' : '1';
    saveBtn.style.cursor = saveBtn.disabled ? 'not-allowed' : 'pointer';
  }

  const accountsBox = document.getElementById('ttchop-studio-accounts');
  if (accountsBox) renderAccountsBox(accountsBox);

  const statusEl = document.getElementById('ttchop-studio-status');
  if (statusEl) renderStatus(statusEl);
}

async function onSaveClick() {
  if (saving) return;
  if (capturedItems.size === 0) return;
  const tiktokUsername = effectiveHandle();
  if (!tiktokUsername) return; // el botón ya debería estar deshabilitado, pero por si acaso.

  saving = true;
  panelState = { status: 'saving', message: '', savedCount: 0 };
  renderPanel();

  const accountId = currentSelectedAccountId();
  const items = Array.from(capturedItems.values());

  try {
    const res = await chrome.runtime.sendMessage({ type: 'SAVE_VIDEO_STATS', items, accountId, tiktokUsername });
    if (res && res.ok) {
      panelState = { status: 'success', message: '', savedCount: res.saved || items.length };
    } else if (res && res.error === 'NOT_LOGGED_IN') {
      panelState = { status: 'error', message: 'Iniciá sesión desde el ícono de la extensión primero.', savedCount: 0 };
    } else if (res && res.error === 'MISSING_USERNAME') {
      panelState = { status: 'error', message: 'Falta el @usuario de la cuenta — escribilo arriba antes de guardar.', savedCount: 0 };
    } else {
      panelState = { status: 'error', message: (res && res.error) || 'Error al guardar las estadísticas.', savedCount: 0 };
    }
  } catch (err) {
    panelState = { status: 'error', message: 'La extensión se actualizó — refrescá esta página e intentá de nuevo.', savedCount: 0 };
  } finally {
    saving = false;
    renderPanel();
  }
}

function init() {
  // Cascada de detección del handle: a) ya lo vio el interceptor de la API (guardado como
  // atributo del DOM, por si su postMessage llegó antes de que este listener existiera) →
  // b) el estado embebido en el HTML inicial de la página → c) queda en manos del usuario.
  const fromApi = normalizeHandle(document.documentElement.getAttribute('data-ttchop-handle'));
  detectedHandle = fromApi || extractHandleFromEmbeddedState();

  chrome.storage.local.get(STUDIO_MANUAL_HANDLE_KEY).then(data => {
    manualHandle = data[STUDIO_MANUAL_HANDLE_KEY] || '';
    renderPanel();
  }).catch(() => {});

  renderPanel();
  loadAccounts().then(result => {
    accountsCache = { accounts: result.accounts, failed: result.failed, loaded: true };
    renderPanel();
  });
}

if (document.body) {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init, { once: true });
}
