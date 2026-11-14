#!/usr/bin/env python3
"""Mantiene el volcado de datos abiertos (repo precios-cartas-datos) al día.

Motivo (14-11-2026): la web ofrece ese repo como fuente de datos, y su precios.json
seguía fechado el 3 de noviembre (11 días). Un enlace que promete "volcado diario" y
no se actualiza es una mentira de la marca: lo detecta su propio crítico como P1.

Qué hace:
  1. Lee data/cards.json (precios frescos del día, los mismos que pinta la web).
  2. Escribe precios.json con el mismo esquema de siempre (fecha, fuente, cartas, datos).
  3. Clona el repo público, comitea y empuja a master si hay cambios.

Uso:
  python3 tools/precios_abiertos.py              # actualiza y empuja
  python3 tools/precios_abiertos.py --sin-subir  # escribe el JSON y dice si cambió

0 tokens: solo ficheros y git. Si falla la red, no toca el repo remoto.
"""
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = os.path.join(ROOT, "data", "cards.json")
LOG = os.path.join(ROOT, "dinero", "logs-precios-abiertos.log")
REPO = "https://github.com/valorcarta/precios-cartas-datos.git"
FUENTE = "Cardmarket via TCGdex"


def log(msg):
    linea = f"[{datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}] {msg}"
    print(linea)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(linea + "\n")
    except OSError:
        pass


def git(*args, cwd=None, timeout=180):
    r = subprocess.run(["git"] + list(args), cwd=cwd, capture_output=True, text=True,
                       timeout=timeout)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def vuelca(cards):
    """Mismo esquema que el fichero anterior: el que lee la web y el crítico."""
    hoy = datetime.date.today().isoformat()
    datos = []
    for c in cards:
        precio = c.get("price")
        if not isinstance(precio, (int, float)) or precio <= 0:
            continue
        actual = (c.get("updated") or hoy)[:10]
        datos.append({
            "id": c.get("id"),
            "nombre": c.get("name"),
            "set": c.get("setName"),
            "precio_eur": round(float(precio), 2),
            "actualizado": actual,
        })
    datos.sort(key=lambda x: -x["precio_eur"])
    return {"fecha": hoy, "fuente": FUENTE, "cartas": len(datos), "datos": datos}


def main():
    sin_subir = "--sin-subir" in sys.argv
    try:
        with open(CARDS, encoding="utf-8") as f:
            cards = json.load(f)
    except (OSError, ValueError) as e:
        log(f"no pude leer data/cards.json: {e}")
        return 1
    salida = vuelca(cards)
    if not salida["datos"]:
        log("cards.json sin precios: no se publica nada")
        return 1
    texto = json.dumps(salida, ensure_ascii=False, separators=(",", ":"))
    log(f"volcado preparado: {salida['cartas']} cartas · fecha {salida['fecha']}")

    trabajo = tempfile.mkdtemp(prefix="precios-abiertos-")
    try:
        rc, _, err = git("clone", "--depth", "1", "--branch", "master", REPO, trabajo)
        if rc != 0:
            log(f"clon falló: {err[:160]}")
            return 1
        destino = os.path.join(trabajo, "precios.json")
        anterior = ""
        if os.path.exists(destino):
            with open(destino, encoding="utf-8") as f:
                anterior = f.read()
        if anterior.strip() == texto.strip():
            log("sin cambios: precios.json ya estaba igual")
            return 0
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
        if sin_subir:
            log("--sin-subir: fichero escrito, no se empuja")
            return 0
        git("add", "precios.json", cwd=trabajo)
        rc, _, err = git("-c", "user.name=ValorCarta",
                         "-c", "user.email=valorcarta@users.noreply.github.com",
                         "commit", "-q", "-m",
                         f"precios: {salida['fecha']} · {salida['cartas']} cartas", cwd=trabajo)
        if rc != 0:
            log(f"commit falló: {err[:160]}")
            return 1
        rc, _, err = git("push", "-q", "origin", "master", cwd=trabajo)
        if rc != 0:
            log(f"push falló: {err[:160]}")
            return 1
        log("precios.json actualizado y empujado a master")
        return 0
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
