/* ValorCarta - buscador + calculadora de colección (sin dependencias) */
(() => {
  const KEY = 'vc.col';
  const $ = (s) => document.querySelector(s);
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);

  let DB = null;
  let MAP = new Map();
  const enValorar = !!document.getElementById('coleccion');

  const leer = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  };
  const guardar = (list) => {
    localStorage.setItem(KEY, JSON.stringify(list));
    pintar();
  };

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('on'), 1800);
  }

  function add(slug) {
    const list = leer();
    const hit = list.find((x) => x.s === slug);
    if (hit) hit.q += 1;
    else list.push({ s: slug, q: 1 });
    guardar(list);
    toast('Añadida a tu colección');
  }

  async function cargar() {
    if (DB) return DB;
    const r = await fetch('/data/cartas.json');
    DB = await r.json();
    MAP = new Map(DB.map((row) => [row[0], row]));
    return DB;
  }

  function pintarResultados(items) {
    const box = $('#resultados');
    if (!box) return;
    if (!items.length) { box.classList.remove('on'); return; }
    box.innerHTML = items
      .map((row) => {
        const [slug, name, set, price, , img] = row;
        return `<div class="res" data-slug="${slug}">
          ${img ? `<img src="${img}/low.webp" alt="" loading="lazy">` : ''}
          <span class="res-n">${name}<br><span class="res-s">${set}</span></span>
          <span class="res-p">${eur(price)}</span>
        </div>`;
      })
      .join('');
    box.classList.add('on');
    box.querySelectorAll('.res').forEach((el) => {
      el.addEventListener('click', () => {
        const slug = el.dataset.slug;
        if (enValorar) { add(slug); $('#q').value = ''; box.classList.remove('on'); }
        else location.href = `/carta/${slug}/`;
      });
    });
  }

  function buscar(q) {
    if (!DB) return;
    const t = norm(q.trim());
    if (t.length < 2) { pintarResultados([]); return; }
    const out = [];
    const empieza = [];
    for (const row of DB) {
      const n = norm(row[1]);
      if (n.startsWith(t)) empieza.push(row);
      else if (n.includes(t) || norm(row[2]).includes(t)) out.push(row);
      if (empieza.length > 14) break;
    }
    pintarResultados([...empieza, ...out].slice(0, 14));
  }

  function pintar() {
    const box = $('#coleccion');
    if (!box) return;
    const list = leer();
    if (!list.length) {
      box.innerHTML = '<p class="muted">Todavía no has añadido cartas.</p>';
      $('#total').textContent = eur(0);
      $('#delta').textContent = '';
      $('#n-cartas').textContent = '';
      return;
    }
    let total = 0;
    let total30 = 0;
    let uds = 0;
    box.innerHTML = list
      .map((it) => {
        const row = MAP.get(it.s);
        if (!row) return '';
        const [, name, set, price, avg30, img] = row;
        const sub = price * it.q;
        total += sub;
        total30 += (avg30 ?? price) * it.q;
        uds += it.q;
        return `<div class="fila" data-slug="${it.s}">
          ${img ? `<img src="${img}/low.webp" alt="" loading="lazy">` : '<span></span>'}
          <span><span class="f-n">${name}</span><br><span class="f-s">${set}</span></span>
          <input type="number" min="1" max="99" value="${it.q}" aria-label="cantidad">
          <span class="f-p">${eur(sub)}</span>
          <button class="del" aria-label="quitar">×</button>
        </div>`;
      })
      .join('');
    $('#total').textContent = eur(total);
    $('#n-cartas').textContent = `· ${list.length} cartas · ${uds} unidades`;
    const d = total - total30;
    const pct = total30 ? (d / total30) * 100 : 0;
    $('#delta').innerHTML = total30
      ? `Últimos 30 días: <b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${eur(d)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)</b>`
      : '';

    box.querySelectorAll('.fila').forEach((el) => {
      const slug = el.dataset.slug;
      el.querySelector('input').addEventListener('change', (e) => {
        const list2 = leer();
        const hit = list2.find((x) => x.s === slug);
        if (!hit) return;
        hit.q = Math.max(1, Math.min(99, parseInt(e.target.value) || 1));
        guardar(list2);
      });
      el.querySelector('.del').addEventListener('click', () => {
        guardar(leer().filter((x) => x.s !== slug));
      });
    });
  }

  // --- intérprete de frases: "2 charizard base y un pikachu de 151" ---
  const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

  function trocear(texto) {
    return texto
      .toLowerCase()
      .split(/[,;\n]|\by\b/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function puntuar(trozo, row) {
    const [, name, set, , , , setId] = row;
    const n = norm(name);
    const s = norm(set);
    const sid = norm(setId || '');
    const palabras = norm(trozo).split(/\s+/).filter((w) => w.length > 2 && !NUM[w]);
    if (!palabras.length) return 0;
    let score = 0;
    for (const w of palabras) {
      if (n === w) score += 6;
      else if (n.startsWith(w)) score += 4;
      else if (n.includes(w)) score += 2;
      else if (s.includes(w)) score += 1.5;
      else if (sid.includes(w)) score += 3;
      else score -= 1;
    }
    return score;
  }

  function interpretar(texto) {
    const trozos = trocear(texto);
    const salida = [];
    for (const t of trozos) {
      let qty = 1;
      let resto = t;
      const m = t.match(/^(\d+)\s+(.*)$/);
      const p = t.match(/^(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(.*)$/);
      if (m) { qty = Math.min(99, parseInt(m[1], 10)); resto = m[2]; }
      else if (p) { qty = NUM[p[1]]; resto = p[2]; }
      let mejor = null;
      let mejorScore = 0;
      for (const row of DB) {
        const sc = puntuar(resto, row);
        if (sc > mejorScore) { mejorScore = sc; mejor = row; }
      }
      if (mejor && mejorScore >= 2) salida.push({ slug: mejor[0], qty, texto: resto, nombre: mejor[1], set: mejor[2] });
      else salida.push({ slug: null, qty, texto: resto, nombre: null, set: null });
    }
    return salida;
  }

  function aplicarFrase() {
    const inp = $('#frase');
    const out = $('#frase-out');
    if (!inp || !DB) return;
    const res = interpretar(inp.value || '');
    const ok = res.filter((r) => r.slug);
    const mal = res.filter((r) => !r.slug);
    if (!ok.length) { out.textContent = 'No he reconocido ninguna carta. Prueba con el nombre y el set.'; return; }
    const list = leer();
    for (const r of ok) {
      const hit = list.find((x) => x.s === r.slug);
      if (hit) hit.q += r.qty;
      else list.push({ s: r.slug, q: r.qty });
    }
    guardar(list);
    out.innerHTML = ok.map((r) => `· ${r.qty} × ${r.nombre} <span class="muted">(${r.set})</span>`).join('<br>')
      + (mal.length ? `<br><span class="down">No reconocido:</span> ${mal.map((m) => m.texto).join(', ')}` : '');
    inp.value = '';
  }

  function enc(list) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(list)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
  }

  function init() {
    // Las páginas /en/ usan assets/en.js: aquí no hay textos ni rutas en inglés.
    if (document.documentElement.lang === 'en') return;
    const q = $('#q');
    if (q) {
      q.addEventListener('input', (e) => buscar(e.target.value));
      q.addEventListener('focus', () => { if (DB) buscar(q.value); });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.buscador')) $('#resultados')?.classList.remove('on');
      });
    }

    // progreso del set: «tienes X de Y». El álbum que se completa, sin cuentas.
    const cont = document.getElementById('progreso-set');
    if (cont) {
      const setId = cont.dataset.set;
      const total = parseInt(cont.dataset.total || '0', 10);
      const list = leer();
      const mias = list.filter((x) => String(x.s || '').startsWith(setId + '-')).length;
      if (total > 0) {
        const pct = Math.round((mias / total) * 100);
        cont.innerHTML = (mias
          ? `Tienes <b>${mias}</b> de <b>${total}</b> cartas de este set (${pct} %).`
          : `Aún no has marcado ninguna de las ${total} cartas de este set.`)
          + ' <a href="/valorar/">Ver el valor de mi colección →</a>';
      }
    }

    document.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => { add(b.dataset.add); }),
    );

    // avisos de precio
    const WKEY = 'vc.watch';
    const leerW = () => { try { return JSON.parse(localStorage.getItem(WKEY) || '[]'); } catch { return []; } };
    document.querySelectorAll('[data-watch]').forEach((b) =>
      b.addEventListener('click', () => {
        const slug = b.dataset.watch;
        const inp = document.getElementById('umbral');
        const t = Math.max(0, parseFloat(String(inp?.value ?? '').replace(',', '.')) || 0);
        const list = leerW().filter((x) => x.s !== slug);
        list.push({ s: slug, t });
        localStorage.setItem(WKEY, JSON.stringify(list));
        toast(t ? `Aviso activado por debajo de ${t.toFixed(2)} €` : 'Aviso activado');
      }),
    );

    if (enValorar) {
      const hash = location.hash.slice(1);
      if (hash.startsWith('c=')) {
        const l = dec(hash.slice(2));
        if (Array.isArray(l)) localStorage.setItem(KEY, JSON.stringify(l));
      }
      cargar().then(pintar);

      $('#compartir')?.addEventListener('click', async () => {
        const url = `${location.origin}/valorar/#c=${enc(leer())}`;
        try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
        catch { prompt('Copia este enlace:', url); }
      });
      $('#csv')?.addEventListener('click', () => {
        const rows = [['carta', 'set', 'unidades', 'precio', 'subtotal']];
        for (const it of leer()) {
          const row = MAP.get(it.s);
          if (!row) continue;
          rows.push([row[1], row[2], it.q, row[3], (row[3] * it.q).toFixed(2)]);
        }
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
        a.download = 'mi-coleccion.csv';
        a.click();
      });
      $('#interpretar')?.addEventListener('click', aplicarFrase);
      $('#frase')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicarFrase(); });
      $('#vaciar')?.addEventListener('click', () => {
        if (confirm('¿Vaciar la colección?')) guardar([]);
      });
    } else {
      cargar().then(pintarAvisos);
    }
  }

  function pintarAvisos() {
    const box = document.getElementById('alertas-lista');
    if (!box || !DB) return;
    const list = leerW();
    if (!list.length) return;
    box.innerHTML = list
      .map((it) => {
        const row = MAP.get(it.s);
        if (!row) return '';
        const [, name, set, price, , img] = row;
        const cumple = it.t > 0 && price <= it.t;
        return `<div class="fila alerta ${cumple ? 'cumple' : ''}" data-slug="${it.s}">
          ${img ? `<img src="${img}/low.webp" alt="" loading="lazy">` : '<span></span>'}
          <span><span class="f-n">${name}</span><br><span class="f-s">${set}</span></span>
          <span class="f-p">${eur(price)}<br><span class="f-s">objetivo ${it.t ? eur(it.t) : '—'}</span></span>
          <span class="estado">${cumple ? '¡está por debajo!' : 'esperando'}</span>
          <button class="del" aria-label="quitar">×</button>
        </div>`;
      })
      .join('');
    box.querySelectorAll('.fila').forEach((el) => {
      el.querySelector('.del').addEventListener('click', () => {
        localStorage.setItem(WKEY, JSON.stringify(leerW().filter((x) => x.s !== el.dataset.slug)));
        location.reload();
      });
    });
  }

  // medir clics salientes a Amazon (evento de GoatCounter)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="amazon.es"]');
    if (!a || !window.goatcounter || !window.goatcounter.count) return;
    // se etiqueta con la procedencia de la visita (utm_content/utm_medium) para saber
    // QUÉ pieza produjo el clic, no solo que hubo un clic
    const q = new URLSearchParams(location.search);
    const origen = (q.get('utm_content') || q.get('utm_medium') || 'directo').slice(0, 24);
    const asin = ((a.getAttribute('href') || '').match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || 'sin-asin';
    window.goatcounter.count({
      path: 'amazon-click/' + asin + '/' + origen,
      title: location.pathname,
      event: true,
    });
  }, true);


  // formato (05-11): el pin llega con utm_medium=lista|video|carta|producto; se cuenta
  // como evento para poder comparar formatos en GoatCounter (Pinterest no da el desglose).
  (() => {
    const medio = new URLSearchParams(location.search).get('utm_medium');
    if (!medio) return;
    const limpio = medio.replace(/[^a-z]/gi, '').slice(0, 12);
    let intentos = 0;
    const dispara = () => {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: 'formato-' + limpio, title: location.pathname, event: true });
        return;
      }
      if (intentos++ < 40) setTimeout(dispara, 50);   // goatcounter carga async
    };
    dispara();
  })();

  // prueba A/B del gancho (05-11): utm_content=ab-* se cuenta como evento propio,
  // para saber qué redacción del pin trae clics sin depender de Pinterest.
  (() => {
    const sub = new URLSearchParams(location.search).get('utm_content') || '';
    if (!sub.startsWith('ab-')) return;
    const limpio = sub.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    let intentos = 0;
    const dispara = () => {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: 'ab-' + limpio, title: location.pathname, event: true });
        return;
      }
      if (intentos++ < 40) setTimeout(dispara, 50);
    };
    dispara();
  })();

  // ID de seguimiento por canal (05-11): Amazon sí lo reporta, el ascsubtag no.
  // Pin -> valorcarta-pin-21 · vídeo -> valorcarta-video-21 · resto -> valorcarta-21
  (() => {
    const q = new URLSearchParams(location.search);
    const medio = (q.get('utm_medium') || '').toLowerCase();
    const origen = (q.get('utm_source') || '').toLowerCase();
    let etiqueta = 'valorcarta-21';
    if (medio === 'video') etiqueta = 'valorcarta-video-21';
    else if (origen === 'pinterest' || medio) etiqueta = 'valorcarta-pin-21';
    document.querySelectorAll('a[href*="amazon.es"]').forEach((a) => {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        u.searchParams.set('tag', etiqueta);
        a.setAttribute('href', u.toString());
      } catch (e) {}
    });
  })();

  // atribución por pieza (05-11): el pin llega con ?utm_content=vtc-xxxx
  // y ese valor viaja a Amazon como ascsubtag. Sin esto, los clics no tienen dueño.
  (() => {
    const sub = new URLSearchParams(location.search).get('utm_content');
    if (!sub) return;
    const limpio = sub.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    document.querySelectorAll('a[href*="amazon.es"]').forEach((a) => {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        u.searchParams.set('ascsubtag', limpio);
        a.setAttribute('href', u.toString());
      } catch (e) {}
    });
  })();


  // StoreID por canal (06-11): si la visita viene de Pinterest, los enlaces de
  // Amazon se reescriben al ID de Pinterest. Sin esto todo se atribuía a la web
  // y no se podía saber qué trae cada canal.
  (() => {
    const q = new URLSearchParams(location.search);
    const dePinterest = q.get('utm_source') === 'pinterest'
      || /pinterest\./i.test(document.referrer || '');
    if (!dePinterest) return;
    const reescribe = () => {
      document.querySelectorAll('a[href*="amazon.es"]').forEach((a) => {
        try {
          const u = new URL(a.getAttribute('href'), location.href);
          if (u.searchParams.get('tag') === 'valorcarta-pin-21') return;
          u.searchParams.set('tag', 'valorcarta-pin-21');
          a.setAttribute('href', u.toString());
        } catch (e) {}
      });
    };
    reescribe();
    setTimeout(reescribe, 1200);   // por si el buscador pinta enlaces después
  })();

  // si el DOM ya está listo cuando este fichero se ejecuta, DOMContentLoaded no vuelve a
  // dispararse y init() no corría (el progreso del set salía vacío, 05-11)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ===== Vitrina de /mercado/: la carta se inclina con el ratón =====
   Solo en punteros finos y sin prefers-reduced-motion: en táctil no hay hover y
   el giro solo estorbaría. El precio y el botón no dependen de esto para verse. */
(() => {
  const cartas = document.querySelectorAll('[data-tilt]');
  if (!cartas.length) return;
  const fino = window.matchMedia('(hover:hover) and (pointer:fine)');
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!fino.matches || quieto.matches) return;
  cartas.forEach((carta) => {
    const zona = carta.closest('.vh-arte');
    if (!zona) return;
    let raf = 0;
    zona.addEventListener('pointermove', (e) => {
      const r = zona.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        carta.style.transform = `rotateY(${(x * 12).toFixed(2)}deg) rotateX(${(-y * 12).toFixed(2)}deg) translateY(-3px)`;
      });
    });
    zona.addEventListener('pointerleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      carta.style.transform = '';
    });
  });
})();


/* Menú: solo un desplegable abierto a la vez; se cierra al pulsar fuera o Escape.
   (El atributo name de <details> lo hace en navegadores nuevos; esto lo cubre en todos.) */
(() => {
  const menus = document.querySelectorAll('.top nav details');
  if (!menus.length) return;
  const cierra = (salvo) => menus.forEach((d) => { if (d !== salvo) d.open = false; });
  menus.forEach((d) => d.addEventListener('toggle', () => { if (d.open) cierra(d); }));
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.top nav details')) cierra(null);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cierra(null); });
})();


/* Figura decorativa junto al logo: cambia de Pokémon en cada pantalla/carga. */
(() => {
  const img = document.getElementById('figura-img');
  if (!img) return;
  const total = 3;
  let i = parseInt(sessionStorage.getItem('vcFigura') || '-1', 10);
  i = isNaN(i) ? 0 : (i + 1) % total;
  try { sessionStorage.setItem('vcFigura', String(i)); } catch (e) {}
  img.src = `/assets/mascotas/fig${i + 1}.svg`;
})();

/* Arreglo defensivo: normaliza los ASIN en las rutas de imágenes de producto (mayúsculas) */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('img[src*="/productos/producto-"]').forEach(function (img) {
    var m = img.getAttribute('src').match(/producto-([A-Za-z0-9]{10})\.jpg/);
    if (m && m[1] !== m[1].toUpperCase()) {
      img.src = img.getAttribute('src').replace(m[1], m[1].toUpperCase());
    }
  });
});
