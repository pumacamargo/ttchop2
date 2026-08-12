const DESCRIPTION_LABELS = ['Product description', 'Descripción del producto', '商品説明'];

const REGION_LABELS = {
  jp: 'Japón',
  mx: 'México'
};

function findRegion() {
  // La URL canónica de TikTok Shop trae el país como segmento:
  // https://shop.tiktok.com/{region}/pdp/{id}
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
  let match = canonical.match(/shop\.tiktok\.com\/([a-z]{2})\//i);
  if (!match) {
    // Fallback: el link "compartir" trae share_region=JP en el query string.
    match = location.href.match(/[?&]share_region=([a-z]{2})/i);
  }
  const code = match ? match[1].toLowerCase() : null;
  if (!code) return null;
  return { code, label: REGION_LABELS[code] || code.toUpperCase() };
}

function findSourceId() {
  // ID numerico del producto, estable sin importar el formato del link de entrada.
  // Aparece en la URL canonica (.../pdp/{id}) y en la URL renderizada (.../product/{id}).
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
  const fromCanonical = canonical.match(/\/pdp\/(\d+)/);
  if (fromCanonical) return fromCanonical[1];

  const fromLocation = location.href.match(/\/product\/(\d+)/);
  if (fromLocation) return fromLocation[1];

  return null;
}

function findSourceUrl() {
  // URL limpia (sin query params) que apunta a la página del producto scrapeado.
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (canonical) return canonical.split('?')[0].split('#')[0];
  return location.href.split('?')[0].split('#')[0];
}

function findProductData() {
  const h1 = document.querySelector('h1');
  const name = h1 ? h1.textContent.trim() : '';
  if (!name) return null;

  const candidates = Array.from(document.querySelectorAll('img')).filter(
    img => img.alt === name && img.src
  );
  // Todas las fotos de la galería del producto, sin límite.
  const modelSheetUrls = [...new Set(candidates.map(img => img.src))];

  // Todo el texto visible de la página (precio, tienda, rating, ventas,
  // descripción, reseñas, etc.) — no hay campos separados para eso en el
  // modelo de datos de TTChop, así que va todo junto en `description`.
  const description = document.body.innerText
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!name || modelSheetUrls.length === 0) return null;

  const region = findRegion();
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
  const pageUrl = canonical || location.href;
  const sourceUrl = findSourceUrl();

  return {
    name,
    description: description + '\n\nURL: ' + pageUrl,
    modelSheetUrls,
    regionCode: region?.code || null,
    regionLabel: region?.label || null,
    sourceId: findSourceId(),
    sourceUrl
  };
}

const LAST_CONTAINER_KEY = 'ttchop_last_container';

// Las cuentas se piden SOLO cuando el usuario va a importar, nunca al abrir la
// página: precargarlas costaría una invocación de Cloud Function por cada
// producto que se mire, aunque no se importe ninguno.
// Para que eso no se note, el resultado se cachea en chrome.storage con un TTL
// corto — las cuentas conectadas cambian poquísimo, y así el selector abre al
// instante a partir de la segunda importación.
const ACCOUNTS_CACHE_KEY = 'ttchop_accounts_cache';
const ACCOUNTS_CACHE_TTL_MS = 5 * 60 * 1000;

let accountsPromise = null;

async function fetchAccounts() {
  const cached = (await chrome.storage.local.get(ACCOUNTS_CACHE_KEY))[ACCOUNTS_CACHE_KEY];
  if (cached && Date.now() - cached.at < ACCOUNTS_CACHE_TTL_MS) {
    return { accounts: cached.accounts, failed: false };
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
    if (res && res.ok) {
      const accounts = res.accounts || [];
      await chrome.storage.local.set({ [ACCOUNTS_CACHE_KEY]: { at: Date.now(), accounts } });
      return { accounts, failed: false };
    }
    // NOT_LOGGED_IN no es un fallo de red: simplemente no hay cuentas
    // que ofrecer todavía (el login se valida de nuevo al importar).
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
  const data = await chrome.storage.local.get(LAST_CONTAINER_KEY);
  return data[LAST_CONTAINER_KEY] || { accountId: '' };
}

async function saveLastContainer(accountId) {
  await chrome.storage.local.set({ [LAST_CONTAINER_KEY]: { accountId: accountId || '' } });
}

// Selector de contenedor: se dibuja con elementos propios (sin prompt/confirm)
// cerca del botón, con `all: initial` + estilos explícitos para no heredar
// el CSS agresivo de TikTok. Resuelve con { accountId, shortLabel } al
// confirmar, o rechaza si el usuario cancela.
async function pickContainer(accounts) {
  const last = await getLastContainer();

  const options = [{ accountId: '', menuLabel: 'General (compartido)', shortLabel: 'General' }].concat(
    accounts.map(a => ({
      accountId: a.openId,
      menuLabel: a.displayName || a.openId,
      shortLabel: a.displayName || a.openId
    }))
  );

  return new Promise((resolve, reject) => {
    document.getElementById('ttchop-picker')?.remove();

    const root = document.createElement('div');
    root.id = 'ttchop-picker';
    root.style.cssText = `
      all: initial;
      position: fixed;
      z-index: 2147483647;
      bottom: 84px;
      right: 24px;
      display: block;
      background: #0f172a;
      color: #f1f5f9;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 14px;
      width: 240px;
      font-family: system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    `;

    const title = document.createElement('div');
    title.textContent = 'Importar a...';
    title.style.cssText = `
      all: initial;
      display: block;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 10px;
    `;
    root.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = `
      all: initial;
      display: block;
      max-height: 180px;
      overflow-y: auto;
      margin-bottom: 12px;
    `;

    const radios = [];
    options.forEach(opt => {
      const row = document.createElement('label');
      row.style.cssText = `
        all: initial;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 4px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        color: #f1f5f9;
        cursor: pointer;
      `;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'ttchop-container-choice';
      radio.value = opt.accountId;
      radio.style.cssText = 'margin: 0; cursor: pointer;';
      if ((last.accountId || '') === opt.accountId) radio.checked = true;
      radios.push(radio);
      row.appendChild(radio);

      const span = document.createElement('span');
      span.textContent = opt.menuLabel;
      span.style.cssText = `
        all: initial;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        color: #f1f5f9;
      `;
      row.appendChild(span);

      list.appendChild(row);
    });

    // Si el último elegido ya no existe (p. ej. cuenta desconectada), General por defecto.
    if (!radios.some(r => r.checked)) radios[0].checked = true;

    root.appendChild(list);

    const actions = document.createElement('div');
    actions.style.cssText = 'all: initial; display: flex; gap: 8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.style.cssText = `
      all: initial;
      flex: 1;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid #334155;
      background: transparent;
      color: #94a3b8;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      text-align: center;
      cursor: pointer;
    `;

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Importar';
    okBtn.style.cssText = `
      all: initial;
      flex: 1;
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

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    root.appendChild(actions);

    document.body.appendChild(root);

    function cleanup() {
      document.removeEventListener('click', onDocClick, true);
      root.remove();
    }

    function onDocClick(e) {
      if (!root.contains(e.target)) {
        cleanup();
        reject(new Error('cancelled'));
      }
    }
    // setTimeout evita que el mismo click que abrió el selector lo cierre.
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);

    cancelBtn.addEventListener('click', () => {
      cleanup();
      reject(new Error('cancelled'));
    });

    okBtn.addEventListener('click', () => {
      const chosen = radios.find(r => r.checked);
      const value = chosen ? chosen.value : '';
      const opt = options.find(o => o.accountId === value) || options[0];
      cleanup();
      resolve(opt);
    });
  });
}

function showToast(message, kind) {
  let toast = document.getElementById('ttchop-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ttchop-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = kind;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.remove(), 5000);
}

function injectButton() {
  if (document.getElementById('ttchop-import-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ttchop-import-btn';
  btn.textContent = '+ Agregar a TTChop';
  document.body.appendChild(btn);

  btn.addEventListener('click', async () => {
    const product = findProductData();
    if (!product) {
      showToast('No se pudo leer el producto de esta página.', 'error');
      return;
    }

    // Si no hay cuentas conectadas (o no se pudieron cargar), se importa
    // directo al general: el flujo de quien no usa cuentas no cambia.
    const { accounts, failed } = await loadAccounts();

    let container = { accountId: '', shortLabel: 'General' };
    if (!failed && accounts.length > 0) {
      try {
        container = await pickContainer(accounts);
        await saveLastContainer(container.accountId);
      } catch (err) {
        return; // el usuario canceló el selector: no se importa nada.
      }
    }

    product.accountId = container.accountId || '';

    btn.disabled = true;
    btn.textContent = 'Importando...';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'CREATE_PRODUCT', product });

      if (res.ok) {
        const regionSuffix = product.regionLabel ? ` (${product.regionLabel})` : '';
        const verb = res.product?.replaced ? 'actualizado' : 'agregado';
        const containerNote = failed
          ? ` Agregado a ${container.shortLabel} (no se pudieron cargar tus cuentas).`
          : ` Agregado a ${container.shortLabel}.`;
        showToast(`"${product.name.slice(0, 40)}..."${regionSuffix} ${verb} en TTChop.${containerNote}`, 'success');
      } else if (res.error === 'NOT_LOGGED_IN') {
        showToast('Iniciá sesión desde el ícono de la extensión primero.', 'error');
      } else {
        showToast(res.error || 'Error al importar el producto.', 'error');
      }
    } catch (err) {
      showToast('La extensión se actualizó — refrescá esta página e intentá de nuevo.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Agregar a TTChop';
    }
  });
}

function tryInject() {
  if (findProductData()) injectButton();
}

const observer = new MutationObserver(() => tryInject());
observer.observe(document.body, { childList: true, subtree: true });

tryInject();
setInterval(tryInject, 2000);
