#!/usr/bin/env python3
"""Agente compras: investiga por qué no llegan pedidos desde la web a Amazon. 0 tokens.

No adivina: mide el embudo con los informes que ya hay en data/, mira si los enlaces
llevan etiqueta y sub-ID, cuántos productos se pueden comprar de verdad, y deja acta
con las causas ordenadas por prueba. Lo que no puede saber (visitas a la web) lo dice
como NO SÉ en vez de estimarlo.

Fuentes:
  data/amazon-informes.json        clics de 30 días (panel de afiliados)
  data/amazon-csv-resumen.json     clics/pedidos/ganancias del último CSV
  data/amazon-csv/*.csv            clics por ID de seguimiento (tag)
  data/productos-verificados.json  qué se puede comprar hoy y con qué vendedor
  data/productos.json              catálogo que enlaza la web
  dist/                            HTML construido: enlaces y CTAs reales

Escribe:
  dinero/AMAZON-COMPRAS.md         acta con el embudo y las causas ordenadas
  dinero/logs-compras.log
  y deja en dinero/decisiones/pendientes.json lo que necesita al dueño

Uso: python3 tools/amazon_compras.py [--json]
"""
import glob
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIN = os.path.join(ROOT, "dinero")
ACTA = os.path.join(DIN, "AMAZON-COMPRAS.md")
LOG = os.path.join(DIN, "logs-compras.log")
PEND = os.path.join(DIN, "decisiones", "pendientes.json")
DIST = os.path.join(ROOT, "dist")


def log(msg):
    linea = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}"
    print(linea)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(linea + "\n")
    except OSError:
        pass


def lee(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def embudo():
    """Clics, pedidos y ganancias, con la ventana de fechas de cada fuente."""
    informe = lee(os.path.join(ROOT, "data", "amazon-informes.json"), {}) or {}
    resumen = lee(os.path.join(ROOT, "data", "amazon-csv-resumen.json"), {}) or {}
    csvs = sorted(glob.glob(os.path.join(ROOT, "data", "amazon-csv", "*.csv")))
    por_tag = []
    if csvs:
        try:
            with open(csvs[-1], encoding="utf-8-sig") as f:
                cabecera = None
                for linea in f:
                    campos = [c.strip() for c in linea.rstrip("\n").split(",")]
                    if cabecera is None:
                        cabecera = campos
                        continue
                    if len(campos) == len(cabecera) and campos[0]:
                        por_tag.append(dict(zip(cabecera, campos)))
        except OSError:
            por_tag = []
    return {
        "clics_30d": informe.get("clics_30d"),
        "ventana": informe.get("ventana_30d"),
        "fecha_informe": informe.get("fecha"),
        "clics_csv": num(resumen.get("clics")),
        "pedidos_csv": num(resumen.get("pedidos")),
        "ganancias_csv": num(resumen.get("ganancias")),
        "fecha_csv": resumen.get("fecha"),
        "csv": os.path.basename(csvs[-1]) if csvs else None,
        "por_tag": por_tag,
        "fuente_informe": informe.get("fuente"),
    }


def pagina_embudo(e):
    clics = e["clics_30d"] or e["clics_csv"]
    pedidos = e["pedidos_csv"]
    ganancias = e["ganancias_csv"]
    filas = []
    if clics:
        filas.append(("clics", f"{int(clics)}", e["ventana"] or e["fecha_csv"] or "?"))
    if pedidos is not None:
        filas.append(("pedidos", f"{int(pedidos)}", e["fecha_csv"] or "?"))
    if ganancias is not None:
        filas.append(("ganancias", f"{ganancias:.2f} €", e["fecha_csv"] or "?"))
    if e["clics_csv"] and pedidos is not None:
        filas.append(("conversión", f"{100 * pedidos / e['clics_csv']:.1f} %",
                      "pedidos / clics del mismo CSV (no se mezclan ventanas)"))
    return filas


def atribucion(e):
    """Cuántos clics van con nuestra etiqueta y cuántos se quedan en 'Other'."""
    total, otros, detalle = 0.0, 0.0, []
    for fila in e["por_tag"]:
        tag = fila.get("ID de seguimiento", "?")
        clics = num(fila.get("clics"))
        if clics is None:
            continue
        total += clics
        if tag.strip().lower() in ("other", "otros"):
            otros += clics
        detalle.append((tag, clics))
    return total, otros, detalle


def catalogo():
    ver = (lee(os.path.join(ROOT, "data", "productos-verificados.json"), {}) or {}).get("productos", {})
    cat = lee(os.path.join(ROOT, "data", "productos.json"), []) or []
    disponibles = [a for a, v in ver.items() if v.get("disponible")]
    terceros = [a for a, v in ver.items()
                if v.get("disponible") and (v.get("vendedor") or "").strip()
                and "amazon" not in (v.get("vendedor") or "").lower()]
    return {
        "catalogo": len(cat),
        "verificados": len(ver),
        "disponibles": len(disponibles),
        "no_disponibles": len(ver) - len(disponibles),
        "con_terceros": len(terceros),
        "muestra_terceros": [
            (a, (ver[a].get("titulo") or "")[:44], (ver[a].get("vendedor") or "")[:34])
            for a in terceros[:5]],
    }


def enlaces():
    """Todo enlace de Amazon que la web construida pone, con y sin etiqueta/sub-ID."""
    if not os.path.isdir(DIST):
        return None
    total = con_tag = con_sub = sin_tag = 0
    for ruta in glob.glob(os.path.join(DIST, "**", "index.html"), recursive=True):
        try:
            with open(ruta, encoding="utf-8", errors="ignore") as f:
                html = f.read()
        except OSError:
            continue
        for m in re.finditer(r'href="(https://www\.amazon\.es/[^"]+)"', html):
            url = m.group(1)
            total += 1
            if "tag=" in url:
                con_tag += 1
            else:
                sin_tag += 1
            if "ascsubtag=" in url:
                con_sub += 1
    return {"total": total, "con_tag": con_tag, "sin_tag": sin_tag, "con_sub": con_sub}


def mide():
    e = embudo()
    a_total, a_otros, a_detalle = atribucion(e)
    return {"embudo": e, "atribucion": {"total": a_total, "otros": a_otros, "detalle": a_detalle},
            "catalogo": catalogo(), "enlaces": enlaces()}


def acta(m, añadidos):
    e, at, cat, enl = m["embudo"], m["atribucion"], m["catalogo"], m["enlaces"]
    lineas = [
        "# Por qué no llegan pedidos de Amazon",
        "",
        f"Comprobado: {time.strftime('%Y-%m-%d %H:%M')} · datos del panel de afiliados y del catálogo local.",
        "",
        "## Embudo (solo con números con fuente)",
        "",
        "| escalón | valor | fuente |",
        "|---|---|---|",
    ]
    for nombre, valor, fuente in pagina_embudo(e):
        lineas.append(f"| {nombre} | {valor} | {fuente} |")
    lineas += ["", f"- Panel: {e['fuente_informe'] or 'sin fuente'} · CSV: `{e['csv'] or '—'}`", ""]

    lineas += ["## Las causas, ordenadas por prueba", ""]
    if at["total"]:
        pct = 100 * at["otros"] / at["total"]
        lineas.append(
            f"1. **Atribución rota**: {int(at['otros'])} de {int(at['total'])} clics "
            f"({pct:.0f} %) caen en «Other», no en `valorcarta-21`. Sin etiqueta no se sabe "
            f"qué sitio ni qué pieza vende, así que no se puede optimizar nada. "
            f"(fuente: {e['csv']})")
    else:
        lineas.append("1. **Atribución**: sin CSV de seguimiento legible hoy: NO SÉ qué clics van con etiqueta.")
    lineas.append(
        f"2. **Catálogo a medias**: {cat['no_disponibles']} de {cat['verificados']} productos "
        f"verificados no se pueden comprar (sin stock o solo por invitación); solo "
        f"{cat['disponibles']} están a la venta. Cada CTA de un producto agotado es una compra perdida. "
        f"(fuente: data/productos-verificados.json)")
    if cat["con_terceros"]:
        lineas.append(
            f"   - De los disponibles, {cat['con_terceros']} los vende un tercero (posibles gastos "
            f"de envío): " + "; ".join(f"{n} → {v}" for _, n, v in cat["muestra_terceros"][:4]))
    if enl is not None:
        lineas.append(
            f"3. **Enlaces**: {enl['total']} enlaces de Amazon en la web construida · con tag: "
            f"{enl['con_tag']} · sin tag: {enl['sin_tag']} · con sub-ID: {enl['con_sub']}. "
            f"(fuente: dist/)")
    else:
        lineas.append("3. **Enlaces**: no hay `dist/` construido: NO SE PUEDE comprobar qué se enlaza.")
    lineas.append(
        "4. **Sin denominador de visitas**: no hay visitas fiables (GoatCounter sin token), "
        "así que no se puede separar «poca gente» de «mala conversión». NO SÉ.")
    lineas.append(
        "5. **Riesgo de programa**: si de verdad hay 0 pedidos en 30 días con ~186 clics, "
        "el plan de afiliados exige ventas periódicas para no cerrar la cuenta; hay que "
        "confirmar la regla vigente en el panel de afiliados antes de afirmarla.")
    lineas += ["", "## Qué haría primero (una sola, la de más impacto)", ""]
    lineas.append(
        "Separar el ID de seguimiento por colocación (web / pin / producto) y arreglar el "
        "hueco de «Other»: sin atribución, cualquier cambio en la web es a ciegas. "
        "Después, sacar de la web los productos que hoy no se pueden comprar.")
    if añadidos:
        lineas += ["", f"Pendientes nuevos para el dueño en `dinero/decisiones/pendientes.json`: {añadidos}"]
    return "\n".join(lineas) + "\n"


def apunta(m):
    """Deja en la cola lo que necesita decisión del dueño, sin duplicar abiertos."""
    cola = lee(PEND, {}) or {}
    items = cola.setdefault("items", [])
    abiertos = {i.get("id") for i in items if i.get("estado") != "cerrado"}
    nuevos = []
    cat, at = m["catalogo"], m["atribucion"]
    if cat["no_disponibles"] > 0:
        nuevos.append({
            "id": "amazon-sacar-productos-sin-stock",
            "que": f"dejar fuera de la web los {cat['no_disponibles']} productos verificados sin stock "
                   "(el agente de compras ya los cuenta; la web debería no pintarlos)",
            "comando": "python3 tools/amazon_vigia.py && PATH=\"/opt/homebrew/opt/node@22/bin:$PATH\" node scripts/build.mjs",
            "disparo": "7 días o tras la próxima pasada del vigilante",
            "estado": "pendiente", "desde": time.strftime("%Y-%m-%d %H:%M"),
            "nota": "cambio visible en la web: lo decide el dueño",
        })
    if at["total"] and at["otros"] / at["total"] > 0.3:
        nuevos.append({
            "id": "amazon-atribucion-other",
            "que": f"{int(at['otros'])} clics ({100 * at['otros'] / at['total']:.0f} %) caen en «Other»: "
                   "revisar qué enlaces no llevan tag=valorcarta-21 y separar sub-ID por colocación",
            "comando": "grep -roh 'amazon.es/[^\"]*' dist | grep -vc 'tag=valorcarta-21'",
            "disparo": "3 días o al siguiente informe de afiliados",
            "estado": "pendiente", "desde": time.strftime("%Y-%m-%d %H:%M"),
            "nota": "mientras tanto, cualquier optimización es a ciegas",
        })
    nuevos.append({
        "id": "amazon-visitas-fuente",
        "que": "sin visitas fiables no se puede calcular conversión real (visitas → clics → pedidos)",
        "comando": "python3 tools/visitas.py   # o activar token de GoatCounter",
        "disparo": "14 días",
        "estado": "pendiente", "desde": time.strftime("%Y-%m-%d %H:%M"),
        "nota": "sin denominador, la conversión es NO SÉ",
    })
    añadidos = 0
    for n in nuevos:
        if n["id"] not in abiertos:
            items.append(n)
            añadidos += 1
    if añadidos:
        try:
            with open(PEND, "w", encoding="utf-8") as f:
                json.dump(cola, f, ensure_ascii=False, indent=1)
        except OSError:
            return 0
    return añadidos


def main():
    m = mide()
    añadidos = apunta(m)
    texto = acta(m, añadidos)
    try:
        with open(ACTA, "w", encoding="utf-8") as f:
            f.write(texto)
    except OSError as e:
        log(f"no pude escribir el acta: {e}")
    if "--json" in sys.argv:
        print(json.dumps({"embudo": m["embudo"], "atribucion": m["atribucion"],
                          "catalogo": m["catalogo"], "enlaces": m["enlaces"]},
                         ensure_ascii=False, indent=1, default=str))
    e = m["embudo"]
    log(f"compras: clics {e['clics_30d'] or e['clics_csv']} · pedidos {e['pedidos_csv']} · "
        f"«Other» {int(m['atribucion']['otros'])}/{int(m['atribucion']['total'])} · "
        f"disponibles {m['catalogo']['disponibles']}/{m['catalogo']['verificados']} · "
        f"enlaces con tag {m['enlaces']['con_tag'] if m['enlaces'] else '?'} · pendientes nuevos {añadidos}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
