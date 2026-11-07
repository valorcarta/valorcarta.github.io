/* ValorCarta English: search + collection calculator for the 100 most valuable cards. */
(() => {
  const KEY = 'vc.col.en';
  const $ = (s) => document.querySelector(s);
  const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nf = {
    EUR: new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }),
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
  };
  const esc = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let DB = null;
  let MAP = new Map();
  // Overwritten with the rates declared in scripts/build.mjs (served in /en/data/cards.json).
  let FX = { USD: 1.08, GBP: 0.85 };
  let calc = false;

  const eur = (n) => nf.EUR.format(Number(n) || 0);
  const usd = (n) => nf.USD.format((Number(n) || 0) * FX.USD);
  const gbp = (n) => nf.GBP.format((Number(n) || 0) * FX.GBP);

  const read = () => {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter((x) => x && typeof x.s === 'string' && x.q > 0) : [];
    } catch {
      return [];
    }
  };
  const save = (list) => {
    localStorage.setItem(KEY, JSON.stringify(list));
    paint();
  };

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('on'), 1800);
  }

  function add(slug) {
    const list = read();
    const hit = list.find((x) => x.s === slug);
    if (hit) hit.q = Math.min(99, hit.q + 1);
    else list.push({ s: slug, q: 1 });
    save(list);
    toast('Added to your collection');
  }

  async function load() {
    if (DB) return DB;
    const r = await fetch('/en/data/cards.json');
    const data = await r.json();
    FX = data.fx || FX;
    DB = Array.isArray(data.cards) ? data.cards : [];
    MAP = new Map(DB.map((row) => [row[0], row]));
    return DB;
  }

  function render(items) {
    const box = $('#resultados-en');
    if (!box) return;
    if (!items.length) {
      box.classList.remove('on');
      return;
    }
    box.innerHTML = items
      .map((row) => {
        const [slug, name, set, price, , img] = row;
        return `<div class="res" data-slug="${esc(slug)}">
          ${img ? `<img src="${esc(img)}/low.webp" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span class="res-n">${esc(name)}<br><span class="res-s">${esc(set)}</span></span>
          <span class="res-p">${eur(price)}<br><span class="res-s">≈ ${usd(price)}</span></span>
        </div>`;
      })
      .join('');
    box.classList.add('on');
    box.querySelectorAll('.res').forEach((el) => {
      el.addEventListener('click', () => {
        if (calc) {
          add(el.dataset.slug);
          const q = $('#q-en');
          if (q) q.value = '';
          box.classList.remove('on');
        } else {
          location.href = `/en/card/${el.dataset.slug}/`;
        }
      });
    });
  }

  function search(value) {
    if (!DB) return;
    const term = norm(String(value || '').trim());
    if (term.length < 2) {
      render([]);
      return;
    }
    const starts = [];
    const contains = [];
    for (const row of DB) {
      const name = norm(row[1]);
      if (name.startsWith(term)) starts.push(row);
      else if (name.includes(term) || norm(row[2]).includes(term)) contains.push(row);
      if (starts.length > 14) break;
    }
    render([...starts, ...contains].slice(0, 14));
  }

  function totals(list) {
    let total = 0;
    let total30 = 0;
    let units = 0;
    for (const it of list) {
      const row = MAP.get(it.s);
      if (!row) continue;
      total += row[3] * it.q;
      total30 += (row[4] ?? row[3]) * it.q;
      units += it.q;
    }
    return { total, total30, units };
  }

  function paint() {
    const box = $('#coleccion-en');
    if (!box) return;
    const list = read();
    const { total, total30, units } = totals(list);
    const totalEl = $('#total-en');
    const usdEl = $('#total-usd');
    const gbpEl = $('#total-gbp');
    const deltaEl = $('#delta-en');
    const unitsEl = $('#n-cartas-en');

    if (totalEl) totalEl.textContent = eur(total);
    if (usdEl) usdEl.textContent = `≈ ${usd(total)} USD`;
    if (gbpEl) gbpEl.textContent = `≈ ${gbp(total)} GBP`;
    if (unitsEl) unitsEl.textContent = list.length ? `· ${units} card${units === 1 ? '' : 's'}` : '';
    if (deltaEl) {
      const diff = total - total30;
      const pct = total30 ? (diff / total30) * 100 : 0;
      deltaEl.innerHTML = total30
        ? `Last 30 days: <b class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${eur(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)</b>`
        : '';
    }

    if (!list.length) {
      box.innerHTML = '<p class="muted">No cards yet. Search above to add one.</p>';
      return;
    }

    box.innerHTML = list
      .map((it) => {
        const row = MAP.get(it.s);
        if (!row) return '';
        const [, name, set, price, , img] = row;
        const sub = price * it.q;
        return `<div class="fila" data-slug="${esc(it.s)}">
          ${img ? `<img src="${esc(img)}/low.webp" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span></span>'}
          <span><span class="f-n">${esc(name)}</span><br><span class="f-s">${esc(set)}</span></span>
          <input type="number" min="1" max="99" value="${it.q}" aria-label="Quantity">
          <span class="f-p">${eur(sub)}<br><span class="f-s">≈ ${usd(sub)}</span></span>
          <button class="del" aria-label="Remove">×</button>
        </div>`;
      })
      .join('');

    box.querySelectorAll('.fila').forEach((el) => {
      const slug = el.dataset.slug;
      el.querySelector('input').addEventListener('change', (e) => {
        const list2 = read();
        const hit = list2.find((x) => x.s === slug);
        if (!hit) return;
        hit.q = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
        save(list2);
      });
      el.querySelector('.del').addEventListener('click', () => {
        save(read().filter((x) => x.s !== slug));
      });
    });
  }

  const enc = (list) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(list))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const dec = (s) => {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
    } catch {
      return null;
    }
  };

  function bindAdd() {
    document.querySelectorAll('[data-add-en]').forEach((b) => {
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', () => add(b.dataset.addEn));
    });
  }

  function init() {
    calc = !!document.getElementById('coleccion-en');
    const q = $('#q-en');
    const addButtons = document.querySelectorAll('[data-add-en]');
    if (!q && !calc && !addButtons.length) return;

    load()
      .then(() => {
        bindAdd();
        if (calc) {
          const hash = location.hash.slice(1);
          if (hash.startsWith('c=')) {
            const list = dec(hash.slice(2));
            if (Array.isArray(list)) localStorage.setItem(KEY, JSON.stringify(list));
          }
          paint();

          $('#compartir-en')?.addEventListener('click', async () => {
            const url = `${location.origin}/en/price-check/#c=${enc(read())}`;
            try {
              await navigator.clipboard.writeText(url);
              toast('Share link copied');
            } catch {
              prompt('Copy this link:', url);
            }
          });
          $('#csv-en')?.addEventListener('click', () => {
            const rows = [['card', 'set', 'quantity', 'price_eur', 'subtotal_eur']];
            for (const it of read()) {
              const row = MAP.get(it.s);
              if (!row) continue;
              rows.push([row[1], row[2], it.q, row[3], (row[3] * it.q).toFixed(2)]);
            }
            const csv = rows
              .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
              .join('\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
            a.download = 'valorcarta-collection-en.csv';
            a.click();
          });
          $('#vaciar-en')?.addEventListener('click', () => {
            if (confirm('Clear your collection?')) save([]);
          });
        }

        if (q) {
          q.addEventListener('input', (e) => search(e.target.value));
          q.addEventListener('focus', () => {
            if (DB && q.value) search(q.value);
          });
          document.addEventListener('click', (e) => {
            if (!e.target.closest('.buscador')) $('#resultados-en')?.classList.remove('on');
          });
          const initial = new URLSearchParams(location.search).get('q');
          if (initial) {
            q.value = initial;
            search(initial);
          }
        }
      })
      .catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
