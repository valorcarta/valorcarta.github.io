# Runbook — comandos probados

Todos los comandos de esta página se han ejecutado al menos una vez y han funcionado en
este Mac. **Se lanzan desde la raíz del repo** (`~/Documents/deepseek-harness/default-workspace/valorcarta`),
salvo los que dicen otra ruta. Lo que va entre `<...>` se rellena con lo que liste
`AGENTES.md` (agentes) o `DATOS.md` (ficheros). Si un comando falla, se anota en
`ERRORES.md` antes de cambiar nada.

## Estado y agentes

```bash
launchctl print gui/501/<label> | grep -E "state|pid"      # ¿corre?
tail -3 dinero/logs-<agente>.log                           # ¿qué dejó?
launchctl kickstart -k gui/501/<label>                     # relanzar ya
launchctl bootstrap gui/501 ~/Library/LaunchAgents/<label>.plist   # cargar
launchctl bootout gui/501 ~/Library/LaunchAgents/<label>.plist     # descargar
```

## Repositorio

```bash
python3 tools/repo.py --sin-arreglar   # mide el repo y no toca nada (acta en dinero/REPO.md)
python3 tools/repo.py                  # limpia basura generada, comitea docs y empuja si toca
python3 tools/pendientes.py            # lo que espera decisión del dueño, con antigüedad
```

El agente `repo` corre a las 07:15 y 20:30 y **solo** toca `fabrica-docs/` y `.gitignore`:
no borra ramas, no reescribe historia y no hace force-push.

## Documentación de la fábrica

```bash
python3 tools/gen_docs.py            # reescribe AGENTES.md y DATOS.md desde plists y data/
python3 tools/gen_docs.py --check    # avisa si están viejas (exit 1)
```

## Web

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node scripts/build.mjs   # construir en dist/
curl -s -o /dev/null -w '%{http_code}\n' https://valorcarta.github.io/  # ¿está viva?
```

## Ver la web como la ve el dueño (capturas)

Playwright se engancha al Chrome invisible por CDP (puerto 9333). Para que carguen las
imágenes con `loading="lazy"` hay que bajar la página antes de la captura:

```bash
python3 - <<'EOF'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    pg = b.contexts[0].new_page(); pg.set_viewport_size({"width":1366,"height":900})
    pg.goto("https://valorcarta.github.io/", wait_until="domcontentloaded")
    for y in range(0, 7000, 600):
        pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(120)
    pg.screenshot(path="dinero/tmp/portada.png", full_page=True)
    pg.close()
EOF
```

Servir `dist/` en local para capturas **antes** de publicar:
`cd dist && python3 -m http.server 8766` y capturar `http://127.0.0.1:8766/`.

## Vídeo

```bash
VC_ESTANDAR=short python3 tools/qa_video.py <mp4>      # PASA / NO PASA y por qué
python3 tools/puerta_video.py                          # demanda + JEV + voz
python3 tools/yt_subir.py --listar                     # últimos subidos (manda la API)
```

Añadir el cierre con la dirección (si el vídeo no lo trae) y subir:

```bash
B=/Users/home/Downloads/BANCO_VIDEOS/SHORTS/<fecha>/<pieza>
ffmpeg -y -i "$B/video-1080.mp4" -vf "drawtext=fontfile='/System/Library/Fonts/Supplemental/Arial Bold.ttf':text='valorcarta.github.io':fontsize=54:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h-260:enable='gte(t,8.4)'" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a copy "$B/video-1080-cierre.mp4"
VC_ESTANDAR=short python3 tools/yt_subir.py --video "$B/video-1080-cierre.mp4" \
  --titulo "… #Shorts" --descripcion "… https://valorcarta.github.io/carta/<slug>/ … aviso de afiliado … #Shorts"
```

## Amazon

```bash
python3 tools/amazon_vigia.py                      # 45 ASIN, stock/precio/comprador
python3 tools/amazon_vigia.py --limite 5 --sin-escribir   # prueba sin tocar ficheros
```

## Chrome invisible

```bash
bash tools/chrome_fijar.sh on|off|estado    # fijar encendido o soltar
open -n -a "Google Chrome"                  # abrir Chrome visible aunque haya invisible
```

## Disco (antes de trabajar con vídeo)

```bash
df -h / ; du -sh ~/Pictures ~/Desktop ~/Downloads   # si hay <10 GB libres, avisar al dueño
```
