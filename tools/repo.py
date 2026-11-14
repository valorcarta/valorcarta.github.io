#!/usr/bin/env python3
"""Agente repo: deja el repositorio apañado y deja acta. 0 tokens, solo comprobaciones.

Qué hace (solo lo reversible):
  1. Mide el repo: rama, desalineación con origin, tamaño de .git, ficheros sin seguimiento,
     basura versionada, ficheros grandes, ramas viejas, secretos y salud de fabrica-docs.
  2. Arregla lo que no necesita permiso: regenera fabrica-docs, limpia basura NO versionada
     dentro del repo (__pycache__, .DS_Store, *.pyc) y añade patrones que falten al .gitignore.
  3. Comitea y empuja SOLO lo que ha tocado (fabrica-docs/ y .gitignore). Nunca force-push,
     nunca borra ramas, nunca reescribe historia, nunca toca nada fuera del repo.
  4. Escribe dinero/REPO.md (acta) y deja en dinero/decisiones/pendientes.json las decisiones
     que necesita el dueño, con fecha y disparo, para que salgan a las 07:30.

Uso:
  python3 tools/repo.py                 # comprueba, arregla lo seguro y deja acta
  python3 tools/repo.py --sin-arreglar   # solo informa (no escribe ni comitea)
"""
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIN = os.path.join(ROOT, "dinero")
ACTA = os.path.join(DIN, "REPO.md")
LOG = os.path.join(DIN, "logs-repo.log")
PEND = os.path.join(DIN, "decisiones", "pendientes.json")
PATRONES_BASURA = ("__pycache__", ".DS_Store", ".pyc")
LIMITE_GRANDE = 3 * 1024 * 1024
SECRETOS = re.compile(r"(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|"
                      r"-----BEGIN [A-Z ]*PRIVATE KEY-----|ELEVENLABS_API_KEY\s*=\s*[A-Za-z0-9]{8,})")
IGNORAR_YA = (".DS_Store", "__pycache__/", "*.pyc")


def log(msg):
    linea = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}"
    print(linea)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(linea + "\n")
    except OSError:
        pass


def git(*args, timeout=90):
    try:
        r = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True,
                           text=True, timeout=timeout)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except subprocess.TimeoutExpired:
        return 124, "", "git tardó demasiado"
    except OSError as e:
        return 127, "", str(e)


def lineas(salida):
    return [x for x in salida.splitlines() if x.strip()]


def mide():
    m = {}
    m["rama"] = git("rev-parse", "--abbrev-ref", "HEAD")[1] or "?"
    m["head"] = git("log", "--oneline", "-1")[1] or "?"
    git("fetch", "-q", "origin", "main", timeout=60)
    _, delante, _ = git("rev-list", "--count", "origin/main..HEAD")
    _, detras, _ = git("rev-list", "--count", "HEAD..origin/main")
    m["delante"], m["detras"] = delante or "0", detras or "0"
    m["sin_seguir"] = lineas(git("status", "--porcelain")[1])
    m["sin_seguir"] = [x for x in m["sin_seguir"] if x.startswith("??")]
    m["basura"] = [x[3:] for x in m["sin_seguir"]
                   if any(p in x for p in PATRONES_BASURA)]
    m["torcidos"] = [x for x in lineas(git("status", "--porcelain")[1]) if not x.startswith("??")]
    try:
        m["git_mb"] = round(int(subprocess.run(["du", "-sk", os.path.join(ROOT, ".git")],
                                               capture_output=True, text=True).stdout.split()[0]) / 1024)
    except (OSError, ValueError, IndexError):
        m["git_mb"] = 0
    m["versionados"] = len(lineas(git("ls-files")[1]))
    m["cache"] = len(lineas(git("ls-files", "data/cache")[1]))
    m["ramas"] = [b.lstrip("* ").strip() for b in lineas(git("branch")[1])
                  if not b.startswith("*")]
    grandes = []
    for ruta in lineas(git("ls-files")[1]):
        try:
            if os.path.getsize(os.path.join(ROOT, ruta)) > LIMITE_GRANDE:
                grandes.append(ruta)
        except OSError:
            continue
    m["grandes"] = grandes[:10]
    secretos = []
    for ruta in lineas(git("ls-files")[1]):
        if not ruta.lower().endswith((".py", ".json", ".env", ".sh", ".mjs", ".md", ".txt")):
            continue
        try:
            with open(os.path.join(ROOT, ruta), encoding="utf-8", errors="ignore") as f:
                if SECRETOS.search(f.read()):
                    secretos.append(ruta)
        except OSError:
            continue
    m["secretos"] = secretos
    return m


def docs_al_dia():
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "gen_docs.py"), "--check"],
                       cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0, (r.stdout or "").strip()


def arregla():
    hechos = []
    # 1) fabrica-docs al día
    ok, _ = docs_al_dia()
    if not ok:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "gen_docs.py")],
                       cwd=ROOT, capture_output=True, text=True)
        if docs_al_dia()[0]:
            hechos.append("fabrica-docs regenerada")
    # 2) basura generada dentro del repo (__pycache__, .DS_Store, *.pyc): se borra sin miedo
    import shutil
    borrados = 0
    for base, carpetas, ficheros in os.walk(ROOT):
        if ".git" in base.split(os.sep):
            carpetas[:] = []
            continue
        if os.path.basename(base) == "__pycache__":
            shutil.rmtree(base, ignore_errors=True)
            carpetas[:] = []
            borrados += 1
            continue
        for nombre in ficheros:
            if nombre == ".DS_Store" or nombre.endswith(".pyc"):
                try:
                    os.remove(os.path.join(base, nombre))
                    borrados += 1
                except OSError:
                    pass
    if borrados:
        hechos.append(f"basura generada borrada: {borrados} (__pycache__, .DS_Store, .pyc)")
    # 3) .gitignore con lo que falte
    try:
        with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as f:
            actual = f.read()
        faltan = [p for p in (".DS_Store", "__pycache__/", "*.pyc") if p not in actual]
        if faltan:
            with open(os.path.join(ROOT, ".gitignore"), "a", encoding="utf-8") as f:
                f.write("\n# generados por herramientas (agente repo)\n" + "\n".join(faltan) + "\n")
            hechos.append("gitignore: añadidos " + ", ".join(faltan))
    except OSError:
        pass
    return hechos


def comitea_y_empuja():
    """Comitea solo fabrica-docs/ y .gitignore. Devuelve (red, lanzado, texto)."""
    _, sucio, _ = git("status", "--porcelain", "fabrica-docs", ".gitignore")
    if not sucio.strip():
        return False, False, "nada que comitear"
    if git("rev-parse", "--abbrev-ref", "HEAD")[1] != "main":
        return False, False, "no estoy en main: no comiteo desde otra rama"
    git("add", "fabrica-docs", ".gitignore")
    rc, _, err = git("commit", "-q", "-m",
                     "repo: documentación y gitignore al día (agente repo)")
    if rc != 0:
        return False, False, f"commit falló: {err[:120]}"
    _, detras, _ = git("rev-list", "--count", "HEAD..origin/main")
    if (detras or "0").strip() != "0":
        return False, True, "comiteado local, sin empujar: hay que actualizar main a mano"
    rc, _, err = git("push", "-q", "origin", "main", timeout=120)
    if rc != 0:
        return True, False, f"comiteado local, push rechazado: {err[:120]}"
    return True, True, "comiteado y empujado"


def apunta_pendientes(m, hechos):
    """Deja lo que necesita el dueño en la cola de las 07:30 (sin duplicar abiertos)."""
    try:
        with open(PEND, encoding="utf-8") as f:
            cola = json.load(f)
    except (OSError, ValueError):
        cola = {"items": []}
    items = cola.setdefault("items", [])
    abiertos = {i.get("id") for i in items if i.get("estado") != "cerrado"}
    nuevos = []
    if m["cache"] > 5000:
        nuevos.append({
            "id": "repo-cache-fuera-de-seguimiento",
            "que": f"sacar data/cache del seguimiento ({m['cache']} ficheros) y ver que el build sigue igual",
            "comando": "git rm -r --cached data/cache && git commit -m 'repo: data/cache fuera'",
            "disparo": "7 días o antes del próximo cambio grande del catálogo",
            "estado": "pendiente", "desde": time.strftime("%Y-%m-%d %H:%M"),
            "nota": "decisión del dueño; el agente repo no lo hace",
        })
    if len(m["ramas"]) >= 2:
        nuevos.append({
            "id": "repo-ramas-viejas",
            "que": f"borrar ramas locales ya fusionadas: {', '.join(m['ramas'][:6])}",
            "comando": "git branch -d <rama>   # una a una, empezando por la más vieja",
            "disparo": "14 días o al terminar la próxima tanda de datos",
            "estado": "pendiente", "desde": time.strftime("%Y-%m-%d %H:%M"),
            "nota": "decisión del dueño; el agente repo no borra ramas",
        })
    if m["git_mb"] > 800:
        nuevos.append({
            "id": "repo-historial-gordo",
            "que": f"limpiar historial: .git ocupa {m['git_mb']} MB por caches versionados",
            "comando": "git filter-repo --path data/cache --invert-paths   # luego gc y force-push de main",
            "disparo": "30 días o antes de que el clon tarde >1 min",
            "estado": "pendiente", "desde": time.strftime("%Y-%m-%d %H:%M"),
            "nota": "irreversible: lo decide el dueño",
        })
    añadidos = 0
    for n in nuevos:
        if n["id"] not in abiertos:
            items.append(n)
            añadidos += 1
    if añadidos:
        with open(PEND, "w", encoding="utf-8") as f:
            json.dump(cola, f, ensure_ascii=False, indent=1)
    return añadidos


def main():
    sin_arreglar = "--sin-arreglar" in sys.argv
    m = mide()
    hechos, red, lanzado, texto_git = [], False, False, ""
    ok_docs, aviso_docs = docs_al_dia()
    m["docs_ok"] = ok_docs
    m["docs_aviso"] = aviso_docs
    if not sin_arreglar:
        hechos = arregla()
        red, lanzado, texto_git = comitea_y_empuja()
        añadidos = apunta_pendientes(m, hechos)
        if añadidos:
            hechos.append(f"pendientes nuevos para el dueño: {añadidos}")
    else:
        añadidos = 0

    lineas_acta = [
        "# Estado del repositorio",
        "",
        f"Comprobado: {time.strftime('%Y-%m-%d %H:%M')} · rama `{m['rama']}` · HEAD `{m['head']}`",
        "",
        "## Medidas",
        "",
        f"- Sin seguimiento: {len(m['sin_seguir'])} ficheros · de ellos basura: {len(m['basura'])}",
        f"- Versionados: {m['versionados']} · de data/cache: {m['cache']} · .git: {m['git_mb']} MB",
        f"- Commits por delante de origin/main: {m['delante']} · por detrás: {m['detras']}",
        f"- Ramas locales aparte de main: {len(m['ramas'])} ({', '.join(m['ramas'][:6]) or '—'})",
        f"- Ficheros versionados >3 MB: {len(m['grandes'])}",
        f"- Ficheros versionados con pinta de secreto: {len(m['secretos'])}",
        f"- fabrica-docs: {'al día' if m['docs_ok'] else 'DESACTUALIZADA — ' + m['docs_aviso']}",
        "",
        "## Lo que ha hecho este pase",
        "",
    ]
    lineas_acta += [f"- {h}" for h in hechos] or ["- Nada que arreglar."]
    if texto_git:
        lineas_acta.append(f"- git: {texto_git}")
    if m["grandes"]:
        lineas_acta += ["", "## Ficheros grandes versionados (no se tocan)", ""]
        lineas_acta += [f"- `{g}`" for g in m["grandes"]]
    if m["secretos"]:
        lineas_acta += ["", "## Posibles secretos versionados (revisar a mano)", ""]
        lineas_acta += [f"- `{s}`" for s in m["secretos"][:10]]
    lineas_acta += ["", "## Lo que necesita al dueño (va también a pendientes)", ""]
    lineas_acta += ["- ver `dinero/decisiones/pendientes.json` (salen a las 07:30)"] if añadidos else \
                   ["- nada nuevo este pase"]
    if not sin_arreglar:
        try:
            with open(ACTA, "w", encoding="utf-8") as f:
                f.write("\n".join(lineas_acta) + "\n")
        except OSError as e:
            log(f"no pude escribir el acta: {e}")

    log(f"repo: {len(m['sin_seguir'])} sin seguimiento · {m['cache']} cache versionados · "
        f".git {m['git_mb']} MB · {len(m['ramas'])} ramas viejas · "
        f"secretos {len(m['secretos'])} · docs {'ok' if m['docs_ok'] else 'viejas'} · "
        f"hechos {len(hechos)} · git {texto_git or 'sin cambios'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
