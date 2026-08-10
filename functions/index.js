const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const REGION_LABELS = { jp: 'Japan', mx: 'Mexico' };

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
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0b0f19;color:#f3f4f6;font-family:'Inter',system-ui,sans-serif;padding:2rem 1rem;min-height:100vh}
    .card{max-width:680px;margin:0 auto;background:rgba(17,24,39,0.9);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:1.75rem;display:flex;flex-direction:column;gap:1.5rem}
    .header{display:flex;align-items:center;gap:.5rem;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:1rem}
    .logo{background:rgba(99,102,241,0.25);width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#6366f1;font-weight:800;font-size:1rem;flex-shrink:0}
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
      <div class="logo">TT</div>
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
