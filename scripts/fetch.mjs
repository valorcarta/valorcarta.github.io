#!/usr/bin/env node
// Descarga catálogo + precios de Cardmarket desde la API publica de TCGdex.
// Uso: node scripts/fetch.mjs [--sets=me05,sv03] [--limit=500]
// Cachea cada carta en data/cache/<id>.json -> se puede relanzar y reanuda.

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'data', 'cache');
const DATA = path.join(ROOT, 'data');
const API = 'https://api.tcgdex.net/v2/es';
// CDN de TCGdex: con la misma URL, un runner de otro país puede recibir una copia
// cacheada de ayer. Un sello único por ejecución fuerza la consulta a origen.
const SELLO = Date.now().toString(36);
const CONCURRENCY = 18;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const onlySets = args.sets ? new Set(args.sets.split(',')) : null;
const limit = args.limit ? Number(args.limit) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 7) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'valorcarta/0.1' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1) ** 2);
    }
  }
}

async function pool(items, worker, size = CONCURRENCY) {
  let i = 0;
  let done = 0;
  const out = new Array(items.length);
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
      done++;
      if (done % 250 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
    }
  });
  await Promise.all(runners);
  return out;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null);

// Normaliza la carta: solo lo que usa la web.
function normalizeCard(full, setMeta) {
  const variants = [];
  for (const v of full.variants_detailed ?? []) {
    const cm = v?.pricing?.cardmarket;
    if (!cm) continue;
    variants.push({
      type: v.type ?? null,
      subtype: v.size ?? null,
      productId: cm.idProduct ?? v?.thirdParty?.cardmarket ?? null,
      avg: num(cm.avg),
      low: num(cm.low),
      trend: num(cm.trend),
      avg1: num(cm.avg1),
      avg7: num(cm.avg7),
      avg30: num(cm.avg30),
      holoAvg: num(cm['avg-holo']),
      holoTrend: num(cm['trend-holo']),
      holoLow: num(cm['low-holo']),
      updated: cm.updated ?? null,
    });
  }
  const best =
    variants
      .map((v) => v.trend ?? v.avg ?? 0)
      .reduce((a, b) => (b > a ? b : a), 0) || null;
  const updated = variants.map((v) => v.updated).filter(Boolean).sort().at(-1) ?? null;

  return {
    id: full.id,
    localId: full.localId ?? null,
    name: full.name,
    setId: setMeta.id,
    setName: setMeta.name,
    serie: setMeta.serie?.name ?? null,
    releaseDate: setMeta.releaseDate ?? null,
    rarity: full.rarity ?? null,
    category: full.category ?? null,
    illustrator: full.illustrator ?? null,
    image: full.image ?? null,
    hp: full.hp ?? null,
    types: full.types ?? null,
    stage: full.stage ?? null,
    evolveFrom: full.evolveFrom ?? null,
    dexId: full.dexId ?? null,
    regulationMark: full.regulationMark ?? null,
    legal: full.legal ?? null,
    retreat: full.retreat ?? null,
    weaknesses: full.weaknesses ?? null,
    abilities: (full.abilities ?? []).map((a) => a?.name).filter(Boolean),
    attacks: (full.attacks ?? []).map((a) => ({
      name: a?.name ?? null,
      cost: a?.cost ?? [],
      damage: a?.damage ?? null,
    })),
    variants,
    price: best,
    updated,
  };
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  console.log('1/3 sets...');
  const sets = await getJSON(`${API}/sets?v=${SELLO}`);
  if (!sets) throw new Error('no se pudo leer /sets');
  const setsById = new Map(sets.map((s) => [s.id, s]));
  await writeFile(
    path.join(DATA, 'sets.json'),
    JSON.stringify(
      sets.map((s) => ({
        id: s.id,
        name: s.name,
        serie: s.serie ?? null,
        releaseDate: s.releaseDate ?? null,
        cardCount: s.cardCount ?? null,
        logo: s.logo ?? null,
        symbol: s.symbol ?? null,
      })),
      null,
      1,
    ),
  );

  console.log('2/3 lista de cartas...');
  const brief = [];
  for (let page = 1; page < 200; page++) {
    const chunk = await getJSON(
      `${API}/cards?pagination:page=${page}&pagination:itemsPerPage=250`,
    );
    if (!chunk || chunk.length === 0) break;
    brief.push(...chunk);
    process.stdout.write(`  pagina ${page}: ${brief.length} cartas\n`);
    if (chunk.length < 250) break;
  }

  let todo = brief;
  if (onlySets) todo = todo.filter((c) => onlySets.has(c.id.split('-')[0]));
  todo = todo.slice(0, limit);
  console.log(`3/3 detalles: ${todo.length} cartas (${brief.length} en catalogo)`);

  const cached = new Set(
    (await readdir(CACHE).catch(() => [])).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
  );
  console.log(`  ya en cache: ${cached.size}`);

  await pool(todo, async (c) => {
    if (cached.has(c.id)) return;
    const setId = c.id.split('-')[0];
    const setMeta = setsById.get(setId) ?? { id: setId, name: setId };
    const full = await getJSON(`${API}/cards/${c.id}?v=${SELLO}`);
    if (!full) return;
    const card = normalizeCard(full, setMeta);
    await writeFile(path.join(CACHE, `${c.id}.json`), JSON.stringify(card));
  });

  console.log('ensamblando data/cards.json ...');
  const files = (await readdir(CACHE)).filter((f) => f.endsWith('.json'));
  const cards = [];
  for (const f of files) {
    try {
      cards.push(JSON.parse(await readFile(path.join(CACHE, f), 'utf8')));
    } catch {
      /* fichero a medias: se ignora y se re-descarga en la proxima pasada */
    }
  }
  cards.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  await writeFile(path.join(DATA, 'cards.json'), JSON.stringify(cards));
  const withPrice = cards.filter((c) => c.price).length;
  console.log(`OK ${cards.length} cartas, ${withPrice} con precio -> data/cards.json`);
}

// Si la fuente falla, NO se tumba la web: se sigue con el catálogo del día anterior.
// Un despliegue con precios de ayer (fechados) es mejor que no desplegar nada.
main().catch(async (e) => {
  console.error('fetch falló:', e.message || e);
  try {
    const { stat } = await import('node:fs/promises');
    const prev = await stat(path.join(DATA, 'cards.json'));
    if (prev.size > 100000) {
      console.log('seguimos con data/cards.json de la pasada anterior');
      process.exit(0);
    }
  } catch {}
  process.exit(1);
});
