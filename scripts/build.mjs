#!/usr/bin/env node
// Genera la web estatica en dist/ a partir de data/cards.json.
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import config from '../config.json' with { type: 'json' };
import {
  layout, esc, eur, cardSlug, slugify, priceTable, trendLine, amazonLink, ebayLink, bestVariant,
  heroVariant, listingPrice, SITE,
} from '../site/layout.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = (p) => path.join(DIST, p);
// versión de assets por contenido: cada despliegue invalida la caché del CSS/JS/icono
let ASSET_V = '';
const put = async (p, data) => {
  if (ASSET_V && typeof data === 'string' && p.endsWith('.html')) {
    data = data
      .replaceAll('/assets/style.css', `/assets/style.css?v=${ASSET_V}`)
      .replaceAll('/assets/app.js', `/assets/app.js?v=${ASSET_V}`)
      .replaceAll('/assets/en.js', `/assets/en.js?v=${ASSET_V}`)
      .replaceAll('/assets/icon.svg', `/assets/icon.svg?v=${ASSET_V}`);
  }
  // TRACKING 09-11: cada enlace de afiliado lleva ascsubtag con su colocación,
  // para que el panel de Amazon diga qué página trae clics y cuál convierte.
  if (typeof data === 'string' && p.endsWith('.html') && /amazon\.es\/dp\//.test(data)) {
    const rel = String(p).replace(/^.*?dist\//, '').replace(/\/?index\.html$/, '').replace(/\//g, '-') || 'inicio';
    data = data.replace(/https:\/\/www\.amazon\.es\/dp\/([A-Z0-9]{10})([^"']*)/g,
      (m0, asin, resto) => {
        if (resto.includes('ascsubtag=')) return m0;
        return `https://www.amazon.es/dp/${asin}?tag=${encodeURIComponent(config.amazonTag)}&ascsubtag=${encodeURIComponent('vc-'+rel)}`;
      });
  }
  // ORDEN 09-11: solo ASIN del catálogo verificado; el resto no se enlaza
  if (typeof data === 'string' && p.endsWith('.html')) {
    data = data.replace(/https:\/\/www\.amazon\.es\/dp\/([A-Z0-9]{10})[^"]*/g,
      (m, asin) => (VERIFICADOS.has(asin) ? m : '/comprar/'));
  }
  // ORDEN 09-11 (2): un producto agotado o sin buy box no se enlaza aunque esté verificado
  if (typeof data === 'string' && p.endsWith('.html')) {
    data = data.replace(/https:\/\/www\.amazon\.es\/dp\/([A-Z0-9]{10})[^"]*/g,
      (m, asin) => (DISPONIBLES.has(asin) ? m : '/comprar/'));
  }
  // Honestidad del botón: si el enlace acaba en /comprar/ no puede decir "Amazon"
  if (typeof data === 'string' && p.endsWith('.html')) {
    data = data.replace(/<a([^>]*href="\/comprar\/"[^>]*)>([^<]*(?:amazon|Amazon)[^<]*)<\/a>/g,
      (m, attrs) => `<a${attrs}>Ver productos verificados</a>`);
  }
  // ORDEN 09-11: ninguna búsqueda de Amazon en la web; solo producto exacto (/dp/) o página interna
  if (typeof data === 'string' && p.endsWith('.html')) {
    data = data.replace(/href="https:\/\/www\.amazon\.es\/s\?[^"]*"/g, 'href="/comprar/"');
  }
  // COHERENCIA 09-11: ninguna página con enlace a Amazon sale sin aviso de afiliado
  if (typeof data === 'string' && p.endsWith('.html') && /amazon\.es/.test(data)
      && !/enlace de afiliado|etiqueta de afiliado|comisi[oó]n de amazon|afiliad/i.test(data)) {
    const aviso = '<p class="nota small" style="margin:18px 0 0;color:#8b8b93;font-size:.8rem;line-height:1.5">Enlace de afiliado: si compras desde aquí, ValorCarta recibe una comisión de Amazon que no cambia lo que pagas.</p>';
    data = data.includes('</main>') ? data.replace('</main>', aviso + '\n</main>') : data.replace('</body>', aviso + '\n</body>');
  }
  const full = path.isAbsolute(p) ? p : OUT(p);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
};

const cards = JSON.parse(await readFile(path.join(ROOT, 'data', 'cards.json'), 'utf8'))
  .map((c) => ({ ...c, serie: c.serie ?? c.serious ?? null }));
const sets = JSON.parse(await readFile(path.join(ROOT, 'data', 'sets.json'), 'utf8'));
const setsById = new Map(sets.map((s) => [s.id, s]));
let CAMBIOS = null;
try { CAMBIOS = JSON.parse(await readFile(path.join(ROOT, 'data', 'changes.json'), 'utf8')); } catch {}
let ASINS = {};
const VERIFICADOS = new Set();
let REGALOS_FRIKIS = { productos: [] };
try { REGALOS_FRIKIS = JSON.parse(await readFile(path.join(ROOT, 'data', 'regalos.json'), 'utf8')); } catch {}
try { ASINS = JSON.parse(await readFile(path.join(ROOT, 'data', 'asins.json'), 'utf8')); } catch {}
let PRODUCTOS_AMZ = [];
try { PRODUCTOS_AMZ = JSON.parse(await readFile(path.join(ROOT, 'data', 'productos.json'), 'utf8')); } catch {}
let EXTRA_AMZ = [];
try { EXTRA_AMZ = (JSON.parse(await readFile(path.join(ROOT, 'data', 'productos-extra.json'), 'utf8')) || {}).productos || []; } catch {}
let RECOS = {};
let SUGERENCIAS = [];
let DISPONIBLES_PROD = [];
try {
  const _r = JSON.parse(await readFile(path.join(ROOT, 'data', 'recomendaciones.json'), 'utf8')) || {};
  RECOS = _r.por_asin || {};
  SUGERENCIAS = _r.sugerencias || [];
  DISPONIBLES_PROD = _r.disponibles || [];
} catch {}
const CATALOGO = [...PRODUCTOS_AMZ, ...EXTRA_AMZ];
const prodInfo = (asin) => CATALOGO.find((p) => p.asin === asin) || null;
let VERIF_PROD = {};
try { VERIF_PROD = JSON.parse(await readFile(path.join(ROOT, 'data', 'productos-verificados.json'), 'utf8')).productos ?? {}; } catch {}
// Solo se enlaza a Amazon lo que de verdad se puede comprar: fuera "Currently unavailable"
// y fichas sin buy box. Si no está en esta lista, no hay enlace de afiliado.
const DISPONIBLES = new Set(Object.entries(VERIF_PROD).filter(([, v]) => v && v.disponible).map(([k]) => k));
for (const asin of Object.keys(VERIF_PROD)) VERIFICADOS.add(asin);
const ASINS_OK = {};
for (const [sid, prods] of Object.entries(ASINS)) {
  const ok = (prods || []).filter((p) => DISPONIBLES.has(p.asin));
  if (ok.length) ASINS_OK[sid] = ok;
}
// Las imágenes de producto se copian más abajo, después de vaciar dist.
for (const v of Object.values(ASINS)) for (const prod of v) VERIFICADOS.add(prod.asin);
// ORDEN 09-11: a primera vista solo lo que sí se vende. Una carta es vendible si
// su set tiene producto verificado en Amazon (ASINS[setId]); si no, no va al héroe.
const vendible = (c) => Boolean(ASINS_OK[c.setId]?.length);
let RADAR = [];
try { RADAR = JSON.parse(await readFile(path.join(ROOT, 'data', 'radar.json'), 'utf8')); } catch {}
let SETS_EN = {};
try { SETS_EN = JSON.parse(await readFile(path.join(ROOT, 'data', 'sets-en.json'), 'utf8')); } catch {}
let CARDS_EN = {};
try { CARDS_EN = JSON.parse(await readFile(path.join(ROOT, 'data', 'cards-en.json'), 'utf8')); } catch {}

const priced = cards.filter((c) => c.price > 0);
const TOP_INDEXABLE = 1000000; // 09-11: indexar todas las cartas con precio (antes 300)
const indexables = new Set(priced.slice(0, TOP_INDEXABLE).map((c) => c.id));

// ---------- edición inglesa: 100 cartas más caras y páginas núcleo ----------
const TOP_EN = 100;
const enCards = priced.slice(0, TOP_EN);
const enMeta = (c) => CARDS_EN[c.id] ?? {};
const enName = (c) => enMeta(c).name || c.name;
const enSlug = (c) => `${c.id}-${slugify(enName(c).replace(/['’]/g, ''))}`;
const enSlugById = new Map(enCards.map((c) => [c.id, enSlug(c)]));
const setNameEn = (c) => SETS_EN[c.setId]?.name ?? c.setName;
const setYearEn = (c) => {
  const d = SETS_EN[c.setId]?.releaseDate ?? c.releaseDate;
  return d ? String(d).slice(0, 4) : null;
};
// Tipos de cambio FIJOS de la sección inglesa. No son tipos en vivo: están
// declarados aquí para que el build sea reproducible y la página lo diga.
const FX = { USD: 1.08, GBP: 0.85 };
const nfEurEn = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const nfUsdEn = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const nfGbpEn = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const eurEn = (n) => (n == null || !isFinite(n) ? '—' : nfEurEn.format(n));
const usdEn = (n) => (n == null || !isFinite(n) ? '—' : nfUsdEn.format(n * FX.USD));
const gbpEn = (n) => (n == null || !isFinite(n) ? '—' : nfGbpEn.format(n * FX.GBP));
const FX_NOTE = `USD and GBP are an approximate conversion at fixed build rates (€1 = $${FX.USD.toFixed(2)} = £${FX.GBP.toFixed(2)}), not live exchange rates.`;
const amazonDp = (asin) => `https://www.amazon.es/dp/${asin}?tag=${encodeURIComponent(config.amazonTag)}`;
// 09-11: el CTA nunca promete la carta suelta. Solo sellado verificado o página interna.
// Una carta no es un producto de Amazon: aquí nunca se enlaza a otro producto.
const ctaCarta = (c, cls = 'btn') =>
  `<a class="${cls} ghost" href="/comprar/">Ver los productos que sí se venden</a>`;
// Unos productos llevan a otros (lo calcula tools/recomienda.py; el build solo lo pinta).
const recosHtml = (asin) => {
  const lista = (RECOS[asin] || []).filter((x) => prodInfo(x.asin)).slice(0, 3);
  if (!lista.length) return '';
  const chips = lista.map((x) => {
    const pr = prodInfo(x.asin);
    return `<a class="reco-link" href="${amazonDp(x.asin)}" rel="sponsored nofollow noopener" target="_blank">${esc(pr.nombre)}${pr.precio ? ` · ${eur(pr.precio)}` : ''} <span>${esc(x.motivo)}</span></a>`;
  }).join('');
  return `<div class="recos"><span class="recos-k">Va bien con</span>${chips}</div>`;
};

// Sugerencias de compra en las fichas de carta: producto real, foto fundida con el fondo y enlace de afiliado.
const sugerenciasHtml = () => {
  const lista = DISPONIBLES_PROD.filter((x) => IMGS_SITE.has(x.asin)).map((x) => prodInfo(x.asin) || x).slice(0, 4);
  if (!lista.length) return '';
  const filas = lista.map((p) => {
    const img = IMGS_SITE.has(p.asin)
      ? `<span class="sug-thumb"><img src="/productos/producto-${esc(p.asin)}.jpg" alt="${esc(p.nombre)}" loading="lazy" decoding="async"></span>`
      : `<span class="sug-thumb"></span>`;
    return `<a class="sug-fila" href="${amazonDp(p.asin)}" rel="sponsored nofollow noopener" target="_blank">${img}<span class="sug-txt"><b>${esc(p.nombre)}</b><small>${p.precio ? eur(p.precio) : ''} · Amazon ↗</small></span></a>`;
  }).join('');
  return `<aside class="sugerencias" aria-label="Productos que sí se venden">
    <h3>Sugerencias</h3><p class="sug-sub">Productos que sí se venden, con enlace de afiliado</p>
    ${filas}
    <a class="sug-all" href="/comprar/">Ver todos los productos verificados →</a>
    <p class="sug-af">Enlace de afiliado: ValorCarta recibe una comisión de Amazon sin coste para ti.</p>
  </aside>`;
};

const ASIN_LABEL_EN = {
  B0BTRN9FT5: '36-pack booster box · Scarlet & Violet',
  B0FDGXLR5L: 'Elite Trainer Box · Scarlet & Violet (Koraidon)',
  B0DM6HQ8X5: 'Elite Trainer Box · Prismatic Evolutions',
  B0DWGBC38K: 'Super Premium Collection · Prismatic Evolutions',
  B0G4NT3SH1: 'Elite Trainer Box · Ascended Heroes',
  B0FNX69YSZ: "Collector's EX tin (4 packs)",
};
// hreflang recíproco: el x-default apunta a la versión española, que es la original.
const altPair = (es, en) => [
  { hreflang: 'es', href: SITE + es },
  { hreflang: 'en', href: SITE + en },
  { hreflang: 'x-default', href: SITE + es },
];
const porNombre = new Map();
for (const c of priced) {
  const k = c.name.toLowerCase();
  if (!porNombre.has(k)) porNombre.set(k, []);
  porNombre.get(k).push(c);
}
const bySet = new Map();
for (const c of cards) {
  if (!bySet.has(c.setId)) bySet.set(c.setId, []);
  bySet.get(c.setId).push(c);
}
for (const list of bySet.values()) list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));

const año = (d) => (d ? String(d).slice(0, 4) : null);
// top de portada: solo cartas cuya imagen existe de verdad
async function imgOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}
const candidatas = priced.filter((c) => c.image).slice(0, 64);
const checks = await Promise.all(candidatas.map((c) => imgOk(`${c.image}/low.webp`)));
const top = candidatas.filter((_, i) => checks[i]).slice(0, 24);
// Portada: "las más caras" entre las que tienen producto verificado (para no abrir con una carta que no se vende)
const candidatasVend = priced.filter((c) => c.image && vendible(c)).slice(0, 40);
const checksVend = await Promise.all(candidatasVend.map((c) => imgOk(`${c.image}/low.webp`)));
const topVendibles = candidatasVend.filter((_, i) => checksVend[i]).slice(0, 24);

// «muñecos»: una carta por Pokémon popular, con la imagen comprobada (si no, hueco roto)
const POPULARES = ['Pikachu', 'Charizard', 'Eevee', 'Gengar', 'Umbreon', 'Mewtwo',
  'Rayquaza', 'Greninja', 'Lucario', 'Blastoise', 'Venusaur', 'Mew'];
const munecosCrudos = POPULARES
  .map((n) => priced.find((c) => c.image && vendible(c) && c.name.toLowerCase() === n.toLowerCase()))
  .filter(Boolean);
const munecosOk = await Promise.all(munecosCrudos.map((c) => imgOk(`${c.image}/low.webp`)));
const munecos = munecosCrudos.filter((_, i) => munecosOk[i]).slice(0, 8);
// ---------- radar de precio (se recalcula en cada build) ----------
// Una sola definición para la portada y /mercado/: la misma carta no puede
// salir con dos cifras distintas en la misma web.
const radar = priced
  .map((c) => {
    const v = bestVariant(c);
    if (!v || !v.avg30 || !v.avg7 || v.avg30 < 10 || v.avg7 <= 0) return null;
    return { ...c, var7: ((v.avg7 - v.avg30) / v.avg30) * 100 };
  })
  .filter((c) => c && c.var7 > -60 && c.var7 < 60)
  .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name && x.setId === c.setId) === i);
const subenTodos = [...radar].sort((a, b) => b.var7 - a.var7);
const suben = subenTodos.slice(0, 20);
const bajan = [...radar].sort((a, b) => a.var7 - b.var7).slice(0, 20);
const varFmt = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')} %`;
const amazonCarta = (c) => amazonLink(`${c.name} ${c.setName ?? ''} pokemon`);

// Vitrina: solo cartas Pokémon con imagen, precio suficiente y SET VENDIBLE.
// A primera vista no sale una carta que no se puede comprar: si no, el héroe
// ofrece un producto que no existe y el visitante se va sin comprar nada.
const vitrinaCandidatas = subenTodos.filter(
  (c) => c.image && /^pok/i.test(c.category || '') && c.price >= 15 && vendible(c),
);
// La carta del día = la que más sube esta semana (la misma que abre /mercado/).
const cartaDelDia = vitrinaCandidatas[0] ?? null;
// «Lo que más se mueve» = las tres siguientes: la del día ya está en el héroe.
const movers = vitrinaCandidatas.slice(1, 4);

// Fecha real del dato: la del fetch más reciente del catálogo, no la del build.
// La usan /sets/, /mercado/ y la portada; se calcula una vez.
const fechaCatalogo = priced.reduce((max, c) => (c.updated && c.updated > max ? c.updated : max), '');
const fechaLarga = new Date(fechaCatalogo || Date.now()).toLocaleDateString('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const munecosHtml = `<section class="bloque">
  <h2>Los Pokémon que más se buscan</h2>
  <p class="muted small">Una carta de cada uno, con el precio de referencia de hoy. Toca para ver todas sus versiones.</p>
  <div class="munecos-grid">
    ${munecos
      .map(
        (c) => `<a class="muneco" href="/carta/${cardSlug(c)}/">
      <img src="${esc(c.image)}/low.webp" alt="Carta de ${esc(c.name)}" width="245" height="342" loading="lazy" decoding="async">
      <span class="m-name">${esc(c.name)}</span>
      <span class="m-price">${eur(c.price)}</span>
    </a>`,
      )
      .join('\n')}
  </div>
</section>`;

// ---------- carta del día (héroe de portada) + lo que más se mueve ----------
// Formato de BinderDex/Card Codex: el objeto (la carta) y su cifra mandan; el
// porcentaje va SIEMPRE con su base y la fecha del dato al lado.
const cartaDiaHtml = cartaDelDia
  ? (() => {
      const v = bestVariant(cartaDelDia);
      const slug = cardSlug(cartaDelDia);
      return `<aside class="dia" aria-labelledby="dia-titulo">
  <p class="kicker dia-kicker">La carta del día</p>
  <a class="dia-arte" href="/carta/${slug}/" aria-label="Ver la ficha de ${esc(cartaDelDia.name)}">
    <span class="dia-halo" aria-hidden="true"></span>
    <span class="carta3d"><img src="${esc(cartaDelDia.image)}/high.webp" alt="Carta ${esc(cartaDelDia.name)} de ${esc(cartaDelDia.setName)}" width="480" height="670" loading="eager" fetchpriority="high" decoding="async"></span>
  </a>
  <div class="dia-ficha">
    <h2 id="dia-titulo"><a href="/carta/${slug}/">${esc(cartaDelDia.name)}</a></h2>
    <p class="dia-set muted small">${esc(cartaDelDia.setName)}${cartaDelDia.localId ? ` · Nº ${esc(cartaDelDia.localId)}` : ''}</p>
    <p class="dia-etq muted small">Precio de referencia hoy</p>
    <p class="dia-precio">${eur(cartaDelDia.price)}</p>
    <p class="dia-trend"><b class="${cartaDelDia.var7 >= 0 ? 'up' : 'down'}">${varFmt(cartaDelDia.var7)}</b> <span class="muted small">frente a su media de 30 días</span></p>
    <p class="dia-medias muted small">Media 7 d: ${eur(v.avg7)} · media 30 d: ${eur(v.avg30)}.</p>
    <div class="dia-acciones">
      ${ctaCarta(cartaDelDia)}
      <a class="btn ghost" href="/carta/${slug}/">Ver ficha y precios</a>
      <a class="btn ghost" href="/comprar/">Ver los productos que sí se venden</a>
    </div>
  </div>
  <p class="nota small">Precios de Cardmarket del ${fechaLarga}. Enlaces de afiliado de Amazon: ValorCarta recibe una comisión sin coste para ti.</p>
</aside>`;
    })()
  : '';

// ---------- portada: lo que sí se vende (productos con comisión) ----------
// Pedido del dueño: en la primera línea de la portada van PRODUCTOS que pagan comisión,
// no cartas sueltas que no se pueden comprar. El producto destacado es el nº1 en ventas.
const ventaProd = (() => { const d = DISPONIBLES_PROD.find((x) => x.asin); return d ? prodInfo(d.asin) || { asin: d.asin, nombre: d.nombre, precio: d.precio } : null; })();
const ventaOtros = DISPONIBLES_PROD.filter((x) => ventaProd && x.asin !== ventaProd.asin).map((x) => prodInfo(x.asin) || x).filter((p) => p && p.precio);
const amzProd = (p) => `https://www.amazon.es/dp/${p.asin}?tag=${encodeURIComponent(config.amazonTag)}`;
const ventaHtml = ventaProd
  ? `<aside class="dia venta" aria-labelledby="venta-titulo">
  <p class="kicker dia-kicker">Lo que sí se vende · enlace de afiliado</p>
  <a class="dia-arte venta-arte" href="${amzProd(ventaProd)}" rel="sponsored nofollow noopener" target="_blank" aria-label="Ver ${esc(ventaProd.nombre)} en Amazon">
    <span class="venta-foto"><img src="/productos/producto-${esc(ventaProd.asin)}.jpg" alt="${esc(ventaProd.nombre)}" width="480" height="458" loading="eager" fetchpriority="high" decoding="async"></span>
  </a>
  <div class="dia-ficha">
    <h2 id="venta-titulo"><a href="${amzProd(ventaProd)}" rel="sponsored nofollow noopener" target="_blank">${esc(ventaProd.nombre)}</a></h2>
    <p class="dia-set muted small">En stock en Amazon · enlace de afiliado</p>
    <p class="dia-etq muted small">Precio en Amazon</p>
    <p class="dia-precio">${eur(ventaProd.precio)}</p>
    <div class="dia-acciones">
      <a class="btn" href="${amzProd(ventaProd)}" rel="sponsored nofollow noopener" target="_blank">Ver en Amazon</a>
      <a class="btn ghost" href="/comprar/">Más productos verificados</a>
    </div>
    <p class="venta-mas small">También con comisión: ${ventaOtros.slice(0, 2).map((p) => `<a href="${amzProd(p)}" rel="sponsored nofollow noopener" target="_blank">${esc(p.nombre)} · ${eur(p.precio)}</a>`).join(' · ')}</p>
  </div>
  <p class="nota small">Enlace de afiliado: si compras desde aquí, ValorCarta recibe una comisión de Amazon sin coste para ti.</p>
</aside>`
  : '';
const moversHtml = movers.length
  ? `<section class="bloque movers" aria-labelledby="movers-titulo">
  <h2 id="movers-titulo">Lo que más se mueve esta semana</h2>
  <p class="muted small">La media de 7 días frente a la de 30, en las tres cartas con producto verificado que más suben después de la del día. El porcentaje compara esas dos medias, no el precio de hoy con el de ayer. Datos de Cardmarket del ${fechaLarga}; una subida pasada no adelanta la siguiente.</p>
  <div class="vitrina-grid">
    ${movers
      .map((c) => {
        const v = bestVariant(c);
        const slug = cardSlug(c);
        return `<article class="carta-vitrina mover">
      <a class="cv-foto" href="/carta/${slug}/">
        <img src="${esc(c.image)}/high.webp" alt="Carta ${esc(c.name)} de ${esc(c.setName)}" width="480" height="670" loading="lazy" decoding="async">
        <span class="cv-trend ${c.var7 >= 0 ? 'up' : 'down'}">${varFmt(c.var7)}</span>
      </a>
      <a class="cv-nombre" href="/carta/${slug}/">${esc(c.name)}</a>
      <p class="cv-set muted small">${esc(c.setName)}</p>
      <div class="mover-aa muted small"><span>Media 30 d</span><b>${eur(v.avg30)}</b></div>
      <div class="mover-aa muted small"><span>Media 7 d</span><b class="${c.var7 >= 0 ? 'up' : 'down'}">${eur(v.avg7)}</b></div>
      <div class="cv-pie">
        <span class="cv-precio">${eur(c.price)}</span>
        <a class="cv-btn" href="/carta/${cardSlug(c)}/" aria-label="Ver precio de ${esc(c.name)}">Ver</a>
      </div>
    </article>`;
      })
      .join('\n')}
  </div>
  <p class="acciones"><a class="btn ghost" href="/mercado/">Ver el radar completo: 20 que suben y 20 que bajan</a></p>
  <p class="nota small">Enlaces de afiliado de Amazon: si compras desde ellos, ValorCarta recibe una comisión que no cambia lo que pagas. Precios de referencia de Cardmarket vía TCGdex, actualizados el ${fechaLarga}.</p>
</section>`
  : '';

const totalValor = priced.reduce((s, c) => s + c.price, 0);

await rm(DIST, { recursive: true, force: true });
await mkdir(OUT('assets'), { recursive: true });
await mkdir(OUT('data'), { recursive: true });
// Imágenes de producto versionadas en site/ (JPEG): se copian a dist/productos/.
const IMGS_SITE = new Set();
await mkdir(OUT('productos'), { recursive: true }).catch(() => {});
for (const f of await readdir(path.join(ROOT, 'site')).catch(() => [])) {
  if (!/^producto-.*\.jpg$/i.test(f)) continue;
  IMGS_SITE.add(f.replace(/^producto-/i, '').replace(/\.jpg$/i, ''));
  try {
    await writeFile(OUT('productos/' + f), await readFile(path.join(ROOT, 'site', f)));
  } catch {}
}
const dispConImagen = () => DISPONIBLES_PROD.filter((x) => IMGS_SITE.has(x.asin));
const stockTexto = (x) => (/left in stock/i.test(x.estado || '') ? 'Solo ' + (String(x.estado).match(/\d+/)?.[0] || '2') + ' uds.' : 'En stock');
const precioTexto = (x) => (typeof x.precio === 'number' ? eur(x.precio) : 'Precio en Amazon');
const dispCard = (x) => `<article class="dprod">
    <div class="dimg"><img src="/productos/producto-${esc(x.asin)}.jpg" alt="${esc(x.nombre)}" loading="lazy" decoding="async"></div>
    <span class="dbadge">${esc(stockTexto(x))}</span>
    <h3>${esc(x.nombre)}</h3>
    <p class="dmotivo">${esc(x.motivo || '')}</p>
    <p class="dprecio">${precioTexto(x)} <span>· Amazon</span></p>
    <a class="dbtn" href="${amazonDp(x.asin)}" rel="sponsored nofollow noopener" target="_blank">Ver en Amazon</a>
  </article>`;
const disponiblesHtml = (titulo = 'Disponible ahora · lo que sí se puede comprar') => {
  const lista = dispConImagen().slice(0, 4);
  if (!lista.length) return '';
  return `<section class="bloque disp-bloque">
    <div class="disp-cab"><div><h2>${esc(titulo)}</h2><p class="muted small">Productos verificados hoy y comprables en Amazon. Si uno se agota, sale de aquí solo.</p></div><a href="/comprar/">Ver todos los productos →</a></div>
    <div class="disp-grid">${lista.map(dispCard).join('')}</div>
    <p class="nota small">Enlaces de afiliado: si compras desde aquí, ValorCarta recibe una comisión de Amazon sin coste para ti.</p>
  </section>`;
};
const imgProducto = (asin) => IMGS_SITE.has(asin)
  ? `<img class="reco-img" src="/productos/producto-${esc(asin)}.jpg" alt="${esc((prodInfo(asin) || {}).nombre || 'Producto')}" loading="lazy" decoding="async">`
  : '';

// GitHub Pages: sin Jekyll, si no ignora carpetas que empiezan por _
await put('.nojekyll', '');
if (config.googleVerificationFile) {
  await put(config.googleVerificationFile, `google-site-verification: ${config.googleVerificationFile}`);
}
const INDEXNOW_KEY = (await readFile(path.join(ROOT, 'data', 'indexnow-key.txt'), 'utf8')).trim();
await put(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);

// cabeceras de hosting (Cloudflare Pages / Netlify)
await put('_headers', await readFile(path.join(ROOT, 'site', '_headers')));

// assets estaticos
for (const f of ['style.css', 'app.js', 'en.js']) {
  await put(OUT(`assets/${f}`), await readFile(path.join(ROOT, 'site', f)));
}
{
  const { createHash } = await import('node:crypto');
  const h = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 10);
  ASSET_V = h(await readFile(path.join(ROOT, 'site', 'style.css')))
    + h(await readFile(path.join(ROOT, 'site', 'app.js')))
    + h(await readFile(path.join(ROOT, 'site', 'en.js')));
}
await put(
  OUT('assets/icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0a0a0b"/><g transform="rotate(-8 16 16)"><rect x="7.4" y="4.4" width="17.2" height="23.2" rx="3.2" fill="none" stroke="#ffcb05" stroke-width="1.7"/><circle cx="16" cy="13.2" r="4.8" fill="#0f0e14" stroke="#ffcb05" stroke-width="1.5"/><path d="M11.2 13.2h9.6" stroke="#ffcb05" stroke-width="1.2"/><circle cx="16" cy="13.2" r="1.6" fill="#ffcb05"/><path d="M10.8 24.4h10.4" stroke="#35e0d0" stroke-width="1.9" stroke-linecap="round"/></g></svg>`,
);
// mascotas decorativas (monedas de Pokémon): se copian tal cual
for (const f of (await readdir(path.join(ROOT, 'site', 'mascotas')).catch(() => []))) {
  await put(OUT(`assets/mascotas/${f}`), await readFile(path.join(ROOT, 'site', 'mascotas', f)));
}

const guiasDir = path.join(ROOT, 'content', 'guias');
const guias = [];
for (const f of (await readdir(guiasDir).catch(() => [])).filter((f) => f.endsWith('.json'))) {
  try {
    guias.push(JSON.parse(await readFile(path.join(guiasDir, f), 'utf8')));
  } catch (e) {
    console.warn(`guia ilegible: ${f}`);
  }
}
guias.sort((a, b) => a.title.localeCompare(b.title, 'es'));

// ---------- home ----------
const homeBody = `
<section class="hero hero-dia portada">
  <div class="portada-fondo" aria-hidden="true">
    <span class="aura aura-1"></span><span class="aura aura-2"></span><span class="aura aura-3"></span>
    <svg class="bola-fondo" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 100h192M100 4a96 96 0 0 1 0 192" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="100" cy="100" r="30" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
  </div>
  <div class="hero-txt">
    <p class="kicker">PRECIOS DE CARTAS POKÉMON · ${priced.length.toLocaleString('es-ES')} CARTAS · ACTUALIZADO EL ${new Date(fechaCatalogo || Date.now()).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }).toUpperCase()}</p>
    <h1>¿Cuánto valen <em>tus</em> cartas Pokémon?</h1>
    <p class="lede">El precio medio real de Cardmarket, actualizado a diario. Busca una carta o valora tu colección en 10 segundos: gratis, sin registro y sin humo.</p>
    <div id="buscador" class="buscador">
      <input id="q" type="search" placeholder="Busca una carta: Charizard, Pikachu, Mew…" autocomplete="off" aria-label="Buscar carta">
      <div id="resultados" class="resultados"></div>
    </div>
    <div class="acciones">
      <a class="btn" href="/valorar/">Valorar mi colección</a>
      <a class="btn ghost" href="/cartas/">Ver todas las cartas</a>
    </div>
    <ul class="confianza">
      <li>Datos de Cardmarket, cada día</li>
      <li>Histórico de 30 días por carta</li>
      <li>Gratis, sin registro</li>
    </ul>
    ${ASINS_OK['30th']?.[0] ? `<p class="nota small" style="margin-top:14px">Compra: <a href="https://www.amazon.es/dp/${ASINS_OK['30th'][0].asin}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank"><b>la caja del 30.º aniversario (52,99 €)</b></a>. Enlace de afiliado: ValorCarta recibe una comisión de Amazon sin coste para ti.</p>` : ''}
  </div>
  ${ventaHtml}
</section>

${moversHtml}

${disponiblesHtml()}

${munecosHtml}

<section class="bloque">
  <h2>Las cartas más caras que sí se venden</h2>
  <div class="grid">
    ${topVendibles.map((c, i) => cardTile({ ...c, prio: i < 6 })).join('\n')}
  </div>
</section>

<section class="bloque">
  <h2>Guías para no regalar dinero</h2>
  <div class="grid guias-grid">
    ${guias
      .slice(0, 3)
      .map(
        (g) => `<a class="guia-card" href="/guia/${g.slug}/">
      <span class="guia-t">${esc(g.title)}</span>
      <span class="muted small">${esc(g.description)}</span></a>`,
      )
      .join('')}
  </div>
</section>

<section class="bloque">
  <h2>Índice: las 100 cartas más caras</h2>
  <p class="muted small">Enlaces directos a las fichas con más valor de mercado. Se recalcula a diario.</p>
  <div class="indice">
    ${priced.slice(0, 100).map((c) => `<a href="/carta/${cardSlug(c)}/">${esc(c.name)}</a>`).join(' · ')}
  </div>
</section>

<section class="bloque">
  <h2>Todos los sets</h2>
  <div class="indice">
    ${[...bySet.keys()].map((id) => `<a href="/set/${id}/">${esc(setsById.get(id)?.name ?? id)}</a>`).join(' · ')}
  </div>
  <p class="muted small"><a href="/sets/">Ver los ${bySet.size} sets agrupados por serie</a></p>
</section>

${(() => {
  const mov = [...(CAMBIOS?.suben ?? []), ...(CAMBIOS?.bajan ?? [])].slice(0, 6);
  if (!CAMBIOS) return '';
  const nombre = new Map(cards.map((c) => [c.id, c]));
  return `<section class="bloque">
  <h2>Lo que se movió el ${esc(CAMBIOS.fecha)}</h2>
  <p class="muted small">Comparado con el día anterior. Se recalcula en cada actualización, así que cambia cada mañana.</p>
  ${mov.length ? `<ul class="pasos">${mov
    .map((m) => {
      const c = nombre.get(m.id);
      if (!c) return '';
      const signo = m.pct >= 0 ? '+' : '';
      return `<li><a href="/carta/${cardSlug(c)}/">${esc(c.name)}</a> — ${eur(m.a)} (${signo}${m.pct.toFixed(1)} %)</li>`;
    })
    .filter(Boolean)
    .join('')}</ul>` : '<p>Hoy ninguna carta se ha movido más de un 3 %. El mercado está plano.</p>'}
  <p class="muted small">Actualizado: ${esc(CAMBIOS.fecha)} · <a href="/mercado/">ver el radar completo</a></p>
</section>`;
})()}

<section class="bloque">
  <h2>Cómo se calcula lo que vale tu colección</h2>
  <p>Una carta no vale lo que dice un catálogo: vale lo que alguien paga por ella esta semana. Por eso aquí no usamos
  precios de tienda ni recomendaciones, sino la media de ventas reales de Cardmarket de los últimos días, que es la
  referencia que usan los coleccionistas en Europa.</p>
  <p>Para cada carta verás tres cifras: el <b>precio de referencia</b> (la tendencia actual), la <b>media de 30 días</b>
  (para saber si está subiendo o bajando) y el <b>mínimo</b> (lo más barato que se ha vendido). Las tres juntas cuentan
  una historia; una sola engaña.</p>
  <h2>Qué cambia el valor de una carta</h2>
  <ul class="pasos">
    <li><b>El estado.</b> Una carta Near Mint puede valer el doble que la misma carta con desgaste. Si no está perfecta, no vale la cifra que ves.</li>
    <li><b>La versión.</b> Normal, reversa y holo del mismo número son cartas distintas y precios distintos.</li>
    <li><b>El idioma.</b> Español e inglés no cotizan igual; las japonesas, a veces, muy distinto.</li>
    <li><b>La reimpresión.</b> Si el personaje vuelve en otro set, la versión antigua suele bajar.</li>
  </ul>
  <h2>Preguntas frecuentes</h2>
  <h3>¿Los precios son una tasación?</h3>
  <p>No. Son precios de referencia de mercado. Una tasación exige ver la carta; esto te dice cuánto se está pagando por cartas parecidas.</p>
  <h3>¿De dónde salen?</h3>
  <p>De Cardmarket, vía la API pública de TCGdex, y se actualizan a diario. Puedes descargar el volcado completo en nuestros <a href="https://github.com/valorcarta/precios-cartas-datos">datos abiertos</a>.</p>
  <h3>¿Cuánto cuesta usarlo?</h3>
  <p>Nada. El valorador y las fichas son gratis y no piden registro. Si algún día quieres que te avisemos por email cuando una carta baje, eso sí se paga.</p>
</section>

<section class="bloque dos-col">
  <div>
    <h2>Precio de mercado, no de catálogo</h2>
    <p>Los precios salen de las ventas reales de Cardmarket: media, tendencia y mínimo de los últimos 30 días.
    Se actualizan a diario. Una carta sin movimiento no sube porque un catálogo lo diga.</p>
  </div>
  <div>
    <h2>Cómo se usa</h2>
    <ol class="pasos">
      <li>Busca tus cartas y añádelas a la colección.</li>
      <li>Mira el total, cuánto subió en 30 días y cuáles son tus cartas que más valen.</li>
      <li>Guarda el enlace y vuelve cuando quieras: el valor se recalcula solo.</li>
    </ol>
  </div>
</section>`;

await put(
  OUT('index.html'),
  layout({
    title: `${config.brand} — ¿Cuánto valen tus cartas Pokémon? Precios de hoy`,
    description: `Calcula el valor de tu colección de cartas Pokémon con precios reales de Cardmarket actualizados a diario. ${priced.length.toLocaleString('es-ES')} cartas, gratis y sin registro.`,
    url: '/',
    alternates: altPair('/', '/en/'),
    body: homeBody,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: config.brand,
      url: SITE,
      mainEntity: [
        { '@type': 'Question', name: '¿Los precios son una tasación?', acceptedAnswer: { '@type': 'Answer', text: 'No. Son precios de referencia de mercado; una tasación exige ver la carta.' } },
        { '@type': 'Question', name: '¿De dónde salen los precios?', acceptedAnswer: { '@type': 'Answer', text: 'De Cardmarket, vía la API pública de TCGdex, actualizados a diario.' } },
        { '@type': 'Question', name: '¿Cuánto cuesta usarlo?', acceptedAnswer: { '@type': 'Answer', text: 'El valorador y las fichas son gratis y no piden registro.' } },
      ],
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE}/cartas/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  }),
);

// ---------- indice de cartas ----------
// sets.json no trae serie ni fecha; sets-en.json sí y cubre todos los sets. De ahí salen
// la serie (para /sets/) y el año (para /cartas/). El nombre se queda en español.
const setsConPrecio = [...bySet.entries()]
  .map(([id, list]) => ({
    id,
    name: setsById.get(id)?.name ?? list[0].setName,
    n: list.length,
    total: list.reduce((s, c) => s + (c.price ?? 0), 0),
    fecha: setsById.get(id)?.releaseDate ?? SETS_EN[id]?.releaseDate ?? null,
    serie: setsById.get(id)?.serie?.name ?? SETS_EN[id]?.serie ?? null,
  }))
  .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
const serieDe = (s) => s.serie ?? 'Otras series';

// ficha de set reutilizada en /cartas/ y en /sets/
const setCardHtml = (s) => `<a class="set-card" href="/set/${s.id}/">
    <span class="set-name">${esc(s.name)}</span>
    <span class="muted">${s.n} cartas${s.fecha ? ` · ${año(s.fecha)}` : ''}</span>
    <span class="set-total">${s.total > 0 ? eur(s.total) : '<span class="muted">Sin precio</span>'}</span></a>`;

// ---------- hub /sets/: todos los sets agrupados por serie ----------
// Serie ordenada por su set más reciente (lo nuevo arriba); dentro, los sets por fecha.
const gruposSerie = (() => {
  const map = new Map();
  for (const s of setsConPrecio) {
    const k = serieDe(s);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  return [...map.entries()]
    .map(([serie, lista]) => ({
      serie,
      lista,
      nCartas: lista.reduce((x, s) => x + s.n, 0),
      total: lista.reduce((x, s) => x + s.total, 0),
      ultima: lista.reduce((max, s) => (s.fecha && s.fecha > max ? s.fecha : max), ''),
    }))
    .sort((a, b) => b.ultima.localeCompare(a.ultima));
})();
const nf = (n) => n.toLocaleString('es-ES');

await put(
  OUT('sets/index.html'),
  layout({
    title: `Todos los sets Pokémon por serie | ${config.brand}`,
    description: `Los ${setsConPrecio.length} sets de cartas Pokémon en ${gruposSerie.length} series, con número de cartas y valor de mercado del set completo. Precios de Cardmarket actualizados.`,
    url: '/sets/',
    body: `
<nav class="migas"><a href="/cartas/">Cartas</a> / Sets por serie</nav>
<h1>Todos los sets, por serie</h1>
<p class="lede">${setsConPrecio.length} sets en ${gruposSerie.length} series, con el número de cartas del catálogo y el
valor de mercado del set completo. Precios de referencia de Cardmarket actualizados el ${fechaLarga}.</p>
<p class="acciones">
  <a class="btn" href="/cartas/">Ver todas las cartas</a>
  <a class="btn ghost" href="/caras/">Las 100 más caras</a>
  <a class="btn ghost" href="/mercado/">Qué se mueve esta semana</a>
</p>
<p class="nota small">El valor del set suma el precio de referencia de sus cartas con datos
(${nf(priced.length)} de ${nf(cards.length)} del catálogo). No es una tasación: el estado de cada carta manda.</p>
${gruposSerie
  .map(
    (g) => `<section class="serie-grupo" aria-labelledby="serie-${slugify(g.serie)}">
  <div class="serie-cab">
    <h2 id="serie-${slugify(g.serie)}">${esc(g.serie)}</h2>
    <span class="serie-dato">${g.lista.length} sets · ${nf(g.nCartas)} cartas · ${g.total > 0 ? eur(g.total) : 'sin precios'}</span>
  </div>
  <div class="grid sets">
${g.lista.map(setCardHtml).join('\n')}
  </div>
</section>`,
  )
  .join('\n')}
<p class="acciones"><a class="btn ghost" href="/cartas/">Volver al listado de cartas</a></p>
<p class="nota small">Series y años según TCGdex. El valor suma el precio de referencia de cada carta con datos.</p>`,
  }),
);

await put(
  OUT('cartas/index.html'),
  layout({
    title: `Todas las cartas Pokémon con precio — ${config.brand}`,
    description: `Listado completo de ${cards.length.toLocaleString('es-ES')} cartas Pokémon por set, con precio de mercado actualizado.`,
    url: '/cartas/',
    body: `
<h1>Todas las cartas</h1>
<p class="lede">${cards.length.toLocaleString('es-ES')} cartas en el catálogo, ${priced.length.toLocaleString('es-ES')} con precio de mercado hoy.
Valor total del catálogo: <b>${eur(totalValor)}</b>.</p>
<p class="acciones">
  <a class="btn" href="/caras/">Las 100 más caras</a>
  <a class="btn ghost" href="/sets/">Los ${setsConPrecio.length} sets, por serie</a>
  <a class="btn ghost" href="/comprar/sobres/">Sobres y cajas</a>
  <a class="btn ghost" href="/valorar/">¿Cuánto vale mi colección?</a>
</p>
<p class="acciones"><a class="btn" href="/comprar/">Sobres y cajas verificados →</a></p>
<p class="nota small">Aviso de afiliado: si compras desde ese enlace, ValorCarta recibe una comisión de Amazon sin coste para ti.</p>
${munecosHtml}
<h2>Los ${setsConPrecio.length} sets, por valor de mercado</h2>
<p class="muted small">Cada ficha trae sus cartas con precio. También puedes verlos <a href="/sets/">agrupados por serie</a>.</p>
<div class="grid sets">
${setsConPrecio.map(setCardHtml).join('\n')}
</div>`,
  }),
);

// ---------- sets ----------
await mkdir(OUT('set'), { recursive: true });
for (const [id, list] of bySet) {
  const meta = setsById.get(id);
  const metaEn = SETS_EN[id] ?? {};
  const nombre = meta?.name ?? list[0].setName;
  const serie = meta?.serie?.name ?? metaEn.serie ?? null;
  const fechaSet = meta?.releaseDate ?? metaEn.releaseDate ?? null;
  const total = list.reduce((s, c) => s + (c.price ?? 0), 0);
  const top10 = list.filter((c) => c.price > 0).slice(0, 10);
  const caras = list.filter((c) => c.price > 0).length;
  const media = caras ? total / caras : 0;
  const body = `
<nav class="migas"><a href="/cartas/">Cartas</a> / <a href="/sets/">Sets por serie</a> / ${esc(nombre)}</nav>
<h1>Cartas de ${esc(nombre)}: lista y precios</h1>
<p class="lede">${list.length} cartas${fechaSet ? ` · ${año(fechaSet)}` : ''}${serie ? ` · ${esc(serie)}` : ''}.
${caras ? `Valor de mercado del set completo: <b>${eur(total)}</b>, con una media de ${eur(media)} por carta.` : 'Sin datos de precio suficientes todavía.'}</p>
<p id="progreso-set" data-set="${esc(id)}" data-total="${list.length}" class="nota small"></p>

${
  top10.length
    ? `<h2>Las más caras del set</h2>
<div class="grid">${top10.map(cardTile).join('')}</div>`
    : ''
}

<p class="acciones">
  ${
    ASINS_OK[id]?.length
      ? ASINS_OK[id].slice(0, 3).map((prod) => `<a class="btn" href="https://www.amazon.es/dp/${prod.asin}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank">${esc(prod.nombre)} en Amazon</a>`).join('\n')
      : `<p class="nota small">No hay producto verificado de este set en Amazon: no se enlaza para no mandarte a una búsqueda donde no hay nada que comprar. <a href="/comprar/">Ver los productos que sí se venden</a>.</p>`
  }
  <a class="btn ghost" href="/guardar-cartas/">Fundas para estas cartas</a>
  <a class="btn ghost" href="/valorar/">¿Cuánto vale mi colección?</a>
</p>
<p class="nota small">Enlace de afiliado: si compras desde aquí, ValorCarta recibe una comisión de Amazon que no cambia lo que pagas. ${ASINS_OK[id]?.length ? 'El botón lleva al producto sellado verificado de este set, no a una carta concreta.' : 'Este set no tiene ahora mismo un producto verificado y disponible: no enlazamos a Amazon.'}</p>

<h2>Preguntas frecuentes sobre ${esc(nombre)}</h2>
<div class="faq">
  <details><summary>¿Cuánto vale el set ${esc(nombre)} completo?</summary><p>Sumando el precio de referencia de sus ${caras} cartas con datos, <b>${eur(total)}</b>. La media por carta es ${eur(media)}.</p></details>
  <details><summary>¿Cuál es la carta más cara de ${esc(nombre)}?</summary><p>${top10[0] ? `<a href="/carta/${cardSlug(top10[0])}/">${esc(top10[0].name)}</a>, con ${eur(top10[0].price)}.` : 'Sin datos de precio todavía.'}</p></details>
  <details><summary>¿Estos precios son una tasación?</summary><p>No: son precios de referencia de mercado (Cardmarket). El estado de conservación puede cambiar el valor más de la mitad.</p></details>
</div>

<h2>Listado completo con precios</h2>
<table class="listado">
<thead><tr><th>Carta</th><th>Rareza</th><th class="num">Precio</th></tr></thead>
<tbody>
${list
  .map(
    (c) => `<tr>
  <td>${c.price > 0 ? `<a href="/carta/${cardSlug(c)}/">${esc(c.name)}</a>` : esc(c.name)} <span class="muted">${esc(c.localId ?? '')}</span></td>
  <td class="muted">${esc(c.rarity ?? '—')}</td>
  <td class="num">${c.price ? eur(c.price) : '—'}</td></tr>`,
  )
  .join('\n')}
</tbody></table>`;
  await put(
    OUT(`set/${id}/index.html`),
    layout({
      title: `Cartas de ${nombre} — lista completa y precios | ${config.brand}`,
      description: `Todas las cartas del set ${nombre} (${list.length}) con su precio de mercado actualizado. Valor total del set: ${eur(total)}.`,
      url: `/set/${id}/`,
      jsonld: [
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Cartas de ${nombre}`,
          numberOfItems: list.length,
          itemListElement: top10.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.name,
            url: `${SITE}/carta/${cardSlug(c)}/`,
          })),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: [
            { '@type': 'Question', name: `¿Cuánto vale el set ${nombre} completo?`, acceptedAnswer: { '@type': 'Answer', text: `Sumando el precio de referencia de sus ${caras} cartas con datos, ${eur(total)}.` } },
            { '@type': 'Question', name: `¿Cuál es la carta más cara de ${nombre}?`, acceptedAnswer: { '@type': 'Answer', text: top10[0] ? `${top10[0].name}, con ${eur(top10[0].price)}.` : 'Sin datos todavía.' } },
          ],
        },
      ],
      body,
    }),
  );
}



// ---------- radar (comercio editorial) ----------
for (const pieza of RADAR) {
  // una pieza puede no tener producto (una noticia de subasta no se compra):
  // sin este guardián el build revienta y no se publica NADA, ni lo demás
  const tarjeta = `
  <div style="border:1px solid #2a2a2e;border-radius:14px;padding:20px 20px 16px;margin:26px 0;background:#141416">
    <p style="margin:0 0 6px;font-size:.8rem;letter-spacing:.12em;color:#e0a800;font-weight:700">${esc(pieza.etiqueta)}</p>
    ${pieza.producto ? `<h3 style="margin:0 0 10px;font-size:1.22rem;line-height:1.3">${esc(pieza.producto.nombre)}</h3>
    <p style="margin:0 0 14px;color:#ddd">${esc(pieza.producto.precio)} · ${esc(pieza.producto.nota)}</p>
    <a class="btn" style="display:inline-block;padding:14px 20px;background:#e0a800;color:#111;border-radius:10px;font-weight:700;text-decoration:none" href="https://www.amazon.es/dp/${esc(pieza.producto.asin)}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank">Dónde conseguirlo</a>`
    : `<h3 style="margin:0 0 10px;font-size:1.22rem;line-height:1.3">Esto no se compra: se entiende</h3>
    <p style="margin:0 0 14px;color:#ddd">Esta pieza es una noticia, no un producto. Si te sirve, empieza por saber qué tienes.</p>
    <a class="btn" style="display:inline-block;padding:14px 20px;background:#e0a800;color:#111;border-radius:10px;font-weight:700;text-decoration:none" href="/valorar/">Valorar mi colección</a>`}
    ${pieza.alternativa ? `<a style="display:inline-block;margin-left:14px;font-size:.92rem;color:#e0a800" href="${esc(pieza.alternativa.enlace)}${/^https?:\/\/(www\.)?amazon\./.test(pieza.alternativa.enlace) ? `&tag=${encodeURIComponent(config.amazonTag)}` : ""}" rel="sponsored nofollow noopener" target="_blank">o ${esc(pieza.alternativa.nombre)}</a>` : ''}
    <p style="margin:14px 0 0;font-size:.78rem;color:#8b8b93;line-height:1.5">Aquí hay enlaces de afiliado: si compras desde ellos, ValorCarta recibe una comisión de Amazon que no cambia lo que pagas.</p>
  </div>`;

  // el redactor escribe con **negritas** de markdown; se convierten aquí o el
  // lector ve los asteriscos (pasó el 05-11 en las tres piezas publicadas)
  const conNegritas = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  // las piezas hablan de cartas y no enlazaban a ninguna (05-11): el primer nombre
  // que aparece se convierte en enlace a su ficha, con tope de 3 por pieza
  const mapaCartas = new Map();
  for (const c of priced) {
    if (!c.name || c.name.length < 4) continue;
    if (!mapaCartas.has(c.name)) mapaCartas.set(c.name, cardSlug(c));
  }
  const nombresOrden = [...mapaCartas.keys()].sort((a, b) => b.length - a.length);
  let enlazados = 0;
  const conEnlaces = (t) => {
    if (enlazados >= 3) return conNegritas(t);
    let salida = conNegritas(t);
    for (const nombre of nombresOrden) {
      if (enlazados >= 3) break;
      const re = new RegExp(`(?<![\\w>])(${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w<])`);
      if (!re.test(salida)) continue;
      salida = salida.replace(re, `<a href="/carta/${mapaCartas.get(nombre)}/">$1</a>`);
      enlazados += 1;
    }
    return salida;
  };
  // imagen entre párrafos (pedido §11: lectura → imágenes → vídeo → compra)
  const figura = pieza.imagen2
    ? `<figure style="margin:22px 0;text-align:center"><img src="${esc(pieza.imagen2)}" alt="${esc(pieza.pie2 || '')}" width="480" height="670" loading="lazy" style="max-width:100%;height:auto;border-radius:12px"><figcaption class="nota small">${esc(pieza.pie2 || '')}</figcaption></figure>`
    : '';
  const cuerpo = pieza.parrafos.map((t, idx) =>
    `<p>${conEnlaces(t)}</p>${idx === 1 ? figura : ''}`).join('\n');
  // W14: en una pieza sin producto la tarjeta va detrás del segundo párrafo,
  // no al final — el lector crítico avisaba de que no había salida en la primera pantalla
  const tarjetaArriba = !pieza.producto && pieza.parrafos.length > 2;

  await put(`radar/${pieza.slug}/index.html`, layout({
    title: `${pieza.titulo} | ${config.brand}`,
    description: pieza.gancho,
    url: `/radar/${pieza.slug}/`,
    body: `
<nav class="migas"><a href="/">Inicio</a> / <a href="/radar/">Radar</a> / ${esc(pieza.etiqueta)}</nav>
<p class="nota small">${esc(pieza.fecha)} · Radar ValorCarta</p>
<h1>${esc(pieza.titulo)}</h1>
<p class="lede">${esc(pieza.gancho)}</p>
<img src="${esc(pieza.imagen)}" alt="${esc(pieza.titulo)}" width="480" height="670" style="display:block;margin:22px auto;max-width:100%;height:auto;border-radius:12px">
${tarjetaArriba ? cuerpo.split('\n').slice(0, 2).join('\n') + tarjeta : cuerpo}
${tarjetaArriba ? cuerpo.split('\n').slice(2).join('\n') : ''}
${pieza.video ? `<div style="position:relative;padding-top:177%;margin:24px 0"><iframe src="${esc(pieza.video)}" title="${esc(pieza.titulo)}" frameborder="0" allowfullscreen loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border-radius:12px"></iframe></div>` : ''}
${tarjetaArriba ? '' : tarjeta}
<p><a href="/radar/">Volver al radar</a> · <a href="/caras/">Las 100 cartas más caras</a></p>`,
  }));
}

await put('radar/index.html', layout({
  title: `El radar Pokémon: qué se mueve y qué vale la pena | ${config.brand}`,
  description: 'Las piezas de actualidad de ValorCarta: qué carta Pokémon se mueve, qué set cambia y dónde conseguirlo.',
  url: '/radar/',
  body: `
<h1>El radar</h1>
<p class="lede">Lo que se mueve esta semana en las cartas Pokémon y lo que significa si quieres comprarlo. Cada pieza lleva su dato, su fecha y su fuente.</p>
<p class="acciones"><a class="btn" href="/caras/">Las 100 más caras</a>
<a class="btn ghost" href="/mercado/">Qué se mueve esta semana</a>
<a class="btn ghost" href="/valorar/">Valorar mi colección</a></p>
<p class="acciones"><a class="btn" href="/comprar/">Sobres y cajas verificados →</a></p>
<p class="nota small">Aviso de afiliado: si compras desde ese enlace, ValorCarta recibe una comisión de Amazon sin coste para ti. El precio no cambia.</p>
<div class="nota small" style="max-width:64ch;margin:0 0 18px">
  <p><b>Cómo se lee esto:</b> cada pieza empieza por lo que ha pasado, sigue con el número de nuestro catálogo
  y termina con lo que puedes hacer —comprar, esperar o pasar—. Si un dato no lo tenemos, no se publica.</p>
  <p>Ninguna pieza es una recomendación de inversión: el precio de referencia es una media del mercado,
  y el estado de la carta mueve más el valor que cualquier noticia.</p>
</div>
${RADAR.map((p) => `<article style="margin:26px 0"><p class="nota small">${esc(p.fecha)} · ${esc(p.etiqueta)}</p><h2><a href="/radar/${p.slug}/">${esc(p.titulo)}</a></h2><p>${esc(p.gancho)}</p></article>`).join('\n')}`,
}));


// ---------- guía: idioma ----------
await put('guias/idioma/index.html', layout({
  title: `¿Valen más las cartas en inglés o en español? | ${config.brand}`,
  description: 'Qué cambia el valor de una carta Pokémon según el idioma: por qué el inglés suele pagarse más, cuándo el japonés gana y qué mirar antes de comprar o vender.',
  url: '/guias/idioma/',
  body: `
<nav class="migas"><a href="/">Inicio</a> / <a href="/guias/">Guías</a> / Idioma</nav>
<h1>¿Valen más las cartas Pokémon en inglés o en español?</h1>
<p class="lede">La respuesta corta: <b>casi siempre el inglés</b>, salvo excepciones que tienen que ver con la edición y con quién colecciona. La larga es la que te ahorra dinero.</p>

<h2>Por qué el inglés manda</h2>
<p>El mercado de cartas Pokémon es global y su idioma franco es el inglés. Eso significa más compradores, más ventas cerradas y precios de referencia más altos. Una carta en español tiene menos demanda internacional: se vende bien en España, pero tarda más y a menor precio cuando compite fuera.</p>
<p>No es una regla de valor intrínseco: es liquidez. La misma carta impresa en dos idiomas vale distinto porque el número de personas que la quiere en cada idioma es distinto.</p>

<h2>Cuándo el español sí interesa</h2>
<p>Tres casos, y son concretos:</p>
<ul>
  <li><b>Coleccionistas de aquí.</b> Hay quien hace la colección completa en español y paga por ella, sobre todo en sets antiguos donde el español fue tirada corta.</li>
  <li><b>Sets con muy poca tirada en español.</b> En ediciones viejas, el español puede ser más raro que el inglés dentro de España, aunque siga valiendo menos fuera.</li>
  <li><b>Comprar aquí para jugar.</b> Si la carta es para jugar y no para coleccionar, el idioma da igual y el español suele salir más barato.</li>
</ul>

<h2>El japonés es otro mundo</h2>
<p>No es «el idioma de la carta»: es otro catálogo. Las japonesas tienen tiradas, numeraciones y acabados distintos, y se coleccionan aparte. Una carta japonesa no es una versión de la inglesa; es otra carta a efectos de precio.</p>

<h2>Qué mirar antes de comprar o vender</h2>
<ol>
  <li><b>Edición y número.</b> Antes que el idioma: el mismo nombre puede existir en cinco sets distintos con precios que no se parecen.</li>
  <li><b>Idioma impreso.</b> Se ve en el símbolo y en el texto. Una carta en español no se convierte en inglesa por estar en una funda.</li>
  <li><b>Estado.</b> Un doblez pesa más en el precio que el idioma. Primero estado, después idioma.</li>
  <li><b>Ventas cerradas, no anuncios.</b> Lo que pide un vendedor no es lo que paga el mercado.</li>
</ol>

<h2>Lo que no te podemos decir</h2>
<p>Nuestro precio de referencia es <b>uno</b> por carta y no distingue idioma. Es el dato que hay, y por eso cada ficha avisa: la misma carta en otra edición o en japonés puede costar la mitad o el doble. Cuando tengamos precios separados por idioma, lo diremos aquí y en cada ficha.</p>
<p class="nota small">Precios de referencia de Cardmarket, actualizados a diario. No es una tasación.</p>

<p class="acciones">
  <a class="btn" href="/caras/">Las 100 cartas más caras</a>
  <a class="btn ghost" href="/valorar/">¿Cuánto vale mi colección?</a>
</p>
<div style="border:1px solid #2a2a2e;border-radius:14px;padding:18px;margin:26px 0;background:#141416">
  <p style="margin:0 0 6px;font-size:.8rem;letter-spacing:.12em;color:#e0a800;font-weight:700">SI LO QUE QUIERES ES ABRIR SOBRES</p>
  <h3 style="margin:0 0 8px;font-size:1.15rem">Sobres del 30.º aniversario</h3>
  <p style="margin:0 0 12px;color:#ddd">El producto que más rota y el que más gente abre en español.</p>
  <a class="btn" href="https://www.amazon.es/dp/B0H8T5GC4W?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank">Dónde conseguirlo</a>
  <p style="margin:12px 0 0;font-size:.78rem;color:#8b8b93">Aquí hay enlaces de afiliado: si compras desde ellos, ValorCarta recibe una comisión de Amazon que no cambia lo que pagas.</p>
</div>`
}));

// ---------- cartas ----------
await mkdir(OUT('carta'), { recursive: true });
let n = 0;
const BATCH = 200;
for (let i = 0; i < priced.length; i += BATCH) {
  await Promise.all(
    priced.slice(i, i + BATCH).map(async (c) => {
      const slug = cardSlug(c);
      const meta = setsById.get(c.setId);
      const total = meta?.cardCount?.official ?? meta?.cardCount?.total ?? bySet.get(c.setId)?.length ?? 0;
      const year = año(c.releaseDate);
      const relacionados = (bySet.get(c.setId) ?? [])
        .filter((x) => x.id !== c.id && x.price)
        .slice(0, 6);
      // contexto calculado: ranking en el set, reimpresiones y variación real
      const delSet = (bySet.get(c.setId) ?? []).filter((x) => x.price > 0);
      const posSet = delSet.findIndex((x) => x.id === c.id) + 1;
      const versiones = (porNombre.get(c.name.toLowerCase()) ?? []).filter((x) => x.price > 0);
      const barata = versiones.length > 1 ? Math.min(...versiones.map((x) => x.price)) : null;
      const contexto = [
        posSet === 1 && delSet.length > 2 ? 'Es la carta más cara de su set.' : posSet > 0 && delSet.length > 2 ? `Es la número ${posSet} de ${delSet.length} en valor dentro de su set.` : '',
        versiones.length > 1 ? `Existen ${versiones.length} versiones de este personaje; la más barata está a ${eur(barata)}.` : '',
      ].filter(Boolean).join(' ');

      const rar = c.rarity && c.rarity !== 'Ninguno' ? `Carta ${String(c.rarity).toLowerCase()}` : 'Carta';
      const tipo = c.types?.length ? ` de tipo ${c.types.join(' y ')}` : '';
      const ps = c.hp ? `, ${c.hp} PS` : '';
      const fase = c.stage && c.stage !== 'Básica' ? `, fase ${c.stage.toLowerCase()}` : '';
      const descripcion = `${rar}${tipo}${fase}${ps} del set ${c.setName}${year ? ` (${year})` : ''}${
        c.illustrator ? `, ilustrada por ${c.illustrator}` : ''
      }`;

      const datos = [
        ['Tipo', c.types?.join(' / ')],
        ['PS', c.hp],
        ['Fase', c.stage],
        ['Evoluciona de', c.evolveFrom],
        ['Habilidades', c.abilities?.join(', ')],
        ['Debilidad', c.weaknesses?.map((w) => `${w.type} ${w.value}`).join(' · ')],
        ['Coste de retirada', c.retreat ?? null],
        [
          'Legalidad',
          c.legal
            ? c.legal.standard
              ? 'Estándar y Expandido'
              : c.legal.expanded
                ? 'Solo Expandido'
                : 'No legal en torneo'
            : null,
        ],
        ['Marca de regulación', c.regulationMark],
        ['Rareza', c.rarity && c.rarity !== 'Ninguno' ? c.rarity : null],
        ['Ilustrador', c.illustrator],
      ].filter(([, v]) => v !== null && v !== undefined && v !== '');

      const ataques = (c.attacks ?? [])
        .filter((a) => a.name || a.damage)
        .slice(0, 4)
        .map(
          (a) => `<li>${a.name ? `<b>${esc(a.name)}</b> ` : ''}${a.damage ? `<span class="dmg">${esc(a.damage)}</span>` : ''}${
            a.cost?.length ? ` <span class="muted small">(${a.cost.map(esc).join(' · ')})</span>` : ''
          }</li>`,
        )
        .join('');

            // 09-11 ORDEN DEL DUEÑO: la carta suelta NO se vende en Amazon.
      // Solo se enlaza a Amazon si hay producto verificado: /dp/ exacto. Sin producto, no hay CTA de Amazon.
      // ORDEN DEL DUEÑO: esta carta suelta no se vende en Amazon. No se enlaza a otro
      // producto del set: el enlace iría con algo que no es lo que se está viendo.
      const ctaAmazon = `<p class="nota small" style="margin:14px 0 6px"><b>Esta carta suelta no se vende en Amazon.</b>
    Aquí no hay enlace de compra: no te mandamos a otro producto en su lugar. Los productos
    que sí se venden y sí dan comisión están en <a href="/comprar/">los productos verificados</a>.</p>`;

      const relacionadasHtml = relacionados.length
        ? `<section class="relacionadas"><div class="rel-cab"><h2>Cartas relacionadas</h2><a href="/set/${c.setId}/">Ver el set completo${total ? ` (${total})` : ''} →</a></div><div class="rel-grid">${relacionados.slice(0, 4).map(cardTile).join('')}</div></section>`
        : '';
      const body = `
<nav class="migas"><a href="/cartas/">Cartas</a> / <a href="/set/${c.setId}/">${esc(c.setName)}</a> / ${esc(c.name)}</nav>
<div class="ficha2">
  <div class="ficha2-main">
    <div class="ficha2-carta">
      ${c.image ? `<img src="${esc(c.image)}/high.webp" alt="Carta ${esc(c.name)} de ${esc(c.setName)}" width="480" height="670" loading="eager" onerror="this.style.display='none'">` : ''}
    </div>
    <h1>¿Cuánto vale ${esc(c.name)}?</h1>
    ${(() => {
      // El héroe y la variación de 30 d tienen que salir de la MISMA fila: la más
      // barata (lo que se enseña como «desde»). Un listado de Cardmarket por fila,
      // igual que la tabla; si no, la ficha cuenta más variantes de las que enseña.
      const filas = [];
      const vistos = new Set();
      for (const v of c.variants ?? []) {
        const p = listingPrice(v);
        if (typeof p !== 'number' || p <= 0) continue;
        const clave = v.productId ?? `${v.type}|${v.subtype}|${filas.length}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        filas.push(v);
      }
      const precios = filas.map(listingPrice).sort((a, b) => a - b);
      const vHero = heroVariant(c);
      if (precios.length < 2) {
        return `<p class="precio-grande">${eur(listingPrice(vHero) ?? c.price)}<span class="muted"> · referencia ${filas[0]?.type ?? 'normal'}</span></p>`;
      }
      const min = precios[0];
      const max = precios[precios.length - 1];
      // el héroe es la entrada más barata, no el máximo: el máximo solo desinfla la credibilidad
      return `<p class="precio-grande">desde ${eur(listingPrice(vHero))}</p>
      <p class="muted small">${precios.length} variantes, de ${eur(min)} a ${eur(max)}. La versión cambia el precio: mírala en la tabla antes de fiarte de una cifra.</p>`;
    })()}
    ${trendLine(c)}
    ${ctaAmazon}
    <p class="muted">${esc(descripcion)}. Número ${esc(c.localId ?? '—')}/${total}.</p>
    ${priceTable(c)}
    <p class="muted small">La versión y el idioma cambian lo que vale: la misma carta en otra edición o en japonés puede costar la mitad o el doble. Compara la fila de la tabla antes de decidir.</p>
    <p><a class="btn ghost" href="/set/${c.setId}/">Ver el set completo${total ? ` (${total} cartas)` : ''}</a></p>
    ${
      ataques
        ? `<h2 class="mini">Ataques</h2><ul class="ataques">${ataques}</ul>`
        : ''
    }
    ${
      datos.length
        ? `<table class="prices datos"><tbody>${datos
            .map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${esc(String(v))}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
    }
    ${contexto ? `<p class="contexto">${esc(contexto)}</p>` : ''}
    <p class="nota">Precio de referencia de Cardmarket (media de ventas, no tasación). Una carta en estado Near Mint vale más; una con desgaste, bastante menos.</p>
    <p class="nota"><a href="/guardar-cartas/">¿Cómo guardar esta carta? →</a> · <a href="/caras/">Las 100 más caras →</a></p>
    <div class="acciones">
      <button class="btn ghost" data-add="${slug}">Añadir a mi colección</button>
      <a class="btn ghost" href="/valorar/">Valorar la colección entera</a>
    </div>
    <div class="alerta-box">
      <span class="muted small">Avísame si baja de</span>
      <input id="umbral" type="number" min="1" step="0.5" placeholder="${Math.max(1, Math.round((c.price ?? 10) * 0.85))}" aria-label="Precio objetivo">
      <span class="muted small">€</span>
      <button class="btn" data-watch="${slug}">Activar aviso</button>
    </div>
    ${relacionadasHtml}
  </div>
  ${sugerenciasHtml()}
</div>
${(() => {
  const otras = (porNombre.get(c.name.toLowerCase()) ?? []).filter((x) => x.id !== c.id).slice(0, 6);
  if (!otras.length) return '';
  const min = Math.min(...otras.map((x) => x.price));
  return `<section class="bloque"><h2>Otras versiones de ${esc(c.name)}</h2>
  <p class="muted">La misma carta en otros sets. La más barata desde ${eur(min)}.</p>
  <div class="grid">${otras.map(cardTile).join('')}</div></section>`;
})()}`;

      const enSlugFor = enSlugById.get(c.id);
      const html = layout({
        title: `${c.name} ${c.localId ?? ''} — ${c.setName}: precio y valor | ${config.brand}`,
        description: `¿Cuánto vale ${c.name} de ${c.setName}? Precio de mercado hoy: ${eur(c.price)}. Media de 30 días y mínimo, actualizado a diario.`,
        url: `/carta/${slug}/`,
        alternates: enSlugFor ? altPair(`/carta/${slug}/`, `/en/card/${enSlugFor}/`) : undefined,
        noindex: !indexables.has(c.id),
        image: c.image ? `${c.image}/high.webp` : undefined,
        body,
        jsonld: [
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
              { '@type': 'ListItem', position: 2, name: c.setName, item: `${SITE}/set/${c.setId}/` },
              { '@type': 'ListItem', position: 3, name: c.name, item: `${SITE}/carta/${cardSlug(c)}/` },
            ],
          },
          {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: `${c.name} — ${c.setName}`,
          image: c.image ? `${c.image}/high.webp` : undefined,
          description: `${rar} del set ${c.setName}`,
          brand: { '@type': 'Brand', name: 'Pokémon' },
          offers: {
            '@type': 'Offer',
            price: c.price,
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
            url: `${SITE}/carta/${slug}/`,
          },
        },
        ],
      });
      await put(OUT(`carta/${slug}/index.html`), html);
      n++;
    }),
  );
  process.stdout.write(`  cartas ${Math.min(i + BATCH, priced.length)}/${priced.length}\n`);
}

// ---------- guias ----------

for (const g of guias) {
  await put(
    OUT(`guia/${g.slug}/index.html`),
    layout({
      title: `${g.title} | ${config.brand}`,
      description: g.description,
      url: `/guia/${g.slug}/`,
      body: `<nav class="migas"><a href="/guias/">Guías</a> / ${esc(g.title)}</nav>
<article class="prosa"><h1>${esc(g.title)}</h1>${g.html}</article>
<div class="acciones"><a class="btn" href="/valorar/">Valorar mi colección</a>
<a class="btn ghost" href="/guias/">Más guías</a></div>`,
    }),
  );
}
if (guias.length) {
  await put(
    OUT('guias/index.html'),
    layout({
      title: `Guías de cartas Pokémon — comprar, guardar y vender | ${config.brand}`,
      description:
        'Guías prácticas sobre cartas Pokémon: detectar falsificaciones, conservarlas, comprar sin pagar de más y vender sin perder dinero.',
      url: '/guias/',
      body: `<h1>Guías</h1>
<p class="acciones">
  <a class="btn" href="/guardar-cartas/">Guardar y proteger cartas</a>
  <a class="btn ghost" href="/comprar/">Comprar sin pagar de más</a>
</p>
<p class="acciones"><a class="btn" href="/comprar/">Sobres y cajas verificados →</a></p>
<p class="nota small">Enlace de afiliado: ValorCarta recibe una comisión de Amazon si compras desde ahí, sin coste para ti.</p>
<p class="lede">Lo que aprendes a base de comprar mal. Sin humo y sin promesas de rentabilidad.</p>
<div class="grid guias-grid">
${guias
  .map(
    (g) => `<a class="guia-card" href="/guia/${g.slug}/">
  <span class="guia-t">${esc(g.title)}</span>
  <span class="muted small">${esc(g.description)}</span></a>`,
  )
  .join('\n')}
</div>`,
    }),
  );
}

// ---------- valorar ----------
await put(
  OUT('valorar/index.html'),
  layout({
    title: `¿Cuánto vale mi carta de Pokémon? Valoración gratis | ${config.brand}`,
    description:
      'Calcula gratis cuánto vale tu colección de cartas Pokémon con precios de mercado actualizados. Añade cartas, guarda el enlace y sigue el valor con el tiempo.',
    url: '/valorar/',
    alternates: altPair('/valorar/', '/en/price-check/'),
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://valorcarta.github.io/' },
        { '@type': 'ListItem', position: 2, name: 'Valorar cartas', item: 'https://valorcarta.github.io/valorar/' },
      ],
    }, {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: '¿Cuánto vale mi carta de Pokémon?', acceptedAnswer: { '@type': 'Answer', text: 'Depende del estado, la versión y el idioma. Aquí ves el precio de referencia de Cardmarket de la versión concreta, con su media de 30 días y el mínimo, para que el número no dependa de un día raro.' } },
        { '@type': 'Question', name: '¿Es gratis valorar mi colección?', acceptedAnswer: { '@type': 'Answer', text: 'Sí. No hace falta registro ni dejar tu email: buscas la carta, pones cuántas tienes y el total se calcula en tu navegador.' } },
        { '@type': 'Question', name: '¿Los precios son una tasación?', acceptedAnswer: { '@type': 'Answer', text: 'No. Son precios de referencia de mercado. Una carta en Near Mint puede valer el doble que la misma con desgaste, y una tasación exige ver la carta.' } },
      ],
    }],
    body: `
<h1>¿Cuánto vale mi carta de Pokémon?</h1>
<p class="nota small">Precios de Cardmarket actualizados a ${new Date().toISOString().slice(0, 10)}.</p>
<p class="lede">Escribe el nombre de tu carta y te digo cuánto vale hoy. Precio de referencia de Cardmarket, media de los últimos 30 días y mínimo, para que sepas si ese número es de verdad o es de un día raro.</p>
<p class="lede">Busca cada carta, pon cuántas tienes y el total se calcula con el precio de mercado de hoy.
Se guarda en tu navegador y puedes compartir el resultado con un enlace.</p>
<div class="buscador grande">
  <input id="q" type="search" placeholder="Busca por nombre: Charizard, Pikachu, Mew ex…" autocomplete="off" aria-label="Buscar carta">
  <div id="resultados" class="resultados"></div>
</div>
<div class="modo-frase">
  <label for="frase" class="muted small">O escríbela como la dirías: «2 charizard base y un pikachu de 151»</label>
  <div class="frase-fila">
    <input id="frase" type="text" placeholder="2 charizard base, pikachu 151…" autocomplete="off">
    <button id="interpretar" class="btn">Añadir</button>
  </div>
  <p id="frase-out" class="nota small"></p>
</div>
<div class="dos-col coleccion">
  <div>
    <h2>Tu colección <span id="n-cartas" class="muted"></span></h2>
    <div id="coleccion" class="coleccion-lista"><p class="muted">Todavía no has añadido cartas.</p></div>
  </div>
  <aside class="total-caja">
    <p class="muted">Valor de mercado hoy</p>
    <p id="total" class="total">0,00 €</p>
    <p id="delta" class="muted"></p>
    <button id="compartir" class="btn">Copiar enlace para compartir</button>
    <button id="csv" class="btn ghost">Descargar CSV</button>
    <button id="vaciar" class="btn ghost">Vaciar</button>
    <p class="nota small">Los precios son de referencia (Cardmarket) y no incluyen estado ni gastos de envío.</p>
    <a class="btn ghost" href="/premium/">Quiero alertas cuando bajen</a>
  </aside>
</div>`,
  }),
);

// ---------- premium ----------
await put(
  OUT('premium/index.html'),
  layout({
    title: `Alertas de precio de cartas Pokémon | ${config.brand} Premium`,
    description:
      'Avisos cuando una carta de tu lista baja de precio, historial completo y seguimiento del valor de tu colección. 4,99 €/mes, sin permanencia.',
    url: '/premium/',
    body: `
<h1>Enterarte antes de que suba</h1>
<p class="lede">El valorador es gratis y lo seguirá siendo. Lo de pago es el aviso: cuando una carta de tu lista
baja de precio, cuando un set se agota y cuando tu colección cambia de valor.</p>
<div class="grid planes">
  <div class="plan">
    <h2>Gratis</h2>
    <p class="precio">0 €</p>
    <ul>
      <li>Valorar la colección sin límite</li>
      <li>Precio y tendencia de 30 días de cada carta</li>
      <li>Enlace para compartir y CSV</li>
      <li>Catálogo completo en español</li>
    </ul>
    <a class="btn ghost" href="/valorar/">Empezar</a>
  </div>
  <div class="plan destacado">
    <h2>Premium</h2>
    <p class="precio">${config.precio.mes}<span class="muted">/mes</span></p>
    <ul>
      <li><b>Alertas</b> cuando una carta de tu lista baja de precio</li>
      <li>Historial completo de precios (no solo 30 días)</li>
      <li>Aviso mensual del valor de tu colección</li>
      <li>Watchlist ilimitada y CSV con historial</li>
    </ul>
    <a class="btn" href="${esc(config.premiumUrl)}">Suscribirme</a>
    <p class="nota small">Cobro con Lemon Squeezy (IVA de la UE incluido). Cancelas cuando quieras, sin llamadas.</p>
  </div>
</div>
<section class="bloque">
  <h2>Qué NO es esto</h2>
  <p>No es una tasación oficial ni una promesa de revalorización. Es el precio al que se están vendiendo
  cartas parecidas esta semana, con la fuente a la vista. Si algo no tiene datos, lo decimos.</p>
</section>`,
  }),
);

// ---------- mercado: el radar se calcula al principio (lo comparte con la portada) ----------
const filaRadar = (c, cls) => `<tr>
  <td><a href="/carta/${cardSlug(c)}/">${esc(c.name)}</a> <span class="muted small">${esc(c.setName)}</span></td>
  <td class="num">${eur(c.price)}</td>
  <td class="num ${cls}">${c.var7 >= 0 ? '+' : ''}${c.var7.toFixed(1)}%</td>
</tr>`;

// ---------- vitrina de /mercado/: las cartas, antes que la tabla ----------
// La tabla dice qué se mueve; la vitrina lo enseña y ofrece la compra.
// Las candidatas y la carta del día son las mismas que las de la portada.
const vitrinaHero = cartaDelDia;
const vitrinaResto = vitrinaCandidatas.slice(1, 3);

const vitrinaHeroHtml = vitrinaHero
  ? (() => {
      const v = bestVariant(vitrinaHero);
      const slug = cardSlug(vitrinaHero);
      const medias =
        v?.avg7 && v?.avg30
          ? `<p class="vh-dato muted small">Media de 7 días: ${eur(v.avg7)}. Media de 30: ${eur(v.avg30)}. La variación sale de esas dos medias, no de una sola venta.</p>`
          : '';
      return `<article class="vitrina-hero">
  <a class="vh-arte" href="/carta/${slug}/" aria-label="Ver la ficha de ${esc(vitrinaHero.name)}">
    <span class="vh-glow" aria-hidden="true"></span>
    <span class="carta3d" data-tilt>
      <img src="${esc(vitrinaHero.image)}/high.webp" alt="Carta ${esc(vitrinaHero.name)} de ${esc(vitrinaHero.setName)}" width="480" height="670" loading="eager" fetchpriority="high" decoding="async">
    </span>
  </a>
  <div class="vh-ficha">
    <p class="kicker">La que más sube esta semana</p>
    <h3><a href="/carta/${slug}/">${esc(vitrinaHero.name)}</a></h3>
    <p class="vh-set muted">${esc(vitrinaHero.setName)}</p>
    <p class="vh-precio">${eur(vitrinaHero.price)}</p>
    <p class="vh-trend"><b class="up">${varFmt(vitrinaHero.var7)}</b> <span class="muted small">frente a su media de 30 días</span></p>
    ${medias}
    <div class="vh-acciones">
      ${ctaCarta(vitrinaHero)}
      <a class="btn ghost" href="/carta/${slug}/">Ver ficha y precios</a>
    </div>
  </div>
</article>`;
    })()
  : '';

const vitrinaMini = (c) => {
  const slug = cardSlug(c);
  return `<article class="carta-vitrina">
  <a class="cv-foto" href="/carta/${slug}/">
    <img src="${esc(c.image)}/high.webp" alt="Carta ${esc(c.name)} de ${esc(c.setName)}" width="480" height="670" loading="lazy" decoding="async">
    <span class="cv-trend up">${varFmt(c.var7)}</span>
  </a>
  <a class="cv-nombre" href="/carta/${slug}/">${esc(c.name)}</a>
  <p class="cv-set muted small">${esc(c.setName)}</p>
  <div class="cv-pie">
    <span class="cv-precio">${eur(c.price)}</span>
    <a class="cv-btn" href="/carta/${cardSlug(c)}/" aria-label="Ver precio de ${esc(c.name)}">Ver</a>
  </div>
</article>`;
};

const vitrinaHtml = vitrinaHero
  ? `<section class="vitrina" aria-labelledby="vitrina-titulo">
  <div class="vitrina-cab">
    <p class="kicker">El escaparate de la semana</p>
    <h2 id="vitrina-titulo">Las cartas que se están moviendo</h2>
    <p class="lede">Las cartas con producto verificado que más han subido frente a su media de 30 días, con imagen y precio de referencia. El dato es de hoy; la subida no es una promesa.</p>
  </div>
  ${vitrinaHeroHtml}
  <div class="vitrina-grid">${vitrinaResto.map(vitrinaMini).join('')}</div>
  <p class="nota small">Enlaces de afiliado de Amazon: si compras desde ellos, ValorCarta recibe una comisión que no cambia lo que pagas. Amazon apenas vende cartas sueltas: el botón abre su buscador; el sellado sí está a la venta. Precios de referencia de Cardmarket vía TCGdex, actualizados el ${fechaLarga}.</p>
</section>`
  : '';

await put(
  OUT('mercado/index.html'),
  layout({
    title: `Qué cartas están subiendo y bajando esta semana | ${config.brand}`,
    description:
      'Radar de precios de cartas Pokémon: las que más suben y bajan esta semana frente a su media de 30 días, con imagen, precio de referencia y dónde comprarlas.',
    url: '/mercado/',
    alternates: altPair('/mercado/', '/en/market/'),
    image: vitrinaHero?.image ? `${vitrinaHero.image}/high.webp` : undefined,
    body: `
<h1>Qué se mueve esta semana</h1>
<p class="lede">Comparación de la media de 7 días frente a la de 30, sobre ${radar.length.toLocaleString('es-ES')} cartas.
Precios de Cardmarket actualizados el ${fechaLarga}. Esto no es un artículo: es el mercado de hoy.</p>

${vitrinaHtml}

${munecosHtml}

<p class="acciones">
  <a class="btn ghost" href="/caras/">Las 100 más caras</a>
  <a class="btn ghost" href="/comprar/sobres/">Sobres y cajas, por tipo</a>
  <a class="btn ghost" href="/comprar/">Dónde comprar sin pagar de más</a>
</p>

<section class="bloque">
  <h2>El radar completo</h2>
  <p class="muted">Las veinte que más suben y las veinte que más bajan entre las ${radar.length.toLocaleString('es-ES')} cartas con datos suficientes. La tabla es el dato en crudo; el escaparate de arriba, las mismas cartas con imagen.</p>
  <div class="dos-col">
    <div>
      <h3 class="radar-h">Suben</h3>
      <table class="listado"><thead><tr><th>Carta</th><th class="num">Precio</th><th class="num">7 d</th></tr></thead>
      <tbody>${suben.map((c) => filaRadar(c, 'up')).join('')}</tbody></table>
    </div>
    <div>
      <h3 class="radar-h">Bajan</h3>
      <table class="listado"><thead><tr><th>Carta</th><th class="num">Precio</th><th class="num">7 d</th></tr></thead>
      <tbody>${bajan.map((c) => filaRadar(c, 'down')).join('')}</tbody></table>
    </div>
  </div>
</section>

<section class="bloque">
  <h2>Cómo se calcula</h2>
  <p>No usamos el precio del día: una sola venta mueve la aguja. Comparamos la media de los últimos 7 días con la de 30,
  y descartamos cartas por debajo de 10 € y variaciones por encima del 60%, que en cartas con pocas ventas son ruido y no tendencia.</p>
  <p class="muted">Precios de referencia de Cardmarket vía TCGdex. No es una predicción ni una recomendación de compra.</p>
</section>`,
  }),
);

// ---------- oauth callback (recibe el codigo de Pinterest) ----------
await put(
  OUT('oauth/index.html'),
  layout({
    title: 'Conexión con Pinterest',
    description: 'Página de retorno del proceso de autorización.',
    url: '/oauth/',
    noindex: true,
    body: `
<h1>Autorización de Pinterest</h1>
<p class="lede">Pega el código que aparece en la barra de direcciones justo después de <code>code=</code>.</p>
<div class="buscador">
  <input id="code" type="text" placeholder="Aquí el código" aria-label="Código de autorización">
</div>
<p><button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('code').value)">Copiar</button></p>
<p class="nota small">Esta página no envía nada a ningún sitio: solo sirve para que el código quede a mano.</p>
<script>
  const q = new URLSearchParams(location.search);
  const c = q.get('code');
  if (c) document.getElementById('code').value = c;
</script>`,
  }),
);

// ---------- guardar cartas (hub de compra con ASIN reales) ----------
const PRODUCTOS_GUARDAR = [
  {
    tramo: 'Hasta 5 €',
    que: 'Funda blanda (penny sleeve)',
    asin: 'B085DNDLC1',
    nombre: 'Ultra Pro Penny Sleeve, 400 unidades',
    veredicto: 'Para lo que no merece más: evita el roce y el polvo por céntimos la carta.',
    porque: 'Es la primera barrera y la que se cambia si se ensucia. No protege de doblarse.',
    precio: 'desde 6,71 €',
  },
  {
    tramo: '5-50 €',
    que: 'Toploader rígido',
    asin: 'B000Q5ZMM0',
    nombre: 'Ultra Pro Toploader 3x4, pack de 25',
    veredicto: 'La carta va dentro de la funda blanda y luego aquí. Sin esto, la esquina se dobla y la carta pierde la mitad del valor.',
    porque: 'Rígido, entra en cualquier caja de envío y es lo que piden los compradores al recibir.',
    precio: 'desde 8 €',
  },
  {
    tramo: '50-200 €',
    que: 'Toploader por unidad o pack grande',
    asin: 'B0812Z3RPY',
    nombre: 'Ultra Pro Toploader 3x4, 100 unidades',
    veredicto: 'A partir de aquí la carta viaja fuera de casa: se envía en toploader, con funda y entre cartón.',
    porque: 'El pack grande sale mucho mejor por unidad y es lo que se gasta al vender varias.',
    precio: 'desde 20 €',
  },
  {
    tramo: 'La colección entera',
    que: 'Álbum con cremallera',
    asin: 'B0D7W2PJR8',
    nombre: 'Álbum de 540 cartas, 9 bolsillos y cremallera',
    veredicto: 'Para lo que no se vende ni se toca cada día: la colección entera fuera del polvo, del sol y de las anillas metálicas.',
    porque: 'Cierre y páginas cosidas: las anillas clásicas marcan la carta con el tiempo.',
    precio: 'desde 25,98 €',
  },
];

const fechaHoy = new Date().toISOString().slice(0, 10);

await put(
  OUT('guardar-cartas/index.html'),
  layout({
    title: `Cómo guardar cartas Pokémon: qué funda según lo que valen | ${config.brand}`,
    description:
      'Qué funda, toploader o binder usar según el valor de la carta, con productos concretos y el criterio detrás. Sin humo y sin fingir pruebas que no hemos hecho.',
    url: '/guardar-cartas/',
    body: `
<nav class="migas"><a href="/guias/">Guías</a> / Guardar cartas</nav>
<h1>Cómo guardar cartas según lo que valen</h1>
<p class="aviso-afiliado">En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables. Los precios los pone Amazon. · Revisado: ${fechaHoy}</p>
<p class="lede">No todas las cartas merecen el mismo gasto. La regla es simple: la protección tiene que costar menos que
lo que protege, y en cuanto la carta vale más de lo que cuesta un toploader, no hay discusión.</p>

<table class="listado">
<thead><tr><th>Tramo</th><th>Qué usar</th><th>Por qué</th></tr></thead>
<tbody>
${PRODUCTOS_GUARDAR.map(
  (p) => `<tr><td><b>${esc(p.tramo)}</b></td><td>${esc(p.que)}</td><td class="muted">${esc(p.porque)}</td></tr>`,
).join('')}
</tbody></table>

<section class="bloque">
  <h2>Uno por tramo, con el veredicto delante</h2>
  ${PRODUCTOS_GUARDAR.map(
    (p) => `<div class="reco">
    <p class="reco-tramo">${esc(p.tramo)}</p>
    <p class="reco-veredicto">${esc(p.veredicto)}</p>
    ${imgProducto(p.asin)}
    <p class="reco-nombre">${esc(p.nombre)} <span class="muted">· ${esc(p.precio)}</span></p>
    <a class="btn" href="https://www.amazon.es/dp/${p.asin}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank">Ver precio en Amazon</a>
    ${recosHtml(p.asin)}
  </div>`,
  ).join('')}
</section>

<section class="bloque">
  <h2>Productos que encajan entre sí</h2>
  <p class="muted">Cada pieza protege la siguiente: funda blanda → toploader → álbum. Si compras una, aquí tienes la que va con ella. Todos los enlaces llevan a Amazon con nuestra etiqueta de afiliado.</p>
  <ul class="pasos">
    <li><a href="/comprar/">Cajas, ETB y lotes</a> — el formato que compras antes de guardar.</li>
    <li><a href="/comprar/etb-30/">ETB del 30.º aniversario</a> — la caja que más se vende.</li>
    <li><a href="/comprar/lote-30/">Lote de 6 sobres del 30.º</a> — la referencia por sobre.</li>
    <li><a href="/comprar/regalos/">Qué regalar</a> — si es para otra persona.</li>
    <li><a href="/valorar/">Valorar la colección</a> — antes de gastar en fundas.</li>
  </ul>
</section>

<section class="bloque">
  <h2>Cómo lo comprobamos (y qué no)</h2>
  <p>El criterio de los tramos sale del precio de mercado de las cartas, no de una prueba de laboratorio: todavía
  <b>no hemos medido</b> cuántas barajadas aguanta cada funda ni cuánto tarda en amarillear. Cuando lo hagamos, lo
  publicaremos con las medidas y la fecha, y si algún producto sale mal, se quita.</p>
  <p class="muted">Lo que sí es dato: el precio de cada carta viene de Cardmarket y se actualiza a diario. Los tramos
  están puestos sobre ese precio, no sobre una estimación.</p>
</section>

<section class="bloque">
  <h2>Lo que no haría</h2>
  <ul class="pasos">
    <li><b>Fundas de PVC</b> y hojas con anillas metálicas: con el tiempo marcan la carta.</li>
    <li><b>Guardar en vertical sin toploader</b>: el peso de las de abajo dobla las esquinas.</li>
    <li><b>Sol directo</b>: el foil se decolora y no vuelve.</li>
    <li><b>Cajas de cartón sin funda</b>: el roce se come el borde impreso.</li>
  </ul>
  <p><a class="btn ghost" href="/valorar/">Ver cuánto vale mi colección</a>
  <a class="btn ghost" href="/guardar-cartas/">Guía: que no se curven</a></p>
</section>`,
  }),
);

// ---------- panel de visitas ----------
let panel = null;
try {
  panel = JSON.parse(await readFile(path.join(ROOT, 'data', 'panel.json'), 'utf8'));
} catch {}
if (panel) {
  const max = Math.max(1, ...panel.porDia.map((d) => d.visitas));
  await put(
    OUT('panel/index.html'),
    layout({
      noindex: true,
      title: `Panel de visitas | ${config.brand}`,
      description: 'Visitas de los últimos 30 días.',
      url: '/panel/',
      noindex: true,
      body: `
<h1>Visitas · últimos 30 días</h1>
<p class="lede"><b>${panel.total.toLocaleString('es-ES')}</b> visitas desde ${panel.desde} hasta ${panel.hasta}. Actualizado: ${panel.actualizado.slice(0, 16).replace('T', ' ')}.</p>
<div class="grafico">${panel.porDia
        .map(
          (d) => `<div class="barra" title="${d.dia}: ${d.visitas}" style="height:${Math.max(2, (d.visitas / max) * 100)}%"></div>`,
        )
        .join('')}</div>
<div class="dos-col">
  <div><h2>Páginas</h2><table class="listado"><tbody>${panel.paginas
    .map((p) => `<tr><td>${esc(p.ruta)}</td><td class="num">${p.visitas}</td></tr>`)
    .join('') || '<tr><td class="muted">Sin datos</td></tr>'}</tbody></table></div>
  <div><h2>De dónde vienen</h2><table class="listado"><tbody>${panel.referidores
    .map((r) => `<tr><td>${esc(r.ref)}</td><td class="num">${r.visitas}</td></tr>`)
    .join('') || '<tr><td class="muted">Sin datos</td></tr>'}</tbody></table></div>
</div>`,
    }),
  );
}

// antigua /mapa/: se retiró por ser interna. Evita el 404 sin exponer nada.
await put(
  OUT('mapa/index.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="0; url=/">
<title>Página retirada</title></head>
<body style="background:#0a0a0b;color:#f5f5f7;font:16px system-ui;padding:40px">
<p>Esta página ya no existe. <a href="/" style="color:#ffcb05">Volver a ValorCarta</a>.</p>
</body></html>`,
);

// ---------- widget de precios para tiendas ----------
await put(
  OUT('widget/index.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Precio de carta · ${esc(config.brand)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0b;color:#f5f5f7;padding:14px}
  .w{display:flex;gap:12px;align-items:center}
  img{width:64px;border-radius:6px}
  .n{font-weight:700;line-height:1.2}
  .s{color:#9a9aa5;font-size:.82rem}
  .p{font-size:1.5rem;font-weight:800;color:#ffcb05;margin:8px 0 0}
  .m{color:#9a9aa5;font-size:.78rem;margin:4px 0 0}
  a.b{display:inline-block;margin-top:10px;background:#ffcb05;color:#0a0a0b;text-decoration:none;font-weight:700;padding:8px 12px;border-radius:8px;font-size:.85rem}
  .vacio{color:#9a9aa5;font-size:.85rem}
</style></head><body>
<div id="c" class="vacio">Cargando precio…</div>
<script>
const id = new URLSearchParams(location.search).get('c');
fetch('/data/widget.json').then(r => r.json()).then(d => {
  const c = d[id], el = document.getElementById('c');
  if (!c) { el.textContent = 'Carta no encontrada.'; return; }
  el.className = '';
  el.innerHTML = '<div class="w">' + (c.img ? '<img src="' + c.img + '" alt="">' : '') +
    '<div><div class="n">' + c.n + '</div><div class="s">' + c.set + (c.rar ? ' · ' + c.rar : '') + '</div></div></div>' +
    '<div class="p">' + c.p + '</div><div class="m">Precio de referencia de Cardmarket · hoy</div>' +
    '<a class="b" href="' + c.u + '" target="_blank" rel="noopener">Ver ficha y precio actualizado</a>';
}).catch(() => document.getElementById('c').textContent = 'No disponible.');
</script></body></html>`,
);

const widgetData = {};
for (const c of priced.slice(0, 500)) {
  widgetData[c.id] = {
    n: c.name,
    set: c.setName,
    rar: c.rarity && c.rarity !== 'Ninguno' ? c.rarity : '',
    p: eur(c.price),
    img: c.image ? `${c.image}/low.webp` : '',
    u: `${SITE}/carta/${cardSlug(c)}/`,
  };
}
await put(OUT('data/widget.json'), JSON.stringify(widgetData));

// ---------- datos abiertos (Dataset schema para Google Dataset Search) ----------
const fechaDatos = priced.reduce((max, c) => ((c.updated ?? '') > max ? c.updated : max), '').slice(0, 10)
  || new Date().toISOString().slice(0, 10);
await put(
  OUT('datos/index.html'),
  layout({
    title: `Dataset: precios de cartas Pokémon (descarga libre) | ${config.brand}`,
    description:
      'Volcado diario y gratuito con el precio de referencia de 9.830 cartas Pokémon en EUR. Licencia CC BY 4.0, en JSON, listo para analizar.',
    url: '/datos/',
    body: `
<h1>Precios de cartas Pokémon, en abierto</h1>
<p class="lede">Un fichero JSON con el precio de referencia de <b>${priced.length.toLocaleString('es-ES')} cartas</b>, actualizado a diario.
Licencia <b>CC BY 4.0</b>: úsalo, publícalo o mételo en tu modelo, citando la fuente.</p>
<p><a class="btn" href="https://raw.githubusercontent.com/valorcarta/precios-cartas-datos/master/precios.json" rel="noopener">Descargar JSON</a>
<a class="btn ghost" href="https://github.com/valorcarta/precios-cartas-datos" rel="noopener">Ver el repositorio</a></p>
<table class="listado"><tbody>
<tr><td class="muted">Última actualización</td><td>${esc(fechaDatos)}</td></tr>
<tr><td class="muted">Cartas con precio</td><td>${priced.length.toLocaleString('es-ES')}</td></tr>
<tr><td class="muted">Formato</td><td>JSON (id, nombre, set, precio en EUR)</td></tr>
<tr><td class="muted">Fuente del precio</td><td>Cardmarket, vía la API pública de TCGdex</td></tr>
<tr><td class="muted">Licencia</td><td>CC BY 4.0</td></tr>
</tbody></table>
<section class="bloque">
  <h2>Qué puedes hacer con esto</h2>
  <ul class="pasos">
    <li>Comparar la evolución de un set entre semanas.</li>
    <li>Detectar cartas cuyo precio se ha movido más de un 20 %.</li>
    <li>Montar tu propio valorador o una hoja de cálculo para tu colección.</li>
  </ul>
  <p class="muted">Los precios son de referencia de mercado y no distinguen estado de conservación. No son una tasación.</p>
</section>`,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Precios de cartas Pokémon (volcado diario)',
      description:
        'Precio de referencia en EUR de 9.830 cartas Pokémon, generado a diario desde Cardmarket vía TCGdex.',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: { '@type': 'Organization', name: config.brand, url: SITE },
      url: `${SITE}/datos/`,
      dateModified: fechaDatos,
      distribution: [
        {
          '@type': 'DataDownload',
          contentUrl:
            'https://raw.githubusercontent.com/valorcarta/precios-cartas-datos/master/precios.json',
          encodingFormat: 'application/json',
        },
      ],
    },
  }),
);

// ---------- ranking de las mas caras ----------
const caras100 = priced.slice(0, 100);
await put(
  OUT('caras/index.html'),
  layout({
    title: `Las 100 cartas Pokémon más caras (precio de hoy) | ${config.brand}`,
    description:
      'Ranking de las 100 cartas Pokémon con mayor precio de mercado, actualizado a diario. Con set, rareza y enlace a su ficha.',
    url: '/caras/',
    alternates: altPair('/caras/', '/en/most-expensive/'),
    body: `
<h1>Las 100 cartas Pokémon más caras</h1>
<p class="lede">Ordenadas por precio de mercado hoy. La lista se recalcula en cada actualización, así que cambia:
una carta que sube entra, una que baja sale.</p>
<p class="nota small">Precios de referencia de Cardmarket. Una carta en mal estado vale mucho menos que esta cifra.</p>
<p class="acciones">
  <a class="btn" href="https://www.amazon.es/dp/B0H8T5GC4W?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank">Sobres del 30.º aniversario en Amazon</a>
  <a class="btn ghost" href="/comprar/regalos/">Qué regalar por presupuesto</a>
</p>
<p class="nota small">Enlace de afiliado: si compras desde aquí, ValorCarta recibe una comisión de Amazon que no cambia lo que pagas. Las cartas sueltas de esta lista no se venden en Amazon: el botón lleva al sellado del 30.º aniversario, que es el producto más vendido.</p>
<table class="listado ranking">
<thead><tr><th>#</th><th>Carta</th><th>Set</th><th class="num">Precio</th></tr></thead>
<tbody>
${caras100
  .map(
    (c, i) => `<tr>
  <td class="num muted">${i + 1}</td>
  <td><a href="/carta/${cardSlug(c)}/">${esc(c.name)}</a></td>
  <td class="muted"><a href="/set/${c.setId}/">${esc(c.setName)}</a></td>
  <td class="num">${eur(c.price)}</td>
</tr>`,
  )
  .join('')}
</tbody></table>
<p class="acciones"><a class="btn" href="/valorar/">¿Cuánto vale mi colección?</a>
<a class="btn ghost" href="/mercado/">Qué se mueve esta semana</a></p>`,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Las 100 cartas Pokémon más caras',
      itemListElement: caras100.slice(0, 20).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        url: `${SITE}/carta/${cardSlug(c)}/`,
      })),
    },
  }),
);

// ---------- guias de compra por formato ----------
const GUIAS_COMPRA = [
  {
    slug: 'sobres', asin: null, h1: 'Sobres sueltos: cuándo salen caros',
    entradilla: 'Comprar sobres de uno en uno es la forma más cara de abrir un set. Aquí está la cuenta y cuándo sí merece la pena.',
    puntos: [
      'El precio por sobre en blíster o sobre suelto suele ser más alto que en caja de 36.',
      'Si vas a abrir más de 15 sobres, compara siempre contra el precio de la caja.',
      'Un sobre abierto no se puede devolver: si buscas una carta concreta, sale más barato comprarla suelta.',
    ],
    cta: 'Lata EX con 4 sobres',
  },
  {
    slug: 'caja-36', asin: 'B0BTRN9FT5', h1: 'Caja de 36 sobres: la cuenta que hay que hacer',
    entradilla: 'La caja es el formato con mejor precio por sobre, pero solo si vas a abrirla entera y el set te interesa de verdad.',
    puntos: [
      'Divide el precio de la caja entre 36: ese es tu coste real por sobre.',
      'Compáralo con el precio del sobre suelto antes de comprar; a veces la diferencia es de céntimos y a veces del 40 %.',
      'Ojo con el precinto: una caja abierta pierde valor de reventa.',
    ],
    cta: 'Caja de 36 sobres',
  },
  {
    slug: 'etb', asin: 'B0DM6HQ8X5', h1: 'ETB: qué lleva y cuándo conviene',
    entradilla: 'La caja de élite trae sobres, fundas, dados y una carta promocional. Conviene si vas a usar los accesorios; si no, se paga de más.',
    puntos: [
      'Suma el precio de los sobres y de las fundas por separado: si sale parecido, la ETB es buena compra.',
      'La promo suele ser la razón real para comprarla; mira cuál es antes de pagar.',
      'Suelen reponerse; no pagues sobreprecio por prisa.',
    ],
    cta: 'ETB de Evoluciones Prismáticas',
  },
  {
    slug: 'etb-30', asin: 'B0H8T5GC4W', h1: 'ETB del 30.º aniversario: qué lleva y si sale a cuenta',
    entradilla: 'La caja de élite del 30.º aniversario es el producto más vendido de Juguetes en Amazon España. Trae 9 sobres de Celebración, fundas, dados y una carta promocional con ilustración expandida.',
    puntos: [
      'Con 9 sobres a precio de lote (29,94 € los 6), la caja se acerca al precio de los sobres sueltos: lo que pagas de más son las fundas, los dados y la promo.',
      'La promo expandida es la razón real para comprarla: si no la quieres, el lote de sobres sale mejor por euro.',
      'Comprueba que el vendedor sea Amazon o vendido por Amazon: en este set hay revendedores por encima del PVP.',
    ],
    cta: 'ETB del 30.º aniversario',
  },
  {
    slug: 'lote-30', asin: 'B0H8SXRLT4', h1: 'Lote de 6 sobres del 30.º aniversario: precio por sobre',
    entradilla: 'Seis sobres de Celebración del 30.º aniversario. A 29,94 € sale a 4,99 € el sobre, que es la referencia para saber si una caja o una ETB están caras.',
    puntos: [
      'Divide siempre: 29,94 € entre 6 = 4,99 € por sobre. Cualquier formato que pase de ahí necesita justificar los accesorios o la promo.',
      'Es el formato más limpio para abrir: no pagas fundas ni dados que quizá no uses.',
      'Si buscas una carta concreta, comprar el sobre es lotería; la carta suelta sale más barata que insistir.',
    ],
    cta: 'Lote de 6 sobres',
  },
  {
    slug: 'etb-dominio-delta', asin: null, h1: 'ETB Dominio Delta: qué lleva y a qué precio',
    entradilla: 'Caja de élite de Megaevolución-Dominio Delta: sobres, fundas, dados y carta promocional. Es el formato de regalo habitual y el que más se revende por encima del PVP.',
    puntos: [
      'Mismo patrón que la ETB del 30.º: compara el precio de sus sobres por separado antes de pagar la caja.',
      'Comprueba que sea vendido por Amazon: en las ETB descatalogadas aparecen revendedores con sobreprecio.',
      'Si lo que quieres es la promo, mírala suelta primero: a veces sale más barata que la caja entera.',
    ],
    cta: 'ETB Dominio Delta',
  },
  {
    slug: 'lata', asin: null, h1: 'Latas: promo garantizada, sobres caros',
    entradilla: 'La lata vende una carta promocional concreta. Si esa carta es la que buscas, tiene sentido; si no, estás pagando el envoltorio.',
    puntos: [
      'Mira qué promo trae y su precio suelto: a veces comprar solo la carta sale más barato.',
      'Cuatro sobres por lata es el formato habitual; divide y compara.',
      'Las latas se abollan: si la quieres cerrada, revisa el estado al recibirla.',
    ],
    cta: 'Lata Mega-Charizard',
  },
  {
    slug: 'blister', asin: null, h1: 'Comprar por sobres sueltos: cuándo sale caro',
    entradilla: 'Los formatos de sobre suelto existen para regalar y para tienda física. Por sobre suelen ser los más caros, y por eso aquí no enlazamos ninguno: preferimos decirte el precio por sobre y que decidas.',
    puntos: [
      'Es el formato con peor precio por sobre de todos los habituales.',
      'Útil si necesitas un regalo rápido o comprar en tienda física.',
      'Para abrir en casa, la caja o la ETB salen mejor.',
    ],
    cta: 'Blíster de 3 sobres',
  },
];

for (const g of GUIAS_COMPRA) {
  await put(
    OUT(`comprar/${g.slug}/index.html`),
    layout({
      title: `${g.h1} | ${config.brand}`,
      description: g.entradilla,
      url: `/comprar/${g.slug}/`,
      body: `
<nav class="migas"><a href="/comprar/">Comprar</a> / ${esc(g.cta)}</nav>
<h1>${esc(g.h1)}</h1>
<p class="aviso-afiliado">En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables. · Revisado: ${new Date().toISOString().slice(0, 10)}</p>
<p class="lede">${esc(g.entradilla)}</p>
<ul class="pasos">${g.puntos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
${g.asin && DISPONIBLES.has(g.asin) ? `<p><a class="btn" href="${amazonDp(g.asin)}" rel="sponsored nofollow noopener" target="_blank">${esc(g.cta)} en Amazon</a></p>` : `<p class="nota small">Ahora mismo no hay producto verificado disponible de este formato en Amazon: no se enlaza para no mandarte a otro producto. <a href="/comprar/">Ver lo que sí se vende</a>.</p>`}
<p class="nota small">El precio lo pone Amazon. Antes de comprar, compara el precio por sobre con el resto de formatos en <a href="/comprar/">la tabla de compra</a>.</p>
<p class="nota"><a href="/valorar/">Ver cuánto vale mi colección →</a> · <a href="/mercado/">Qué se mueve esta semana →</a></p>
${g.asin ? recosHtml(g.asin) : ''}
<p class="nota small">Protege lo que compras: <a href="/guardar-cartas/">fundas, toploaders y álbumes verificados</a> · <a href="/comprar/">todos los formatos</a>.</p>`,
    }),
  );
}


// ---------- guía de regalo (intención de compra de Pinterest) ----------
const REGALOS = [
  ['Menos de 25 €', [
    ['B0H8T4YLGT', 'Baraja de liga Umbreon ex (30.º)', 'Lista para jugar: 60 cartas y accesorios. El regalo que se usa el mismo día.'],
    ['B0H8SXC5L9', 'Colección con póster (30.º)', 'Tres promos y un póster: lo que se cuelga, no lo que se guarda.'],
    ['B0DSGB5Q6B', 'Colección Ursaluna Luna Carmesí', 'Cuatro holográficas y cuatro sobres para abrir en casa.'],
  ]],
  ['De 25 a 50 €', [
    ['B0H8SXRLT4', 'Lote de 6 sobres (30.º)', 'A 4,99 € el sobre es la mejor referencia de precio del set.'],
    ['B0CJYK29Y9', 'Baraja de liga Miraidon ex', 'Baraja competitiva lista para jugar.'],
    ['B0C4V8F77B', 'Estadio Combina y Combate', 'Dos barajas para jugar contra otra persona: el regalo de dos.'],
  ]],
  ['Más de 50 €', [
    ['B0H8T5GC4W', 'ETB del 30.º aniversario', 'La caja más vendida de Juguetes en Amazon España.'],
    ['B0HGG226FP', 'ETB Dominio Delta', 'Caja de élite de Megaevolución, con promo y accesorios.'],
    ['B0D6WLBJKX', 'ETB Fábula Sombría', 'Para quien colecciona cajas cerradas, no para abrirlas.'],
  ]],
];
await put(
  OUT('comprar/regalos/index.html'),
  layout({
    title: `Qué regalar a alguien que le gusta Pokémon | ${config.brand}`,
    description: 'Tres tramos de precio con productos concretos de Pokémon TCG: qué se regala bien, qué se guarda y qué se abre el mismo día.',
    url: '/comprar/regalos/',
    body: `
<nav class="migas"><a href="/comprar/">Comprar</a> / Regalos</nav>
<h1>Qué regalar a alguien que le gusta Pokémon</h1>
<p class="aviso-afiliado">En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables. · Revisado: ${new Date().toISOString().slice(0, 10)}</p>
<p class="lede">Si hay que elegir uno y no se sabe qué set colecciona: un <b>Funko POP de Mew por 9,90 €</b> acierta casi siempre. A partir de ahí, por presupuesto y con el motivo de cada uno.</p>
${REGALOS.map(([tramo, items]) => `
<h2>${esc(tramo)}</h2>
<ul class="pasos">${items.map(([asin, nombre, motivo]) => `
<li><a href="https://www.amazon.es/dp/${asin}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank"><b>${esc(nombre)}</b></a> — ${esc(motivo)}</li>`).join('')}</ul>`).join('')}
<h2>Si no es coleccionista: figura, taza o camiseta</h2>
<p class="lede">Aquí la comisión es del 5-10 % y el regalo no depende de saber qué set es. Cuatro productos verificados uno a uno, con el precio comprobado el ${REGALOS_FRIKIS.verificado || ''}.</p>
<ul class="pasos">${(REGALOS_FRIKIS.productos || []).map((r) => `
<li><a href="https://www.amazon.es/dp/${r.asin}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank"><b>${esc(r.nombre)}</b> — ${eur(r.precio)}</a> · ${esc(r.tipo)}. ${esc(r.nota)}</li>`).join('')}</ul>
<p class="nota">El precio lo pone Amazon y cambia: comprueba antes de pagar. Si la persona colecciona, pregunta por el set antes de regalar una carta suelta.</p>
<p class="nota"><a href="/valorar/">Valorar una colección →</a> · <a href="/comprar/">Comparar formatos →</a></p>`,
  }),
);

// ---------- comprar (intencion de compra -> afiliado) ----------
const PRODUCTOS = [
  ['Sobres sueltos', null, 'Para probar suerte sin comprometerte. El precio por sobre siempre es peor que en caja.'],
  ['Caja de 36 sobres', 'B0BTRN9FT5', 'El mejor precio por sobre si vas a abrir mucho. Compara antes de comprar.'],
  ['ETB (caja de élite)', 'B0FDGXLR5L', 'Sobres, fundas y dados. Suele salir mejor que comprar las piezas por separado.'],
  ['Lata', 'B0GMRC58KQ', 'Promo garantizada. Revisa qué carta trae antes de pagar de más.'],
  ['Blíster de 3', 'B0H1HDKXGH', 'Cómodo en tienda física, caro por sobre. Útil para regalo.'],
  ['Colección premium', 'B0DSGDJP6Q', 'Producto de nicho: si no la abres, el precinto manda.'],
  ['Fundas', 'B085DNDLC1', 'Lo primero antes de tocar una carta que valga algo.'],
  ['Binder', 'B0D7W2PJR8', 'Para guardar la colección sin que se doblen las esquinas.'],
];

await put(
  OUT('comprar/index.html'),
  layout({
    title: `Dónde comprar cartas y sobres Pokémon sin pagar de más | ${config.brand}`,
    description:
      'Qué formato conviene comprar según lo que busques, cuánto cuesta cada uno por sobre y dónde encontrarlo. Sin humo y sin promesas de revalorización.',
    url: '/comprar/',
    body: `
<h1>Dónde comprar sin pagar de más</h1>
<p class="lede">El formato cambia el precio por sobre más que la tienda. Antes de comprar, mira qué te llevas
y cuánto estás pagando por cada sobre; luego compara.</p>
${disponiblesHtml('Disponible ahora')}

// fichas de producto con página propia: enlazarlas aquí para que no queden huérfanas
<div class="grid">
  <a class="set-card" href="/comprar/etb-30/"><span class="set-name">ETB 30.º aniversario</span><span class="muted">La nº1 en ventas de Amazon · 52,99 €</span><span class="set-total">Ver análisis</span></a>
  <a class="set-card" href="/comprar/lote-30/"><span class="set-name">Lote de 6 sobres del 30.º</span><span class="muted">4,99 € por sobre: la referencia</span><span class="set-total">Ver análisis</span></a>
  <a class="set-card" href="/comprar/etb-dominio-delta/"><span class="set-name">ETB Dominio Delta</span><span class="muted">Qué trae y cuándo conviene</span><span class="set-total">Ver análisis</span></a>
  <a class="set-card" href="/comprar/regalos/"><span class="set-name">Qué regalar</span><span class="muted">Nueve ideas por presupuesto</span><span class="set-total">Ver guía</span></a>
</div>

<table class="listado">
<thead><tr><th>Formato</th><th>Cuándo tiene sentido</th><th class="num">Ver precios</th></tr></thead>
<tbody>
${PRODUCTOS.map(
  ([n, q, d]) => `<tr>
  <td><b>${esc(n)}</b></td>
  <td class="muted">${esc(d)}</td>
  <td class="num">${
    q && DISPONIBLES.has(q)
      ? `<a href="https://www.amazon.es/dp/${q}?tag=${encodeURIComponent(config.amazonTag)}" rel="sponsored nofollow noopener" target="_blank">Ver producto →</a>`
      : q
        ? '<span class="muted">No disponible ahora</span>'
        : `<a href="/guardar-cartas/">Guía →</a>`
  }</td>
</tr>`,
).join('')}
</tbody></table>

<section class="bloque">
  <h2>Formato por formato</h2>
  <div class="grid guias-grid">
    ${GUIAS_COMPRA.map((g) => `<a class="guia-card" href="/comprar/${g.slug}/"><span class="guia-t">${esc(g.cta)}</span><span class="muted small">${esc(g.h1)}</span></a>`).join('')}
  </div>
</section>

<section class="bloque">
  <h2>Las tres reglas que ahorran dinero</h2>
  <ol class="pasos">
    <li><b>Precio por sobre, no precio del producto.</b> Una caja de 36 y un blíster de 3 no se comparan por lo que cuestan, sino por lo que cuesta cada sobre.</li>
    <li><b>El precinto manda.</b> Si el producto viene abierto o sin retractilar, el valor cae. Revisa el estado al recibir y fotografía el paquete antes de abrirlo.</li>
    <li><b>El sobre no da dinero por abrir.</b> Abrir es azar. Si compras para coleccionar, compra la carta suelta; si compras para abrir, asume que estás pagando la experiencia.</li>
  </ol>
  <p class="nota small">Los enlaces llevan a la ficha exacta del producto en Amazon con nuestra etiqueta de afiliado: si compras, nos llevamos una comisión sin coste extra para ti. Si un producto no está disponible, no se enlaza: no te mandamos a otro en su lugar.</p>
  <p class="acciones"><a class="btn" href="/guardar-cartas/">Protege lo que compras: fundas y álbumes →</a></p>
</section>`,
  }),
);

// ---------- alertas (producto de suscripcion) ----------
await put(
  OUT('alertas/index.html'),
  layout({
    title: `Avisos de precio de cartas Pokémon | ${config.brand}`,
    description:
      'Pon un precio objetivo a tus cartas y recibe un aviso cuando el mercado baje de ahí. Sin registro para probarlo.',
    url: '/alertas/',
    body: `
<h1>Que te avisen, no mirar todos los días</h1>
<p class="lede">Pon el precio al que comprarías y olvídate. Cuando el mercado baje de ahí, te llega el aviso.</p>

<div id="alertas-lista" class="coleccion-lista"><p class="muted">Todavía no tienes avisos. Búscalos desde cualquier ficha de carta.</p></div>

<div class="dos-col coleccion">
  <div>
    <h2>Cómo funciona</h2>
    <ol class="pasos">
      <li>En la ficha de una carta, pon tu precio objetivo y activa el aviso.</li>
      <li>Lo guardamos en tu navegador: no hay registro ni contraseña.</li>
      <li>Con Premium, ese aviso te llega por email el mismo día que se cumple.</li>
    </ol>
  </div>
  <aside class="total-caja">
    <p class="muted">Avisos por email</p>
    <p class="total">${config.precio.mes}<span class="muted small">/mes</span></p>
    <a class="btn" href="${esc(config.premiumUrl)}">Activar avisos</a>
    <p class="nota small">El precio lo comprobamos a diario con los datos de Cardmarket. Si no baja, no te escribimos.</p>
  </aside>
</div>`,
  }),
);

// ---------- tiendas (B2B) ----------
await put(
  OUT('tiendas/index.html'),
  layout({
    title: `Informe semanal de precios para tiendas de cartas | ${config.brand}`,
    description:
      'Cada lunes: qué cartas de tu stock han subido, cuáles han bajado y dónde está el margen. Informe de mercado con precios reales. Primer informe gratis.',
    url: '/tiendas/',
    body: `
<h1>Tu stock, valorado cada semana</h1>
<p class="lede">El informe que llega los lunes: qué cartas se han movido, cuánto valen hoy y dónde tienes margen.
Con precios de mercado, no con intuición.</p>

<div class="grid planes">
  <div class="plan">
    <h2>Informe</h2>
    <p class="precio">29 €<span class="muted">/mes</span></p>
    <ul>
      <li>Top subidas y bajadas de la semana</li>
      <li>Sets con más movimiento y su valor</li>
      <li>Valor del catálogo completo</li>
      <li>Un correo, los lunes. Sin instalar nada</li>
    </ul>
    <a class="btn ghost" href="/datos/">Ver informe de muestra</a>
  <a class="btn" href="mailto:${esc(config.emailVentas)}?subject=Quiero%20el%20informe%20de%20prueba">Pedir el primero gratis</a>
  </div>
  <div class="plan destacado">
    <h2>Panel</h2>
    <p class="precio">99 €<span class="muted">/mes</span></p>
    <ul>
      <li>Tu stock valorado a precio de mercado, cada día</li>
      <li>Avisos cuando una carta de tu stock se mueve</li>
      <li>Histórico de precios de las cartas que vendes</li>
      <li>Exportable a CSV para tu inventario</li>
    </ul>
    <a class="btn" href="mailto:${esc(config.emailVentas)}?subject=Quiero%20ver%20el%20panel">Hablar del panel</a>
  </div>
</div>

<section class="bloque">
  <h2>Por qué esto y no una hoja de cálculo</h2>
  <p>Una hoja de cálculo te dice lo que pagaste. Esto te dice lo que vale tu stock esta semana, comparado con
  lo que se está vendiendo de verdad en el mercado. La diferencia es cuándo comprar y cuándo soltar.</p>
  <p class="muted">Precios de referencia de Cardmarket vía TCGdex, actualizados a diario. Sin permanencia: si un mes no te sirve, lo dejas.</p>
</section>`,
  }),
);

// ---------- gracias (post-compra) ----------
await put(
  OUT('gracias/index.html'),
  layout({
    title: `Gracias — ya eres Premium | ${config.brand}`,
    description: 'Acceso a las alertas de precio de ValorCarta.',
    url: '/gracias/',
    noindex: true,
    body: `
<h1>Ya estás dentro</h1>
<p class="lede">Dos cosas y ya está:</p>
<ol class="pasos">
  <li>Entra al canal privado de alertas: <a href="${esc(config.telegramInvite)}"><b>t.me/+…</b></a> (el enlace es de un solo uso por persona; si falla, escríbenos).</li>
  <li>Guarda este correo. Los avisos llegan al canal y el resumen mensual del valor de tu colección, a tu email.</li>
</ol>
<p class="muted">Si quieres cancelar, se hace desde el recibo de Lemon Squeezy, sin llamadas ni formularios.</p>
<p><a class="btn ghost" href="/valorar/">Volver a mi colección</a></p>`,
  }),
);

// ---------- legales ----------
const legal = (slug, titulo, cuerpo) =>
  put(
    OUT(`${slug}/index.html`),
    layout({
      title: `${titulo} | ${config.brand}`,
      description: `${titulo} de ${config.brand}.`,
      url: `/${slug}/`,
      body: `<h1>${titulo}</h1>${cuerpo}`,
      noindex: false,
    }),
  );

await legal(
  'aviso-legal',
  'Aviso legal',
  `<p>Titular: ${esc(config.titular)} · NIF ${esc(config.nif)} · ${esc(config.contactEmail)}.</p>
   <p>${esc(config.brand)} es un sitio independiente de información de precios. No está afiliado, patrocinado ni respaldado por Nintendo, Creatures Inc., GAME FREAK ni The Pokémon Company. Las marcas citadas pertenecen a sus titulares.</p>
   <p>Participamos en el Programa de Afiliados de Amazon. Los precios mostrados son de referencia (Cardmarket) y pueden variar; no constituyen una oferta de venta.</p>`,
);
await legal(
  'privacidad',
  'Privacidad',
  `<p>No usamos cookies de seguimiento ni publicidad. Tu colección se guarda en el almacenamiento local de tu navegador y no se envía a ningún servidor.</p>
   <p>Si te suscribes, el pago lo procesa Lemon Squeezy como vendedor (merchant of record) y nosotros solo recibimos tu email para enviarte los avisos. Puedes darte de baja en cualquier momento.</p>
   <p>Contacto: ${esc(config.contactEmail)}.</p>`,
);

// ---------- English edition (/en/) ----------
const enPaths = [];
const enPage = async (route, html) => {
  await put(OUT(`en/${route}index.html`), html);
  enPaths.push(`/en/${route}`);
};

const enDate = (() => {
  const d = new Date(`${fechaDatos}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? fechaDatos
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
})();

const cardImageEn = (c) => enMeta(c).image ?? c.image ?? null;
// Para la portada, prioriza cartas cuya imagen ya respondió en el chequeo del build.
const topEn = [...top.filter((c) => enSlugById.has(c.id)), ...enCards]
  .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
  .slice(0, 12);
const cardTotalEn = (c) => {
  const meta = setsById.get(c.setId);
  return meta?.cardCount?.official ?? meta?.cardCount?.total ?? bySet.get(c.setId)?.length ?? 0;
};
const legalEn = (legal) => {
  if (!legal) return null;
  if (legal.standard) return 'Standard & Expanded';
  if (legal.expanded) return 'Expanded only';
  return 'Not tournament legal';
};
const stageEn = (s) => (s ? String(s).replace(/^Stage(\d)$/, 'Stage $1') : null);
const capEn = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

const VAR_TYPE_EN = {
  holo: 'Holo',
  normal: 'Normal',
  reverse: 'Reverse holo',
  'básico': 'Normal',
  'reversa': 'Reverse holo',
};
const VAR_SUB_EN = { standard: 'standard', 'estándar': 'standard', jumbo: 'jumbo' };

function variantLabelEn(v) {
  const type = VAR_TYPE_EN[v.type] ?? capEn(v.type ?? 'Normal');
  const sub = v.subtype ? (VAR_SUB_EN[v.subtype] ?? v.subtype) : '';
  return sub && sub !== 'standard' ? `${type} · ${sub}` : type;
}

function priceTableEn(card) {
  // Una fila por listado de Cardmarket. Cuando dos listados comparten etiqueta
  // (misma versión, distinta edición o sello) se numeran para no ocultar el más barato.
  const seen = new Set();
  const items = [];
  for (const v of card.variants ?? []) {
    if (!(v.avg || v.trend || v.holoAvg)) continue;
    const base = v.trend ?? v.avg;
    if (base == null) continue;
    const key = v.productId ?? `${v.type}|${v.subtype}|${items.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ v, base, label: variantLabelEn(v) });
  }
  items.sort((a, b) => b.base - a.base);
  const counts = new Map();
  let duplicated = false;
  const rows = items.map(({ v, base, label }) => {
    const n = (counts.get(label) ?? 0) + 1;
    counts.set(label, n);
    if (n > 1) duplicated = true;
    const shown = n === 1 ? label : `${label} · listing ${n}`;
    return `<tr>
      <td>${esc(shown)}</td>
      <td class="num">${eurEn(base)}<br><span class="muted small">30d avg ${eurEn(v.avg30)} · low ${eurEn(v.low)}</span></td>
      <td class="num muted">${usdEn(base)}</td>
      <td class="num muted">${gbpEn(base)}</td>
    </tr>`;
  });
  if (!rows.length) return '<p class="muted">No price data for this card yet.</p>';
  return `<table class="prices">
    <thead><tr><th>Version</th><th class="num">EUR</th><th class="num">≈ USD</th><th class="num">≈ GBP</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>${
    duplicated
      ? '\n  <p class="nota small">Some versions have more than one Cardmarket listing (different edition or stamp); each listing is shown separately.</p>'
      : ''
  }`;
}

const FAQ_EN = [
  [
    'Are these prices an appraisal?',
    'No. They are Cardmarket reference prices: the average of recent sales. An appraisal requires seeing the card, and condition can change the value by more than half.',
  ],
  [
    'Why are USD and GBP approximate?',
    'The source price is in euros. The English pages convert it at fixed rates declared in the build (€1 = $1.08 = £0.85). They are not live exchange rates.',
  ],
  [
    'Why only 100 cards in English?',
    'The English edition starts with the 100 most valuable cards. The full catalogue of 9,830 priced cards is available in Spanish.',
  ],
];

const homeEnBody = `
<section class="hero">
  <p class="kicker">The 100 most valuable Pokémon cards · data updated ${enDate}</p>
  <h1>What are your Pokémon cards worth?</h1>
  <p class="lede">Today's market prices for the 100 most expensive Pokémon cards, in EUR with an approximate
  USD and GBP conversion. Free, no signup, no cookies.</p>
  <div id="buscador" class="buscador">
    <input id="q-en" type="search" placeholder="Search the top 100: Charizard, Umbreon, Mew…" autocomplete="off" aria-label="Search cards">
    <div id="resultados-en" class="resultados"></div>
  </div>
  <div class="acciones">
    <a class="btn" href="/en/price-check/">Check my collection</a>
    <a class="btn ghost" href="/en/most-expensive/">See the top 100</a>
  </div>
</section>

<section class="bloque">
  <h2>The most expensive cards right now</h2>
  <p class="muted small">The ranking is rebuilt every day: a card that rises enters, a card that falls leaves.</p>
  <div class="grid">
    ${topEn.map(cardTileEn).join('\n')}
  </div>
  <p class="muted small"><a href="/en/most-expensive/">See all 100 with EUR, USD and GBP prices →</a></p>
</section>

<section class="bloque">
  <h2>EUR first, USD and GBP as an approximation</h2>
  <p>The reference price is in euros because the source, Cardmarket, is the European market. For US and UK
  readers we add a conversion so the number is readable, but the euro price is the one that comes from the data.</p>
  <p class="nota">${FX_NOTE}</p>
  <p class="muted small">Prices are reference prices, not an appraisal. A Near Mint copy can sell for far more
  than a played one; the number does not know the condition of your card.</p>
</section>

<section class="bloque">
  <h2>How it works</h2>
  <ol class="pasos">
    <li>Search for a card in the top 100 and open its page.</li>
    <li>Add it to your collection. Quantities are stored in your browser, not on a server.</li>
    <li>Open the price check to see the total in EUR, with the approximate USD and GBP value.</li>
  </ol>
  <p><a class="btn ghost" href="/en/price-check/">Open the price check</a></p>
</section>

<section class="bloque">
  <h2>Why two copies of the same card are not worth the same</h2>
  <ul class="pasos">
    <li><b>Condition.</b> Near Mint, Excellent and Played are different markets. The price shown is a reference, not a quote for your copy.</li>
    <li><b>Edition and variant.</b> First edition, shadowless, holo and reverse holo can be different cards with different prices.</li>
    <li><b>Language.</b> English, Japanese and Spanish copies do not trade at the same price.</li>
    <li><b>Reprints.</b> A new printing of a popular character can pull the old version down.</li>
  </ul>
</section>

<section class="bloque">
  <h2>The top 30, ranked</h2>
  <div class="indice">
    ${enCards.slice(0, 30).map((c) => `<a href="/en/card/${enSlug(c)}/">${esc(enName(c))}</a>`).join(' · ')}
  </div>
  <p class="muted small"><a href="/en/most-expensive/">See all 100 with EUR, USD and GBP prices →</a></p>
</section>

<section class="bloque">
  <h2>Questions</h2>
  ${FAQ_EN.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('\n')}
</section>

<section class="bloque">
  <h2>Looking for the full catalogue?</h2>
  <p>The Spanish edition covers all ${priced.length.toLocaleString('en-US')} priced cards, with set pages and the full
  market radar. <a href="/">Go to ValorCarta en español</a>.</p>
</section>`;

await enPage(
  '',
  layout({
    lang: 'en',
    title: `Pokémon Card Prices — Top 100 Most Valuable Cards | ${config.brand}`,
    description:
      'Today\'s market prices for the 100 most expensive Pokémon cards, with EUR and an approximate USD and GBP conversion. Free, no signup.',
    url: '/en/',
    alternates: altPair('/', '/en/'),
    scripts: ['/assets/en.js'],
    body: `${homeEnBody}
<div class="acciones">
  <a class="btn" href="/comprar/">Verified sealed products →</a>
  <a class="btn ghost" href="/en/price-check/">Value my collection</a>
</div>
<p class="nota small">Affiliate disclosure: as an Amazon Associate, ValorCarta earns from qualifying purchases. The price you pay does not change.</p>`,
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: `${config.brand} English`,
        url: `${SITE}/en/`,
        inLanguage: 'en',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE}/en/price-check/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_EN.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }),
);

const priceCheckEnBody = `
<nav class="migas"><a href="/en/">Home</a> / Price check</nav>
<h1>Pokémon card price check</h1>
<p class="lede">Add the cards you own and see what they are worth at today's market price. This English version
covers the 100 most valuable cards; the full ${priced.length.toLocaleString('en-US')}-card catalogue is in Spanish.</p>
<div id="buscador" class="buscador grande">
  <input id="q-en" type="search" placeholder="Search the top 100: Charizard, Umbreon, Mew…" autocomplete="off" aria-label="Search cards">
  <div id="resultados-en" class="resultados"></div>
</div>
<div class="dos-col coleccion">
  <div>
    <h2>Your collection <span id="n-cartas-en" class="muted"></span></h2>
    <div id="coleccion-en" class="coleccion-lista"><p class="muted">No cards yet. Search above to add one.</p></div>
  </div>
  <aside class="total-caja">
    <p class="muted">Market value today</p>
    <p id="total-en" class="total">€0.00</p>
    <p id="total-usd" class="muted">≈ $0.00 USD</p>
    <p id="total-gbp" class="muted">≈ £0.00 GBP</p>
    <p id="delta-en" class="muted"></p>
    <button id="compartir-en" class="btn">Copy share link</button>
    <button id="csv-en" class="btn ghost">Download CSV</button>
    <button id="vaciar-en" class="btn ghost">Clear</button>
    <p class="nota small">Reference prices from Cardmarket. ${FX_NOTE}</p>
    <a class="btn ghost" href="/valorar/">Full catalogue in Spanish</a>
  </aside>
</div>

<section class="bloque">
  <h2>How the total is calculated</h2>
  <ol class="pasos">
    <li>Each card is valued at its current Cardmarket reference price in euros.</li>
    <li>Quantities are multiplied by that price and added up.</li>
    <li>USD and GBP are converted at the fixed rates declared in the build: €1 = $${FX.USD.toFixed(2)} = £${FX.GBP.toFixed(2)}.</li>
  </ol>
  <p class="nota">The total is a market reference, not an offer. Condition, language and edition can move the real
  value of a card by more than half. The collection is saved only in this browser.</p>
</section>`;

await enPage(
  'price-check/',
  layout({
    lang: 'en',
    title: `Pokémon Card Price Check — Collection Value Calculator | ${config.brand}`,
    description:
      'Add your Pokémon cards and see the collection value at today\'s market prices. The 100 most valuable cards in English, with EUR, USD and GBP.',
    url: '/en/price-check/',
    alternates: altPair('/valorar/', '/en/price-check/'),
    scripts: ['/assets/en.js'],
    body: priceCheckEnBody,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Pokémon card price check',
      url: `${SITE}/en/price-check/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      inLanguage: 'en',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
  }),
);

const radarEn = enCards
  .map((c) => {
    const v = bestVariant(c);
    if (!v || !v.avg30 || !v.avg7 || v.avg30 < 10 || v.avg7 <= 0) return null;
    return { ...c, var7: ((v.avg7 - v.avg30) / v.avg30) * 100 };
  })
  .filter((c) => c && c.var7 > -60 && c.var7 < 60);
const subenEn = [...radarEn].sort((a, b) => b.var7 - a.var7).slice(0, 15);
const bajanEn = [...radarEn].sort((a, b) => a.var7 - b.var7).slice(0, 15);

const filaRadarEn = (c, cls) => `<tr>
  <td><a href="/en/card/${enSlug(c)}/">${esc(enName(c))}</a> <span class="muted small">${esc(setNameEn(c))}</span></td>
  <td class="num">${eurEn(c.price)}<br><span class="muted small">≈ ${usdEn(c.price)} / ${gbpEn(c.price)}</span></td>
  <td class="num ${cls}">${c.var7 >= 0 ? '+' : ''}${c.var7.toFixed(1)}%</td>
</tr>`;

const marketEnBody = `
<nav class="migas"><a href="/en/">Home</a> / Market</nav>
<h1>What moved this week</h1>
<p class="lede">Seven-day average against the 30-day average, on the ${radarEn.length} cards in the English
top 100 that have enough price history. Rebuilt on every update, so this is today's market, not an article.</p>

<div class="dos-col">
  <div>
    <h2>Up</h2>
    <table class="listado"><thead><tr><th>Card</th><th class="num">Price (EUR)</th><th class="num">7 days</th></tr></thead>
    <tbody>${subenEn.map((c) => filaRadarEn(c, 'up')).join('')}</tbody></table>
  </div>
  <div>
    <h2>Down</h2>
    <table class="listado"><thead><tr><th>Card</th><th class="num">Price (EUR)</th><th class="num">7 days</th></tr></thead>
    <tbody>${bajanEn.map((c) => filaRadarEn(c, 'down')).join('')}</tbody></table>
  </div>
</div>

<section class="bloque">
  <h2>How it is calculated</h2>
  <p>A single sale can move the latest price, so we do not use it. We compare the 7-day average with the 30-day
  average and discard moves above 60%, which in cards with few sales is noise rather than a trend.</p>
  <p class="muted">Cardmarket reference prices via TCGdex. Not a prediction or a buying recommendation.</p>
  <p class="nota small">${FX_NOTE} The English section tracks the 100 most valuable cards; the full market radar
  is on the <a href="/mercado/">Spanish market page</a>.</p>
</section>`;

await enPage(
  'market/',
  layout({
    lang: 'en',
    title: `Pokémon Card Market — What Is Rising and Falling This Week | ${config.brand}`,
    description:
      'Seven-day versus 30-day price moves on the 100 most valuable Pokémon cards, rebuilt daily. Prices in EUR with approximate USD and GBP.',
    url: '/en/market/',
    alternates: altPair('/mercado/', '/en/market/'),
    body: `${marketEnBody}
<div class="acciones">
  <a class="btn" href="/comprar/">Verified sealed products →</a>
  <a class="btn ghost" href="/en/price-check/">Value my collection</a>
</div>
<p class="nota small">Affiliate disclosure: as an Amazon Associate, ValorCarta earns from qualifying purchases. The price you pay does not change.</p>`,
  }),
);

const enTotal = enCards.reduce((s, c) => s + (c.price ?? 0), 0);
const mostExpensiveEnBody = `
<nav class="migas"><a href="/en/">Home</a> / Top 100</nav>
<h1>The 100 most expensive Pokémon cards</h1>
<p class="lede">Ranked by Cardmarket reference price. The list is rebuilt on every update, so a card that rises
enters and a card that falls leaves. Prices in EUR, with an approximate USD and GBP conversion.</p>
<p class="muted">Combined market value of the 100 cards: <b>${eurEn(enTotal)}</b>
<span class="small">(≈ ${usdEn(enTotal)} / ${gbpEn(enTotal)})</span>.</p>
<table class="listado ranking">
<thead><tr><th>#</th><th>Card</th><th>Set</th><th class="num">EUR</th><th class="num">≈ USD</th><th class="num">≈ GBP</th></tr></thead>
<tbody>
${enCards
  .map(
    (c, i) => `<tr>
  <td class="num muted">${i + 1}</td>
  <td><a href="/en/card/${enSlug(c)}/">${esc(enName(c))}</a></td>
  <td class="muted">${esc(setNameEn(c))}</td>
  <td class="num">${eurEn(c.price)}</td>
  <td class="num muted">${usdEn(c.price)}</td>
  <td class="num muted">${gbpEn(c.price)}</td>
</tr>`,
  )
  .join('')}
</tbody></table>
<p class="nota small">${FX_NOTE} Reference prices are not an appraisal: condition decides the real value.</p>
<p class="acciones"><a class="btn" href="/en/price-check/">Check my collection</a>
<a class="btn ghost" href="/en/market/">What moved this week</a></p>`;

await enPage(
  'most-expensive/',
  layout({
    lang: 'en',
    title: `The 100 Most Expensive Pokémon Cards (Today's Prices) | ${config.brand}`,
    description:
      'Ranking of the 100 most expensive Pokémon cards by Cardmarket reference price, with EUR, approximate USD and GBP. Rebuilt daily.',
    url: '/en/most-expensive/',
    alternates: altPair('/caras/', '/en/most-expensive/'),
    body: `${mostExpensiveEnBody}
<div class="acciones">
  <a class="btn" href="/comprar/">Verified sealed products →</a>
  <a class="btn ghost" href="/en/">Top 100 by value</a>
</div>
<p class="nota small">Affiliate disclosure: as an Amazon Associate, ValorCarta earns from qualifying purchases.</p>`,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'The 100 most expensive Pokémon cards',
      itemListElement: enCards.slice(0, 20).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: enName(c),
        url: `${SITE}/en/card/${enSlug(c)}/`,
      })),
    },
  }),
);

const aboutEnBody = `
<nav class="migas"><a href="/en/">Home</a> / About</nav>
<h1>About ValorCarta</h1>
<p class="lede">ValorCarta is an independent price guide for Pokémon cards. We publish Cardmarket reference
prices, not appraisals, and we do not take custody of cards or run a marketplace.</p>

<section class="bloque">
  <h2>Where the prices come from</h2>
  <p>Reference prices are daily Cardmarket data collected through the public TCGdex API, the same source used by
  the Spanish edition. The price shown is a market reference: the average of recent sales, not a quote for a
  specific card in a specific condition.</p>
</section>

<section class="bloque">
  <h2>EUR, USD and GBP</h2>
  <p>The source price is in euros. ${FX_NOTE}</p>
</section>

<section class="bloque">
  <h2>Amazon affiliate links</h2>
  <p>As an Amazon Associate I earn from qualifying purchases. Links use the tag <b>valorcarta-21</b> and go to
  Amazon.es. When we have an ASIN for a set we link to that product; when we do not, the link goes to an Amazon
  search. We do not invent ASINs. The price is set by Amazon, and the commission costs you nothing.</p>
</section>

<section class="bloque">
  <h2>Privacy</h2>
  <p>No account and no tracking cookies. Your collection and price alerts are stored in your browser's local
  storage and are not sent to us. We use cookie-less GoatCounter analytics to count visits. If you subscribe to
  the Spanish alerts service, payment is handled by Lemon Squeezy as merchant of record.</p>
</section>

<section class="bloque">
  <h2>Not affiliated with Nintendo or The Pokémon Company</h2>
  <p>ValorCarta is not affiliated, sponsored or endorsed by Nintendo, Creatures Inc., GAME FREAK or The Pokémon
  Company. The trademarks cited belong to their owners.</p>
  <p class="muted">Contact: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a> ·
  <a href="/aviso-legal/">Full legal notice (Spanish)</a> · <a href="/privacidad/">Privacy policy (Spanish)</a></p>
</section>`;

await enPage(
  'about/',
  layout({
    lang: 'en',
    title: `About ValorCarta — Prices, Affiliate Links and Privacy`,
    description:
      'How ValorCarta gets Pokémon card prices, why USD and GBP are an approximate conversion, how Amazon affiliate links work and what data we store.',
    url: '/en/about/',
    body: aboutEnBody,
  }),
);

// 100 fichas inglesas: misma carta que la ficha ES, slug inglés y hreflang recíproco.
await mkdir(OUT('en/card'), { recursive: true });
for (const c of enCards) {
  const slug = enSlug(c);
  const meta = enMeta(c);
  const setName = setNameEn(c);
  const image = cardImageEn(c);
  const total = cardTotalEn(c);
  const year = setYearEn(c);
  const vHero = heroVariant(c);
  const heroPrice = listingPrice(vHero) ?? c.price;
  const heroListings = new Set(
    (c.variants ?? [])
      .filter((v) => {
        const p = listingPrice(v);
        return typeof p === 'number' && p > 0;
      })
      .map((v) => v.productId ?? `${v.type}|${v.subtype}|${listingPrice(v)}`),
  );
  const desdeEn = heroListings.size > 1 ? 'From ' : '';
  const delSet = (bySet.get(c.setId) ?? []).filter((x) => x.price > 0);
  const posSet = delSet.findIndex((x) => x.id === c.id) + 1;
  const categoryEn = meta.category === 'Pokemon' ? 'Pokémon' : meta.category || 'Pokémon';
  const kindEn = categoryEn === 'Trainer' ? 'Trainer card' : categoryEn === 'Energy' ? 'Energy card' : 'Pokémon card';
  const rarityEn = meta.rarity ? capEn(meta.rarity) : '';
  const typesEn = meta.types?.length ? meta.types.join(' / ') : null;
  const descriptionEn = `${rarityEn ? `${rarityEn} ` : ''}${typesEn ? `${typesEn} ` : ''}${kindEn} from ${setName}${
    year ? ` (${year})` : ''
  }${meta.illustrator ? `, illustrated by ${meta.illustrator}` : ''}.${total ? ` Card ${c.localId ?? '—'}/${total}.` : ''}`;
  const contextoEn = [
    posSet === 1 && delSet.length > 2
      ? `It is the most expensive card in ${setName}.`
      : posSet > 0 && delSet.length > 2
        ? `It ranks #${posSet} of ${delSet.length} by market value in ${setName}.`
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  const datosEn = [
    ['Category', categoryEn],
    ['Type', typesEn],
    ['HP', meta.hp],
    ['Stage', stageEn(meta.stage)],
    ['Evolves from', meta.evolveFrom],
    ['Ability', meta.abilities?.join(', ')],
    ['Weakness', meta.weaknesses?.map((w) => `${w.type} ${w.value}`).join(' · ')],
    ['Retreat cost', meta.retreat],
    ['Legal', legalEn(meta.legal)],
    ['Regulation mark', meta.regulationMark],
    ['Rarity', meta.rarity ? capEn(meta.rarity) : null],
    ['Illustrator', meta.illustrator],
    ['Number', c.localId ? `${c.localId}/${total}` : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  const attacksEn = (meta.attacks ?? [])
    .filter((a) => a.name || a.damage)
    .slice(0, 4)
    .map(
      (a) => `<li>${a.name ? `<b>${esc(a.name)}</b> ` : ''}${
        a.damage ? `<span class="dmg">${esc(String(a.damage))}</span>` : ''
      }${a.cost?.length ? ` <span class="muted small">(${a.cost.map(esc).join(' · ')})</span>` : ''}</li>`,
    )
    .join('');

  const asin = ASINS[c.setId]?.[0] ?? null;
  const ctaEn = asin
    ? `<a class="btn ghost" href="/en/most-expensive/">See how this card compares</a>
    <p class="nota small">This single card is not sold on Amazon, so there is no Amazon link here: we would be sending you to another product. See the verified sealed products in <a href="/comprar/">Buy</a>.</p>`
    : `<a class="btn ghost" href="/en/most-expensive/">See how this card compares</a>`;

  const pos = enCards.findIndex((x) => x.id === c.id);
  const more = [...enCards.slice(pos + 1), ...enCards.slice(0, pos)].slice(0, 6);
  const pathEn = `/en/card/${slug}/`;

  const body = `
<nav class="migas"><a href="/en/">Home</a> / <a href="/en/most-expensive/">Top 100</a> / ${esc(enName(c))}</nav>
<div class="carta-layout">
  <div class="carta-img">
    ${image ? `<img src="${esc(image)}/high.webp" alt="Pokémon card ${esc(enName(c))} from ${esc(setName)}" width="480" height="670" loading="eager" onerror="this.outerHTML='<div class=tile-ph>'+this.alt+'</div>'">` : ''}
  </div>
  <div class="carta-info">
    <h1>How much is ${esc(enName(c))} worth?</h1>
    <p class="precio-grande">${desdeEn}${eurEn(heroPrice)}<span class="muted"> · ${esc(vHero ? variantLabelEn(vHero).toLowerCase() : 'reference')}</span></p>
    <p class="muted">≈ ${usdEn(heroPrice)} USD · ≈ ${gbpEn(heroPrice)} GBP <span class="small">(approximate conversion)</span></p>
    ${trendLine(c, 'en')}
    <p class="muted">${esc(descriptionEn)}</p>
    ${priceTableEn(c)}
    ${attacksEn ? `<h2 class="mini">Attacks</h2><ul class="ataques">${attacksEn}</ul>` : ''}
    ${
      datosEn.length
        ? `<table class="prices datos"><tbody>${datosEn
            .map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${esc(String(v))}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
    }
    ${meta.effect ? `<p class="contexto"><b>Card effect:</b> ${esc(meta.effect)}</p>` : ''}
    ${contextoEn ? `<p class="contexto">${esc(contextoEn)}</p>` : ''}
    <p class="nota">Reference price from Cardmarket (sales average, not an appraisal). Near Mint copies sell
    for more; played copies for much less.</p>
    <p class="nota small">${FX_NOTE}</p>
    ${ctaEn}
    <p class="nota small">As an Amazon Associate I earn from qualifying purchases. Amazon sets the price.${
      asin
        ? ' We link to sealed products for this set, not to single cards.'
        : ' This is a search link: check condition and language before buying.'
    }</p>
    <p class="nota"><a href="/carta/${cardSlug(c)}/" hreflang="es">Read this card in Spanish →</a> ·
    <a href="/en/most-expensive/">See all 100 →</a></p>
    <div class="acciones">
      <button class="btn ghost" data-add-en="${esc(slug)}">Add to my collection</button>
      <a class="btn ghost" href="/en/price-check/">Check a collection</a>
    </div>
  </div>
</div>
${
  more.length
    ? `<section class="bloque"><h2>More of the 100 most expensive cards</h2><div class="grid">${more
        .map(cardTileEn)
        .join('')}</div></section>`
    : ''
}`;

  await put(
    OUT(`en/card/${slug}/index.html`),
    layout({
      lang: 'en',
      title: `${enName(c)}${c.localId ? ` ${c.localId}` : ''} — ${setName} card value | ${config.brand}`,
      description: `What is ${enName(c)} from ${setName} worth? Market price today: ${eurEn(c.price)} (approx. ${usdEn(c.price)} / ${gbpEn(c.price)}). 30-day average and low, updated daily.`,
      url: pathEn,
      alternates: altPair(`/carta/${cardSlug(c)}/`, pathEn),
      image: image ? `${image}/high.webp` : undefined,
      scripts: ['/assets/en.js'],
      body: `${body}
<div class="acciones">
  <a class="btn ghost" href="/comprar/">See verified sealed products</a>
</div>
<p class="nota small">Affiliate disclosure: as an Amazon Associate, ValorCarta earns from qualifying purchases. This single card is not sold on Amazon, so there is no Amazon link here: we do not send you to a search page. Verified sealed products are in Buy.</p>`,
      jsonld: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/en/` },
            { '@type': 'ListItem', position: 2, name: 'Top 100', item: `${SITE}/en/most-expensive/` },
            { '@type': 'ListItem', position: 3, name: enName(c), item: `${SITE}${pathEn}` },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: `${enName(c)} — ${setName}`,
          image: image ? `${image}/high.webp` : undefined,
          description: descriptionEn,
          brand: { '@type': 'Brand', name: 'Pokémon' },
          offers: {
            '@type': 'Offer',
            price: c.price,
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
            url: `${SITE}${pathEn}`,
          },
        },
      ],
    }),
  );
  enPaths.push(pathEn);
}

// índice ligero para el buscador y la calculadora ingleses
const enIndex = enCards.map((c) => [
  enSlug(c),
  enName(c),
  setNameEn(c),
  c.price,
  bestVariant(c)?.avg30 ?? null,
  cardImageEn(c),
  c.setId,
]);
await put(OUT('en/data/cards.json'), JSON.stringify({ fx: FX, cards: enIndex }));

// ---------- assets ----------
await put(OUT('404.html'), layout({
  title: `No encontrado | ${config.brand}`,
  description: 'Página no encontrada.',
  url: '/404.html',
  noindex: true,
  body: `<h1>Esa carta no existe</h1><p class="lede">Puede que el enlace esté mal o que la carta ya no tenga datos de precio.</p><p><a class="btn" href="/valorar/">Valorar mi colección</a></p>`,
}));

await put(OUT('robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml
Sitemap: ${SITE}/sitemap-en.xml\nSitemap: ${SITE}/ygo/sitemap.xml\nSitemap: ${SITE}/magic/sitemap.xml\n`);

// sitemap
const urls = ['/', '/cartas/', '/sets/', '/valorar/', '/premium/', '/guias/', '/datos/', '/comprar/', '/comprar/sobres/', '/comprar/caja-36/', '/comprar/etb/', '/comprar/etb-30/', '/comprar/lote-30/', '/comprar/etb-dominio-delta/', '/comprar/regalos/', '/comprar/lata/', '/comprar/blister/', '/mercado/', '/caras/', '/alertas/', '/guardar-cartas/', '/tiendas/', '/informe-muestra/', '/aviso-legal/', '/privacidad/']
  .map((u) => `${SITE}${u}`)
  .concat([...bySet.keys()].map((id) => `${SITE}/set/${id}/`))
  .concat(priced.filter((c) => indexables.has(c.id)).map((c) => `${SITE}/carta/${cardSlug(c)}/`))
  .concat(guias.map((g) => `${SITE}/guia/${g.slug}/`))
  .concat(RADAR.map((r) => `${SITE}/radar/${r.slug}/`))
  .concat([`${SITE}/radar/`, `${SITE}/guias/idioma/`])
  .concat(enPaths.map((u) => `${SITE}${u}`));
// sitemap plano: con menos de 2.000 URLs no hace falta indice
const lastmod = (cards[0]?.updated ?? new Date().toISOString()).slice(0, 10);
// copia con nombre alternativo: fuerza a Google a rastrear una URL nueva
await put(
  'sitemap-google.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('\n')}\n</urlset>`,
);
// copiado de cardpeer: un sitemap por idioma, para leer el rendimiento por mercado
await put(
  'sitemap-en.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${enPaths
    .map((u) => `<url><loc>${SITE}${u}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('\n')}\n</urlset>`,
);
await put(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `<url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('\n')}\n</urlset>`,
);

// indice ligero para el buscador del cliente
const idx = priced.map((c) => [
  cardSlug(c),
  c.name,
  c.setName,
  c.price,
  bestVariant(c)?.avg30 ?? null,
  c.image ?? null,
  c.setId,
]);
await put(OUT('data/cartas.json'), JSON.stringify(idx));
// FSM 08-11: ruta de datos crudos para el crítico y QA clínico (auditoría servido vs dato).
await put(OUT('data/cards.json'), JSON.stringify(cards));
await put(OUT('datos/cards.json'), JSON.stringify(cards));

console.log(`OK ${n} cartas, ${bySet.size} sets, ${urls.length} URLs en sitemap`);
console.log(`   catálogo valorado: ${eur(totalValor)} · índice ${(JSON.stringify(idx).length / 1e6).toFixed(1)} MB`);
console.log(`   EN: ${enPaths.length} URLs (${enCards.length} fichas) · cambio fijo EUR→USD ${FX.USD.toFixed(2)} / EUR→GBP ${FX.GBP.toFixed(2)}`);

function cardTile(c) {
  return `<a class="tile" href="/carta/${cardSlug(c)}/">
  ${c.image ? `<img src="${esc(c.image)}/low.webp" alt="${esc(c.name)}" width="245" height="342" loading="${c.prio ? 'eager' : 'lazy'}" fetchpriority="${c.prio ? 'high' : 'auto'}" decoding="async" onerror="this.outerHTML='<div class=tile-ph>'+this.alt+'</div>'">` : `<div class="tile-ph">${esc(c.name)}</div>`}
  <span class="tile-name">${esc(c.name)}</span>
  <span class="tile-price">${c.price ? eur(c.price) : '—'}</span>
  <span class="tile-set muted">${esc(c.setName)}</span>
</a>`;
}

function cardTileEn(c) {
  const image = cardImageEn(c);
  return `<a class="tile" href="/en/card/${enSlug(c)}/">
  ${image ? `<img src="${esc(image)}/low.webp" alt="${esc(enName(c))}" width="245" height="342" loading="lazy" onerror="this.outerHTML='<div class=tile-ph>'+this.alt+'</div>'">` : `<div class="tile-ph">${esc(enName(c))}</div>`}
  <span class="tile-name">${esc(enName(c))}</span>
  <span class="tile-price">${eurEn(c.price)}</span>
  <span class="tile-set muted">≈ ${usdEn(c.price)} · ${gbpEn(c.price)}</span>
  <span class="tile-set muted">${esc(setNameEn(c))}</span>
</a>`;
}
