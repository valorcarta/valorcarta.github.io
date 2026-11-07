import config from '../config.json' with { type: 'json' };

// dominio publico: config.json o, en CI, la variable SITE_URL
export const SITE = (process.env.SITE_URL || config.site).replace(/\/$/, '');

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const eur = (n) =>
  n == null || !isFinite(n)
    ? '—'
    : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

const money = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + ' €');

export function slugify(s = '') {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const cardSlug = (c) => `${c.id}-${slugify(c.name)}`;

export function layout({
  title,
  description,
  url,
  body,
  jsonld,
  image,
  noindex,
  lang = 'es',
  alternates = [],
  scripts = [],
}) {
  const canonical = SITE + url;
  const en = lang === 'en';
  const home = en ? '/en/' : '/';
  const nav = en
    ? `<div class="nav-desktop">
      <details class="menu" name="nav-menu">
        <summary>Explore</summary>
        <div class="menu-panel">
          <a href="/en/market/"><span class="mi" style="--c:#ffcb05"></span>Market</a>
          <a href="/en/most-expensive/"><span class="mi" style="--c:#35e0d0"></span>Top 100</a>
        </div>
      </details>
      <a href="/en/price-check/">Price check</a>
      <a href="/en/">Home</a>
      <a href="/en/about/" class="cta-mini">About</a>
    </div>
    <div class="nav-movil">
      <a href="/en/market/">Market</a>
      <a href="/en/price-check/">Price check</a>
      <a href="/en/about/" class="cta-mini">About</a>
    </div>`
    : `<div class="nav-desktop">
      <details class="menu" name="nav-menu">
        <summary>Cartas</summary>
        <div class="menu-panel">
          <a href="/cartas/"><span class="mi" style="--c:#ffcb05"></span>Todas las cartas</a>
          <a href="/sets/"><span class="mi" style="--c:#ff9d5c"></span>Todos los sets</a>
          <a href="/caras/"><span class="mi" style="--c:#35e0d0"></span>Las 100 más caras</a>
          <a href="/mercado/"><span class="mi" style="--c:#b98cff"></span>Qué se mueve esta semana</a>
        </div>
      </details>
      <details class="menu" name="nav-menu">
        <summary>Herramientas</summary>
        <div class="menu-panel">
          <a href="/valorar/"><span class="mi" style="--c:#ffcb05"></span>Valorar colección</a>
          <a href="/alertas/"><span class="mi" style="--c:#35e0d0"></span>Alertas de precio</a>
          <a href="/guardar-cartas/"><span class="mi" style="--c:#b98cff"></span>Guardar cartas</a>
          <a href="/guias/"><span class="mi" style="--c:#ff9d5c"></span>Guías de compra</a>
        </div>
      </details>
      <a href="/comprar/">Comprar</a>
      <a href="/alertas/" class="cta-mini">Alertas</a>
    </div>
    <div class="nav-movil">
      <a href="/cartas/">Cartas</a>
      <a href="/mercado/">Mercado</a>
      <a href="/comprar/">Comprar</a>
      <a href="/alertas/" class="cta-mini">Alertas</a>
    </div>`;
  const disclosure = en
    ? 'As an Amazon Associate I earn from qualifying purchases. Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.'
    : 'En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.';
  const footLinks = en
    ? `<a href="/en/price-check/">Price check</a> · <a href="/en/most-expensive/">Top 100</a> · <a href="/en/market/">Market</a> · <a href="/en/about/">About &amp; privacy</a> · <a href="/">Versión en español</a> · <a href="https://github.com/valorcarta/precios-cartas-datos">Open data</a>`
    : `<a href="/valorar/">Valorar colección</a> · <a href="/caras/">Las más caras</a> · <a href="/guias/">Guías</a> · <a href="/tiendas/">Para tiendas</a> · <a href="/alertas/">Alertas de precio</a> · <a href="https://github.com/valorcarta/precios-cartas-datos">Datos abiertos</a> ·
    <a href="/aviso-legal/">Aviso legal</a> · <a href="/privacidad/">Privacidad</a>`;
  const footNote = en
    ? 'Reference prices from Cardmarket, updated daily. Not an appraisal: condition decides the real value.'
    : 'Precios de referencia de Cardmarket, actualizados a diario. No es una tasación: el estado de la carta manda.';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title.length > 65 ? title.split(' | ')[0].slice(0, 65) : title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`).join('\n')}
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.brand)}">
<meta property="og:locale" content="${en ? 'en_US' : 'es_ES'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${config.googleVerification ? `<meta name="google-site-verification" content="${esc(config.googleVerification)}">` : ''}
${config.pinterestVerify ? `<meta name="p:domain_verify" content="${esc(config.pinterestVerify)}"/>` : ''}
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<header class="top">
  <a class="brand" href="${home}"><span class="dot"></span>${esc(config.brand)}</a>
  <nav>
    ${nav}
  </nav>
</header>
<main>${body}</main>
<footer>
  <p class="disclosure">${disclosure}</p>
  <p class="foot-links">
    ${footLinks}
  </p>
  <p class="muted">${footNote} © ${new Date().getFullYear()} ${esc(config.brand)}</p>
</footer>
<script src="/assets/app.js" defer></script>
${scripts.map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
${config.goatcounter ? `<script data-goatcounter="https://${esc(config.goatcounter)}/count" async src="https://gc.zgo.at/count.js"></script>` : ''}
</body>
</html>`;
}

export function priceTable(card) {
  if (!card.variants?.length) return '<p class="muted">Sin datos de precio para esta carta todavía.</p>';
  // Un listado de Cardmarket por fila; los que comparten etiqueta se numeran
  // para que no parezca una fila duplicada.
  const vistos = new Set();
  const cuenta = new Map();
  const filas = [];
  for (const v of card.variants) {
    if (!(v.avg || v.trend || v.holoAvg)) continue;
    const clave = v.productId ?? `${v.type}|${v.subtype}|${filas.length}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    filas.push(v);
  }
  const rows = filas
    .map((v) => {
      const base = v.trend ?? v.avg;
      const cap = (t = 'normal') => t.charAt(0).toUpperCase() + t.slice(1);
      const baseLabel = cap(v.type || 'normal') + (v.subtype && v.subtype !== 'estándar' ? ` · ${v.subtype}` : '');
      const n = (cuenta.get(baseLabel) ?? 0) + 1;
      cuenta.set(baseLabel, n);
      const label = n === 1 ? baseLabel : `${baseLabel} · listado ${n}`;
      return `<tr>
        <td>${esc(label)}</td>
        <td class="num">${money(base)}</td>
        <td class="num muted">${money(v.avg30)}</td>
        <td class="num muted">${money(v.low)}</td>
      </tr>`;
    })
    .join('');
  if (!rows) return '<p class="muted">Sin datos de precio para esta carta todavía.</p>';
  return `<table class="prices">
    <thead><tr><th>Versión</th><th class="num">Precio</th><th class="num">Media 30 d</th><th class="num">Mínimo</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export const bestVariant = (card) =>
  (card.variants ?? [])
    .filter((v) => (v.trend ?? v.avg) != null)
    .sort((a, b) => (b.trend ?? b.avg) - (a.trend ?? a.avg))[0] ?? null;

export function trendLine(card, lang = 'es') {
  const v = bestVariant(card);
  if (!v || (v.avg30 == null && v.avg == null)) return '';
  const pts = [v.avg30, v.avg7 ?? v.avg30, v.avg1 ?? v.avg7 ?? v.avg30, v.avg];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const w = 220;
  const h = 48;
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * (h - 6) - 3).toFixed(1)}`)
    .join(' ');
  const delta = pts[3] - pts[0];
  const pct = pts[0] ? (delta / pts[0]) * 100 : 0;
  const label = lang === 'en' ? '30 days' : '30 días';
  return `<div class="trend">
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${path}" fill="none" stroke="${delta >= 0 ? '#35d07f' : '#ff5c5c'}" stroke-width="2"/></svg>
    <span class="muted">${label}: <b class="${delta >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</b></span>
  </div>`;
}

// eBay: el encaje es mejor que Amazon para cartas sueltas. Sin ID de campaña, el enlace
// es una búsqueda normal; con campaña, lleva los parámetros del programa de afiliados.
export const ebayLink = (query) => {
  const base = `https://www.ebay.es/sch/i.html?_nkw=${encodeURIComponent(query)}`;
  const campid = config.ebayCampaignId;
  if (!campid) return base;
  return `${base}&mkcid=1&mkrid=1185-53479-19255-0&siteid=186&campid=${encodeURIComponent(campid)}&toolid=10001&mkevt=1`;
};

export const amazonLink = (query) =>
  `https://www.amazon.es/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(config.amazonTag)}`;
