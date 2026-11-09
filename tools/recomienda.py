#!/usr/bin/env python3
"""Recomendador de producto: unos productos llevan a otros, como Amazon. 0 tokens.

Uso: python3 tools/recomienda.py
Lee data/productos.json (packs), data/productos-extra.json (fundas/álbum) y
data/productos-verificados.json (disponibilidad real). Escribe
data/recomendaciones.json con 3 relacionados por ASIN y su motivo.
El build solo pinta lo que hay aquí: si un producto no está disponible, no entra.
"""
import json, os, time

V = "/Users/home/Documents/deepseek-harness/default-workspace/valorcarta"
D = os.path.join(V, "data")


def lee(n, defecto):
    try:
        with open(os.path.join(D, n), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


productos = lee("productos.json", [])
extra = (lee("productos-extra.json", {}) or {}).get("productos") or []
ver = (lee("productos-verificados.json", {}) or {}).get("productos") or {}
disp = {a for a, v in ver.items() if v.get("disponible")}
catalogo = [p for p in (productos + extra) if p.get("asin") in disp]

packs = [p for p in catalogo if p.get("tipo") not in ("funda", "toploader", "album")]
prote = [p for p in catalogo if p.get("tipo") in ("funda", "toploader", "album")]


def precio(p):
    try:
        return float(p.get("precio") or 0)
    except Exception:
        return 0.0


def elige(lista, excluir, n):
    return [p for p in lista if p.get("asin") != excluir][:n]


recos = {}
for p in catalogo:
    asin = p["asin"]
    tipo = p.get("tipo")
    if tipo in ("funda", "toploader", "album"):
        otros = elige(prote, asin, 2)
        compra = elige(sorted(packs, key=precio), asin, 1)
        items = [{"asin": o["asin"], "motivo": "Para la carta que vas a guardar" if i == 0 else "El siguiente nivel de protección"}
                 for i, o in enumerate(otros)]
        items += [{"asin": c["asin"], "motivo": "El sobre que vas a proteger"} for c in compra]
    else:
        protege = elige(sorted(prote, key=precio), asin, 2)
        otros = elige(sorted(packs, key=lambda x: abs(precio(x) - precio(p))), asin, 1)
        items = [{"asin": o["asin"], "motivo": "Protege lo que compras" if i == 0 else "Para no doblar esquinas"}
                 for i, o in enumerate(protege)]
        items += [{"asin": o["asin"], "motivo": "Mismo formato, precio parecido"} for o in otros]
    recos[asin] = items[:3]

# Sugerencias para fichas de carta: los 4 productos que sí se venden (protección + pack top)
preferidos = ["B0BMGR3QZW", "B0G5YX5XVQ", "B078NBBQXQ", "B0HMJ88KGX", "B085DNDLC1", "B000Q5ZMM0", "B0D7W2PJR8"]
sug = [a for a in preferidos if a in disp]
if len(sug) < 4:
    for p in sorted(packs, key=precio):
        if p["asin"] not in sug:
            sug.append(p["asin"])
        if len(sug) >= 4:
            break
# Solo lo que se puede comprar de verdad ahora (In stock / últimas unidades)
estado = {a: str(v.get("estado") or "") for a, v in ver.items()}
stock = [a for a, e in estado.items() if "In stock" in e or "left in stock" in e]
reclamo = {
 "B0BMGR3QZW": ("Baraja de liga Mew VMAX", "60 cartas listas para jugar", None),
 "B0G5YX5XVQ": ("Baraja de liga Mewtwo ex", "60 cartas listas para jugar", None),
 "B078NBBQXQ": ("Mazo Ampharos ex", "Baraja de 60 cartas, sin abrir sobres", 29.0),
 "B0HMJ88KGX": ("Lata Otoño EX", "Promo asegurada dentro", 40.0),
 "B0C8YBXDYQ": ("Booster Bundle 151", "6 sobres del 151", None),
 "B0BCPRFMQH": ("Sobre Silver Tempest", "Sobre suelto para probar", None),
 "B085DNDLC1": ("Penny Sleeve · 400 fundas", "Lo primero antes de tocar la carta", 6.71),
 "B000Q5ZMM0": ("Toploader 3x4 · 25 uds.", "La esquina deja de doblarse", 8.0),
 "B0812Z3RPY": ("Toploader 3x4 · 100 uds.", "Para vender varias", 20.0),
 "B0D7W2PJR8": ("Álbum 540 cartas", "Fuera del polvo y del sol", 25.98),
}
disp_lista = []
for a in stock:
    info = next((x for x in catalogo if x["asin"] == a), None)
    nombre, motivo, precio = reclamo.get(a, (None, None, None))
    if info and info.get("nombre"):
        nombre = info["nombre"]
    if info and info.get("precio"):
        precio = float(info["precio"])
    disp_lista.append({"asin": a, "nombre": nombre or a, "precio": precio, "motivo": motivo or "",
                       "estado": estado[a]})
storage = {"B085DNDLC1", "B000Q5ZMM0", "B0812Z3RPY", "B0D7W2PJR8"}
orden = ["B0BMGR3QZW", "B0G5YX5XVQ", "B078NBBQXQ", "B0HMJ88KGX", "B0C8YBXDYQ", "B0BCPRFMQH"]
disp_lista.sort(key=lambda x: (orden.index(x["asin"]) if x["asin"] in orden else 50 + (storage and x["asin"] in storage),
                               x["precio"] or 999))

salida = {"generado": time.strftime("%Y-%m-%dT%H:%M:%S"), "fuente": "tools/recomienda.py · 0 tokens",
          "sugerencias": sug, "disponibles": disp_lista,
          "productos": [{"asin": p["asin"], "nombre": p.get("nombre"), "precio": p.get("precio")} for p in catalogo],
          "por_asin": recos}
with open(os.path.join(D, "recomendaciones.json"), "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"recomienda: {len(catalogo)} productos, {sum(len(v) for v in recos.values())} relacionados")
# rebuild 1846
