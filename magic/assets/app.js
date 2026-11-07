(() => {
  const $ = (s) => document.querySelector(s);
  const B = '/magic';
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
  let DB = null;
  const q = $('#q');
  if (!q) return;
  q.addEventListener('input', () => {
    if (!DB) return;
    const t = norm(q.value.trim());
    const box = $('#resultados');
    if (t.length < 2) { box.classList.remove('on'); return; }
    const out = DB.filter((r) => norm(r[1]).includes(t)).slice(0, 12);
    box.innerHTML = out.map(([slug, name, type, price, img]) =>
      `<div class="res" onclick="location.href='${B}/carta/${slug}/'">
        ${img ? `<img src="${img}" alt="">` : ''}
        <span class="res-n">${name}<br><span class="res-s">${type}</span></span>
        <span class="res-p">${eur(price)}</span></div>`).join('');
    box.classList.add('on');
  });
  fetch(`${B}/data/cartas.json`).then((r) => r.json()).then((d) => { DB = d; });
})();
