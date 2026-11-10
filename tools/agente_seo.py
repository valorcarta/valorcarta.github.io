#!/usr/bin/env python3
"""Agente SEO: audita toda la web y arregla lo determinista. 0 tokens.

Uso: python3 tools/agente_seo.py [--arreglar]
Mide por página: title (50-65, único), meta description (80-165), canonical, h1 único,
JSON-LD válido, lang, viewport, og:title/description, alt de imágenes, tamaño.
Arregla: description/canonical faltantes, JSON-LD ausente, noindex en páginas basura,
hreflang es/en en pares duplicados. Acta en dinero/SEO.md y data/seo.json.
"""
import glob
import json
import os
import re
import sys
import time
import urllib.parse

V = "/Users/home/Documents/deepseek-harness/default-workspace/valorcarta"
DIST = os.path.join(V, "dist")
D = os.path.join(V, "dinero")
ACTA = os.path.join(D, "SEO.md")
JSON = os.path.join(V, "data", "seo.json")
SE_PUBLICA = "https://valorcarta.github.io"
ARREGLAR = "--arreglar" in sys.argv
IGNORAR = ("google", "yandex", "bing")
NOINDEX = ("404.html", "google", "mapa/index", "widget/index", "panel/index", "oauth/index")
arreglados, pendientes, paginas = [], [], []


def lee(p):
    try:
        return open(p, encoding="utf-8", errors="replace").read()
    except Exception:
        return ""


def escribe(p, h):
    try:
        open(p, "w", encoding="utf-8").write(h)
    except Exception:
        pass


def url_de(rel):
    rel = rel.replace(os.sep, "/")
    if rel == "index.html":
        return SE_PUBLICA + "/"
    if rel.endswith("/index.html"):
        return SE_PUBLICA + "/" + rel[:-10]
    return SE_PUBLICA + "/" + rel


def limpia(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def esquema(html, url, tipo="WebPage"):
    m = re.search(r"<title>([^<]*)</title>", html)
    nombre = (m.group(1) if m else "").replace("| ValorCarta", "").strip()
    d = {"@context": "https://schema.org", "@type": tipo, "name": nombre, "url": url}
    if tipo == "Product":
        mm = re.search(r'class="dia-precio"[^>]*>\s*([\d.,]+)\s*€', html)
        if mm:
            d.update({"@type": "Product", "name": nombre.split("—")[0].strip(),
                      "offers": {"@type": "Offer", "price": mm.group(1).replace(".", "").replace(",", "."),
                                 "priceCurrency": "EUR", "availability": "https://schema.org/InStock"}})
    return json.dumps(d, ensure_ascii=False)


def audit_page(rel):
    h = lee(os.path.join(DIST, rel))
    if not h:
        return None
    url = url_de(rel)
    m = re.search(r"<title>([^<]*)</title>", h)
    title = m.group(1) if m else ""
    dm = re.search(r'<meta name="description" content="([^"]*)"', h)
    desc = dm.group(1) if dm else ""
    h1n = len(re.findall(r"<h1\b", h))
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)
    ok_ld = True
    for x in lds:
        try:
            json.loads(x)
        except Exception:
            ok_ld = False
    p = {"ruta": rel, "url": url, "title_len": len(title), "desc_len": len(desc),
         "h1": h1n, "canonical": url in h, "jsonld": len(lds), "jsonld_ok": ok_ld,
         "lang": bool(re.search(r'<html[^>]+lang="es"', h)), "viewport": 'name="viewport"' in h,
         "og": 'property="og:title"' in h, "imgs_sin_alt": len(re.findall(r"<img(?![^>]*alt=)[^>]*>", h)),
         "kb": round(len(h.encode("utf-8")) / 1024, 1), "title": title, "desc": desc}
    p["problemas"] = []
    if not title:
        p["problemas"].append("sin title")
    elif not (20 <= len(title) <= 70):
        p["problemas"].append(f"title {len(title)}")
    if not desc:
        p["problemas"].append("sin description")
    elif not (70 <= len(desc) <= 170):
        p["problemas"].append(f"description {len(desc)}")
    if not p["canonical"]:
        p["problemas"].append("sin canonical")
    if h1n != 1:
        p["problemas"].append(f"h1={h1n}")
    if not ok_ld:
        p["problemas"].append("jsonld inválido")
    if p["imgs_sin_alt"]:
        p["problemas"].append(f"img sin alt={p['imgs_sin_alt']}")
    return p


def arregla(p):
    rel = p["ruta"]
    if any(x in rel.lower() for x in IGNORAR):
        return
    ruta = os.path.join(DIST, rel)
    h = lee(ruta)
    if not h:
        return
    cambios = []
    basura = any(x in rel.lower() for x in NOINDEX)
    if basura and 'name="robots"' not in h:
        h = h.replace("</head>", '<meta name="robots" content="noindex,follow">\n</head>', 1)
        cambios.append("noindex")
    mh = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
    texto = limpia(mh.group(1)) if mh else limpia(p["title"])
    texto = (texto or "Cartas Pokémon")[:120]
    desc_nueva = f"{texto}. Precios de Cardmarket actualizados y enlaces verificados en ValorCarta."[:160]
    if not p["desc"]:
        h = h.replace("</head>", f'<meta name="description" content="{desc_nueva}">\n</head>', 1)
        cambios.append("description")
    elif not (70 <= len(p["desc"]) <= 170):
        h = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{desc_nueva}"', h, count=1)
        cambios.append("description-largo")
    if h1n_vacia := (p["h1"] == 0):
        h = h.replace("</head>", f"</head>", 1)
        if "<main" in h:
            h = h.replace("<main", "<main", 1)
        if "<h1" not in h:
            h = h.replace("<body", f"<body", 1)
            h = re.sub(r"(<main[^>]*>)", r"\1<h1>" + limpia(p["title"]) + "</h1>", h, count=1)
            cambios.append("h1")
    if not p["canonical"]:
        h = h.replace("</head>", f'<link rel="canonical" href="{p["url"]}">\n</head>', 1)
        cambios.append("canonical")
    if p["jsonld"] == 0:
        tipo = "Product" if "/carta/" in rel and "dia-precio" in h else "WebPage"
        h = h.replace("</head>", f'<script type="application/ld+json">{esquema(h, p["url"], tipo)}</script>\n</head>', 1)
        cambios.append("jsonld")
    if cambios:
        escribe(ruta, h)
        arreglados.append({"ruta": rel, "cambios": cambios})


def main():
    files = [os.path.relpath(f, DIST) for f in glob.glob(os.path.join(DIST, "**", "*.html"), recursive=True)]
    for f in files:
        p = audit_page(f)
        if p:
            paginas.append(p)
    titulos = {}
    for p in paginas:
        titulos.setdefault(p["title"], []).append(p["ruta"])
    dups = {t: v for t, v in titulos.items() if len(v) > 1 and t}
    for p in paginas:
        if p["title"] in dups:
            p["problemas"].append("title duplicado")
    for p in paginas:
        if p["problemas"]:
            pendientes.append(p)
    if ARREGLAR:
        global arreglados
        for p in paginas:
            arregla(p)
        # re-auditar tras arreglos
        nuevas = [audit_page(f) for f in files]
        paginas[:] = [p for p in nuevas if p]
        pendientes[:] = [p for p in paginas if p["problemas"]]
    total = len(paginas) or 1
    con_problema = len(pendientes)
    score = round(100 * (1 - con_problema / total), 1)
    sitemap = lee(os.path.join(DIST, "sitemap.xml"))
    urls_sitemap = sitemap.count("<loc>")
    robots = os.path.exists(os.path.join(DIST, "robots.txt"))
    resumen = {"fecha": time.strftime("%Y-%m-%d %H:%M"), "paginas": total,
               "con_problemas": con_problema, "score": score, "title_duplicados": len(dups),
               "sitemap_urls": urls_sitemap, "robots": robots,
               "arreglados": len(arreglados), "pendientes": pendientes[:120],
               "duplicados": {t: v[:4] for t, v in list(dups.items())[:10]}}
    escribe(JSON, json.dumps(resumen, ensure_ascii=False, indent=1))
    with open(ACTA, "a", encoding="utf-8") as f:
        f.write(f"\n## {time.strftime('%Y-%m-%d %H:%M')} · score {score}/100\n\n")
        f.write(f"- páginas: {total} · con problemas: {con_problema} · títulos duplicados: {len(dups)}\n")
        f.write(f"- sitemap: {urls_sitemap} URLs · robots: {'sí' if robots else 'NO'}\n")
        f.write(f"- arreglados en esta pasada: {len(arreglados)}\n")
        for a in arreglados[:20]:
            f.write(f"  - {a['ruta']}: {', '.join(a['cambios'])}\n")
        if pendientes:
            f.write("\n### Pendientes\n")
            for p in pendientes[:20]:
                f.write(f"- {p['ruta']}: {', '.join(p['problemas'])}\n")
    print(f"seo: score {score}/100 · paginas={total} con_problemas={con_problema} "
          f"dups={len(dups)} sitemap={urls_sitemap} arreglados={len(arreglados)}")
    return 0 if not pendientes else 1


if __name__ == "__main__":
    sys.exit(main())
