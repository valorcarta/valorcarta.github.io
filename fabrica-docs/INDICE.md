# Índice de la fábrica — qué leer para cada cosa

Última revisión: 2026-11-14. Todos los comandos se ejecutan **en la raíz del repo**;
lo que va entre `<...>` es un hueco que se rellena con lo que diga `AGENTES.md` o `DATOS.md`. Esta página no cuenta cómo funciona nada: dice **dónde está la
verdad y cómo comprobarla**. Si algo no se puede comprobar con el comando de la fila, no se
da por bueno.

| Si necesito… | Leo | Compruebo con |
|---|---|---|
| saber qué agentes corren, cuándo y qué dejan | `AGENTES.md` | `launchctl print gui/501/<label> \| grep -E "state\|pid"` |
| saber quién escribe un dato y qué forma tiene | `DATOS.md` | `python3 -c "import json;print(str(json.load(open('data/cards.json')))[:200])"` |
| reconstruir la web o entender el despliegue | `SITIO.md` | `curl -s -o /dev/null -w '%{http_code}' https://valorcarta.github.io/` |
| preparar y subir un vídeo (sin saltarme puertas) | `SITIO.md` §Vídeo | `python3 tools/qa_video.py <mp4>` y `python3 tools/yt_subir.py --listar` |
| publicar un pin | `SITIO.md` §Pines | `bash tools/ventana.sh` (hace prep y publica) |
| saber qué productos de Amazon están a la venta | `DATOS.md` + `dinero/AMAZON-VIGIA.md` | `python3 tools/amazon_vigia.py --limite 5 --sin-escribir` |
| arreglar algo que se rompió | `ERRORES.md` | el comando de prueba de su entrada |
| por qué no hay pedidos de Amazon | `dinero/AMAZON-COMPRAS.md` | `python3 tools/amazon_compras.py` |
| dejar el repo apañado (basura, docs, push) | `dinero/REPO.md` + este índice | `python3 tools/repo.py --sin-arreglar` |
| decisiones que esperan al dueño | `dinero/decisiones/pendientes.json` | `python3 tools/pendientes.py` |
| comandos del día a día | `RUNBOOK.md` | se pega tal cual, están probados |
| saber qué está prohibido tocar sin el dueño | `AGENTS.md` (raíz del repo) | — |

## Cuatro palabras que se repiten

- **plist**: fichero de launchd que dice qué script corre y cuándo (`~/Library/LaunchAgents/`).
- **agente**: script local que launchd lanza solo, 0 tokens; deja acta en `dinero/`.
- **turno**: ejecución de un agente (o de un humano) que produce algo y lo apunta.
- **acta**: el fichero donde el agente deja qué hizo, con fecha; es la prueba.

## Reglas de estas páginas

1. **No se editan AGENTES.md ni DATOS.md a mano**: los genera `tools/gen_docs.py`
   desde los plists y los ficheros de datos. Se regenera, no se corrige.
   `python3 tools/gen_docs.py --check` avisa si están viejas.
2. Cada línea cita su fuente: un fichero, una fecha o un comando. Sin fuente, la palabra
   es **NO SÉ** (regla del dueño, 27-10-2026).
3. Una página = una necesidad. Ninguna pasa de 100 líneas y se lee siempre con
   `offset/limit` ≤60: el agente lee el trozo que necesita, no la página entera.
4. Lo que ya vive en el repo (`README.md`, `GUIA.md`, `INFRAESTRUCTURA.md`) no se repite
   aquí: se enlaza. Pero si contradice a estas páginas, manda la que tenga fuente y fecha.
5. Los estados de esta documentación son de la fecha de generación. Antes de afirmar algo
   en una respuesta al dueño se comprueba en ese turno (regla 2 del protocolo).
