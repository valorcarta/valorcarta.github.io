#!/usr/bin/env python3
"""Genera fabrica-docs/AGENTES.md y fabrica-docs/DATOS.md leyendo la máquina, no la memoria.

Regla (dueño, 14-11-2026): la documentación no se escribe a mano; se saca de las fuentes
que ya existen, para que no mienta y para que no haya dos verdades.

Fuentes:
  ~/Library/LaunchAgents/com.valorcarta*.plist  → agentes reales (label, script, horario, log)
  tools/*.py, scripts/*.mjs                     → docstring de una línea (qué hace)
  data/*.json                                  → forma del dato y quién lo escribe/lee

Salidas (no editar a mano):
  fabrica-docs/AGENTES.md
  fabrica-docs/DATOS.md

Uso:
  python3 tools/gen_docs.py            # escribe
  python3 tools/gen_docs.py --check    # exit 1 si están desactualizadas (para robustez)
"""
import glob
import io
import json
import os
import plistlib
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "fabrica-docs")
LAUNCH = os.path.expanduser("~/Library/LaunchAgents")
CAB = ("<!-- GENERADO por tools/gen_docs.py · no editar a mano · "
       "regenerar: python3 tools/gen_docs.py -->\n\n")


def titulo_doc(path, maximo=100):
    """Primera frase útil del docstring del script (sin la cabecera shebang)."""
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            texto = f.read(4000)
    except OSError:
        return "⚠ script no encontrado"
    m = re.search(r'"""(.*?)"""', texto, re.S)
    if not m:
        return os.path.basename(path)
    for linea in m.group(1).splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#"):
            return linea.rstrip(".")[:maximo]
    return os.path.basename(path)


def horario(d):
    cal = d.get("StartCalendarInterval")
    if isinstance(cal, dict):
        cal = [cal]
    if cal:
        partes = []
        for c in cal:
            h, m = c.get("Hour"), c.get("Minute", 0)
            partes.append(f"{h:02d}:{m:02d}" if isinstance(h, int) else str(c))
        return ", ".join(partes)
    if d.get("StartInterval"):
        seg = d["StartInterval"]
        return f"cada {seg // 3600} h" if seg >= 3600 else f"cada {seg // 60} min"
    if d.get("KeepAlive"):
        return "siempre"
    return "—"


def _ruta_corta(ruta):
    """Rutas del repo, relativas; lo que vive fuera del repo, con ~ para no ser ilegible."""
    home = os.path.expanduser("~")
    if ruta.startswith(ROOT + os.sep):
        return os.path.relpath(ruta, ROOT)
    if ruta.startswith(home + os.sep):
        return "~/" + os.path.relpath(ruta, home)
    return ruta


def comando_agente(label, salida):
    if salida:
        return f"`tail -3 {_ruta_corta(salida)}`"
    return f"`launchctl print gui/501/{label} | grep state`"


def agentes():
    filas = []
    for ruta in sorted(glob.glob(os.path.join(LAUNCH, "com.valorcarta*.plist"))):
        if ruta.endswith(".bak") or ".bak-" in ruta:
            continue
        try:
            d = plistlib.load(open(ruta, "rb"))
        except Exception:
            continue
        label = d.get("Label") or os.path.basename(ruta).replace(".plist", "")
        args = d.get("ProgramArguments") or []
        script = ""
        for a in args[1:]:
            if isinstance(a, str) and a.endswith((".py", ".sh", ".mjs")):
                script = a
                break
        if not script and args:
            script = args[0]
        extra_args = ""
        if script.endswith("valorcarta_bot.py"):
            resto = [a for a in args[1:] if isinstance(a, str) and a.startswith("--")]
            if resto:
                extra_args = " " + " ".join(resto)
        rel = (os.path.relpath(script, ROOT) if script.startswith(ROOT) else script) + extra_args
        existe = os.path.exists(script) if script else False
        que = titulo_doc(script) if existe else "⚠ script no encontrado"
        salida = d.get("StandardOutPath")
        filas.append({
            "label": label.replace("com.valorcarta.", ""),
            "fulllabel": label,
            "script": rel,
            "cuando": horario(d),
            "que": que,
            "comprobar": comando_agente(label, salida),
        })
    return filas


def _quien(patron, extensiones):
    """Qué ficheros del proyecto mencionan este nombre (escritores/lectores posibles)."""
    golpe = []
    for ext in extensiones:
        for ruta in glob.glob(os.path.join(ROOT, "tools", "*" + ext)) + \
                    glob.glob(os.path.join(ROOT, "scripts", "*" + ext)):
            try:
                with open(ruta, encoding="utf-8", errors="ignore") as f:
                    if patron in f.read():
                        golpe.append(os.path.basename(ruta))
            except OSError:
                continue
    return sorted(golpe)


def forma_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError) as e:
        return f"no se pudo leer ({type(e).__name__})"
    if isinstance(d, dict):
        claves = list(d)[:6]
        extra = " …" if len(d) > 6 else ""
        return f"objeto · {', '.join(claves)}{extra}"
    if isinstance(d, list):
        if not d:
            return "lista vacía"
        primero = d[0]
        if isinstance(primero, dict):
            return f"lista de {len(d)} · campos: {', '.join(list(primero)[:6])}"
        return f"lista de {len(d)}"
    return type(d).__name__


def datos():
    filas = []
    for ruta in sorted(glob.glob(os.path.join(ROOT, "data", "*.json"))):
        nombre = os.path.basename(ruta)
        escritores = _quien(nombre, (".py", ".mjs"))
        bytes_ = os.path.getsize(ruta)
        kb = bytes_ // 1024
        filas.append({
            "nombre": nombre,
            "forma": forma_json(ruta),
            "peso": f"{bytes_} B" if bytes_ < 1024 else (f"{kb} KB" if kb < 1024 else f"{kb / 1024:.1f} MB"),
            "toca": ", ".join(escritores[:3]) + (" …" if len(escritores) > 3 else "") or "sin referencias",
        })
    return filas


def escribe_agentes(filas, ahora):
    lineas = [CAB, "# Agentes de la fábrica — qué corre, cuándo y cómo comprobarlo\n",
              f"Generado: {ahora} · {len(filas)} agentes en ~/Library/LaunchAgents "
              "(solo com.valorcarta*). Cada fila está sacada del plist, no del recuerdo.\n",
              "| agente | cuándo | qué hace | comprobar |",
              "|---|---|---|---|"]
    for f in filas:
        que = f["que"].replace("|", "/")
        lineas.append(f"| `{f['label']}` | {f['cuando']} | {que} | {f['comprobar']} |")
    lineas += ["",
               "Reglas de esta página: si un agente no está aquí, no corre. "
               "Un plist con el script borrado sale como ⚠ y es un fallo, no una nota.",
               "Regenerar: `python3 tools/gen_docs.py`. Comprobar uno a uno: "
               "`launchctl print gui/501/<label> | grep -E \"state|pid\"`.",
               ""]
    return "\n".join(lineas)


def escribe_datos(filas, ahora):
    lineas = [CAB, "# Datos de la fábrica — qué hay, qué forma tiene y quién lo toca\n",
              f"Generado: {ahora} · {len(filas)} ficheros JSON en data/. "
              "La forma sale de abrir el fichero, no de suponerla.\n",
              "| fichero | forma | peso | lo tocan |",
              "|---|---|---|---|"]
    for f in filas:
        lineas.append(f"| `{f['nombre']}` | {f['forma'].replace('|', '/')} | {f['peso']} | {f['toca'].replace('|', '/')} |")
    lineas += ["",
               "Datos grandes (catálogo, precios) se rehacen por turnos; si un fichero "
               "no tiene quien lo toque, o está muerto o lo escribe un agente de fuera "
               "del repo: comprobarlo antes de fiarse.",
               "Regenerar: `python3 tools/gen_docs.py`.",
               ""]
    return "\n".join(lineas)


def main():
    check = "--check" in sys.argv
    ahora = __import__("datetime").date.today().isoformat()
    os.makedirs(DOCS, exist_ok=True)
    ag = escribe_agentes(agentes(), ahora)
    da = escribe_datos(datos(), ahora)
    salidas = {"AGENTES.md": ag, "DATOS.md": da}
    desfase = []
    for nombre, contenido in salidas.items():
        ruta = os.path.join(DOCS, nombre)
        anterior = ""
        if os.path.exists(ruta):
            anterior = open(ruta, encoding="utf-8").read()
        if anterior != contenido:
            desfase.append(nombre)
            if not check:
                with open(ruta, "w", encoding="utf-8") as f:
                    f.write(contenido)
    if check:
        if desfase:
            print("fábrica-docs desactualizada:", ", ".join(desfase))
            print("arreglar: python3 tools/gen_docs.py")
            return 1
        print("fábrica-docs al día")
        return 0
    print("escrito:", ", ".join(salidas), "· actualizado:", ", ".join(desfase) or "sin cambios")
    return 0


if __name__ == "__main__":
    sys.exit(main())
