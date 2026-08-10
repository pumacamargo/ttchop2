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

    btn.disabled = true;
    btn.textContent = 'Importando...';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'CREATE_PRODUCT', product });

      if (res.ok) {
        const regionSuffix = product.regionLabel ? ` (${product.regionLabel})` : '';
        const verb = res.product?.replaced ? 'actualizado' : 'agregado';
        showToast(`"${product.name.slice(0, 40)}..."${regionSuffix} ${verb} en TTChop.`, 'success');
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
