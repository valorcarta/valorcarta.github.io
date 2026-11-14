# El sitio — construir, publicar y las puertas que no se saltan

Revisado: 2026-11-14 (todas las rutas de esta página se usaron hoy). Sitio:
`https://valorcarta.github.io` · repo `github.com/valorcarta/valorcarta.github.io` ·
publica desde la rama `gh-pages` (`INFRAESTRUCTURA.md`, sección 1).

## Construir (local)

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node scripts/build.mjs
```

- Node **no está en el PATH de launchd**: sin la línea de arriba el build dice
  `node: command not found` y no reconstruye (probado 14-11, `logs/web.log`).
- Salida en `dist/`. Tarda ~40 s. Rutas clave: `/`, `/carta/<slug>/`, `/comprar/<slug>/`,
  `/set/<id>/`, `/mercado/`, `/cartas/`, `/sitemap.xml`.
- El agente `webvivo` (cada 3 h) compara `dist/` con lo publicado y repara el desfase
  (`dinero/logs-webvivo.log`). `com.valorcarta.web` (12:00) apunta a `~/valorcarta_bot`,
  que **no tiene `scripts/build.mjs`**: no es el build bueno, no fiarse de él.

## Desplegar

Lo decide el dueño (publicar es irreversible). Tras su sí: reconstruir y dejar que
`webvivo` sincronice, o subir a `gh-pages`. Comprobar después:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://valorcarta.github.io/
curl -s https://valorcarta.github.io/ | grep -o "ACTUALIZADO EL .*"   # fecha del catálogo
```

## Puertas

| Puerta | Qué exige | Herramienta |
|---|---|---|
| Vídeo: estándar | 1080×1920 · 30 fps · audio · duración por estándar (`VC_ESTANDAR=short`) | `tools/qa_video.py <mp4>` |
| Vídeo: demanda y voz | demanda con fuente, JEV ≥ 0,70, voz ElevenLabs real | `tools/puerta_video.py` |
| Subida a YouTube | enlace `valorcarta.github.io` en la descripción, aviso de afiliado, #Shorts y **dominio legible en el cierre** (OCR 85-99 % del vídeo) | `tools/yt_subir.py --video …` |
| Producto de Amazon | solo se enlaza si `data/productos-verificados.json` dice `disponible: true` | `tools/amazon_vigia.py` |
| Pin | sin id, título ni imagen repetidos; un solo publicador con candado | `tools/publicar_pin.py` vía `tools/ventana.sh` |
| Precio mostrado | el precio de Amazon tiene que estar al día | `tools/precios_amazon.py` |

## Vídeo (orden fijo)

1. Guion con cifra propia (`prompts/agente-guion.md`).
2. Render local y voz (`com.valorcarta.render`, 13:45) — hoy la voz falla con
   `402 paid_plan_required` (`dinero/videos/RENDER-IA.log`): sin voz real no se sube.
3. `tools/qa_video.py` → `PASA`.
4. `tools/yt_subir.py --video … --titulo … --descripcion …` → devuelve URL.
5. Confirmar: `tools/yt_subir.py --listar` (manda la API, no la ficha del banco).

## Pines

`bash tools/ventana.sh` hace la comprobación previa, publica y mide. Estado en
`dinero/cola-pines.json`; el acta del día en `dinero/CUMPLE-PINTEREST.md`.

## Chrome invisible

`tools/cdp_proxy.py` escucha en 9333 y **solo enciende Chrome cuando un turno lo usa**;
sin clientes lo apaga en 2 minutos. Para trabajo a mano: `bash tools/chrome_fijar.sh on|off`.
Si Chrome no abre al pulsar el icono, comando especial: `open -n -a "Google Chrome"`.
