<!-- GENERADO por tools/gen_docs.py · no editar a mano · regenerar: python3 tools/gen_docs.py -->


# Agentes de la fábrica — qué corre, cuándo y cómo comprobarlo

Generado: 2026-11-14 · 67 agentes en ~/Library/LaunchAgents (solo com.valorcarta*). Cada fila está sacada del plist, no del recuerdo.

| agente | cuándo | qué hace | comprobar |
|---|---|---|---|
| `amazon` | 13:00 | valorcarta_bot.py — la fábrica ValorCarta, una tarea por fichero y por funciones | `tail -3 ~/valorcarta_bot/logs/amazon.log` |
| `amazonvigia` | 07:40, 12:35, 19:40 | Vigilante de productos de Amazon: qué está a la venta, a qué precio y con qué buy box | `tail -3 dinero/logs-amazon-vigia.out` |
| `arte` | 09:10 | Agente de dirección de arte: mide el sistema visual y deja acta. 0 tokens | `tail -3 dinero/logs-arte.log` |
| `banco.clasifica` | cada 15 min | Clasifica los videos que caen en Descargas: corto (<= limite) o largo | `tail -3 ~/Downloads/BANCO_VIDEOS/COLA/launchd.out` |
| `banco.largo` | 19:00 | Turno de subida: 2 Shorts al dia (uno por canal) y 1 largo a la semana | `tail -3 ~/Downloads/BANCO_VIDEOS/COLA/largo.out` |
| `banco.subir` | 10:30, 18:30 | Turno de subida: 2 Shorts al dia (uno por canal) y 1 largo a la semana | `tail -3 ~/Downloads/BANCO_VIDEOS/COLA/subir.out` |
| `cadena` | 08:45 | Cadena web: datos → índice → publicación → verificación en vivo. Sin huecos | `tail -3 dinero/logs-cadena.log` |
| `checklist` | 10:40 | Orquestador de checklists: cada agente resuelve la suya y deja prueba. 0 tokens | `tail -3 dinero/logs-checklist.log` |
| `chrome` | siempre | Escucha en 127.0.0.1:9333 y enciende Chrome invisible SOLO cuando alguien lo usa | `tail -3 ~/valorcarta_bot/logs/chrome9333.err` |
| `ciclos` | 09:35 | Scanner de ciclos: qué agente/script hay en cada etapa y dónde se rompe. 0 tokens | `tail -3 dinero/logs-ciclos.log` |
| `coherencia` | 09:05 | Agente de coherencia web — mira la web entera en 8 dimensiones y deja acta | `tail -3 dinero/logs-coherencia.log` |
| `comercio` | 08:05 | Agente de comercio: audita y arregla la tienda de afiliado. 0 tokens | `tail -3 dinero/logs-comercio.log` |
| `control` | 20:30 | valorcarta_bot.py — la fábrica ValorCarta, una tarea por fichero y por funciones | `tail -3 ~/valorcarta_bot/logs/control.log` |
| `cta` | 09:55 | Puerta de compra + barrido de TODA la web (local, 0 red, 0 tokens) | `tail -3 dinero/logs-cta.log` |
| `cumple` | {'Minute': 0}, {'Minute': 30} | Agente de cumplimiento: deja el panel de objetivos en verde y con prueba, solo | `tail -3 dinero/logs-cumple.log` |
| `dashboard` | cada 1 min | Registro AUDITADO de los objetivos de los 5 canales — 0 tokens | `tail -3 dinero/logs-dashboard.log` |
| `divergente` | 07:55, 19:55 | Agente Divergente: valida en cola todas las propuestas y exige pruebas. 0 tokens | `tail -3 dinero/logs-divergente.log` |
| `espacio` | cada 30 min | vigia_espacio.sh | `launchctl print gui/501/com.valorcarta.espacio | grep state` |
| `estetica` | 09:20 | Agente de estética: mide la cara de la web en móvil y su coherencia con el catálogo | `tail -3 dinero/logs-estetica.log` |
| `estudio` | 09:50 | Estudio automático: lee dinero/mediciones y escribe dinero/ESTUDIO.md (0 tokens) | `tail -3 dinero/logs-estudio.log` |
| `formatos` | 13:05 | Cazador de formatos: qué vídeos pegan fuerte, por nicho. 0 tokens (yt-dlp, sin clave) | `tail -3 dinero/logs-formatos.log` |
| `indice` | 08:30 | Índice ValorCarta v2 — cesta fija, descomposición y razonamiento obligatorio. 0 tokens | `tail -3 dinero/logs-indice.log` |
| `instagram` | 19:00 | Publica en Instagram (Reels) el siguiente vídeo pendiente de la cola, en invisible | `tail -3 ~/Downloads/FABRICA/social/logs/instagram-agente.log` |
| `investigacion` | 08:00 | Centro de investigaciones de VALORCARTA (orden maestra v1.0, §11-12) | `tail -3 dinero/logs-investigacion.log` |
| `libro` | cada 2 min | arranca_mt5.sh | `tail -3 ~/Library/Application Support/libro_axi/launchd.out` |
| `libroinvest` | cada 1 min | Agente local (0 tokens): guarda libro+base cada minuto y calcula qué predice el libro | `tail -3 /tmp/libroinvest.log` |
| `mando` | cada 3 h | Mando automático: aplica por script todo lo que NO necesita criterio. 0 tokens | `tail -3 dinero/logs-mando.log` |
| `mantiene` | cada 30 min | Mantenimiento con criterio (script, no LLM): mira, piensa, arregla y deja acta | `tail -3 dinero/logs-mantiene.log` |
| `movimientos` | 08:20 | Movimientos de precio: qué cartas suben y bajan, desde nuestro propio histórico | `tail -3 dinero/logs-movimientos.log` |
| `oficina` | cada 5 min | oficina.sh | `tail -3 dinero/logs-oficina.log` |
| `panel` | siempre | python3 | `tail -3 dinero/logs-panel.log` |
| `pendientes` | 07:30 | Cola de verificaciones diferidas (el "gesto" de la cadena): todo NO MEDIDO resoluble | `tail -3 dinero/logs-pendientes.log` |
| `perro` | cada 5 min | El perro guardián: rastrea el dataset y avisa cuando la cadena ha fallado | `tail -3 dinero/perro.log` |
| `pinterest-agente` | 11:30 | Agente de Pinterest: audita perfil y pines, y marca qué mejorar hoy. 0 tokens | `tail -3 dinero/logs-pinterest-agente.log` |
| `pinterest-gestor` | cada 4 h | Gestor de Pinterest: ciclo recurrente (cada 4 h) técnico + estético + publicación. 0 tokens | `tail -3 dinero/logs-pinterest-gestor.log` |
| `pinterest-tecnico` | cada 4 h | Pinterest: revisión técnica + estética, cada 4 h, configurable y 0 tokens | `tail -3 dinero/logs-pinterest-tecnico.log` |
| `pinterest.cola` | 08:15 | Cola de Pinterest con criterio: prioriza lo que rinde y archiva el exceso. 0 tokens | `tail -3 dinero/logs-pinterest-cola.log` |
| `pinterest.cumple` | 10:45, 17:45, 20:00, 21:45, 22:45 | Cumple Pinterest: si hoy no se ha publicado ningún pin, crea otro turno | `tail -3 dinero/logs-cumple-pinterest.log` |
| `pinterest` | 10:00, 17:00 | run.sh | `tail -3 ~/valorcarta_bot/logs/pinterest.log` |
| `pinterest.top` | 08:20 | Top pines: qué pines llevan el alcance y cuáles rediseñar (0 tokens) | `tail -3 dinero/logs-top.log` |
| `precios` | 08:00, 22:00 | run.sh | `tail -3 ~/valorcarta_bot/logs/precios.log` |
| `radaryt` | 07:00 | Radar de YouTube: qué funciona en cartas Pokémon en español, medido y no opinado | `tail -3 dinero/logs-radaryt.log` |
| `recoge.amazon` | 10:15 | Recogedor de datos por canal — escribe lo que los agentes miden, nada más | `tail -3 dinero/logs-recoge-amazon.log` |
| `recoge.github` | 10:15 | Recogedor de datos por canal — escribe lo que los agentes miden, nada más | `tail -3 dinero/logs-recoge-github.log` |
| `recoge.pinterest` | 03:15, 09:15, 15:15, 21:15 | Recogedor de datos por canal — escribe lo que los agentes miden, nada más | `tail -3 dinero/logs-recoge-pinterest.log` |
| `recoge.tiktok` | 09:45 | Recogedor de datos por canal — escribe lo que los agentes miden, nada más | `tail -3 dinero/logs-recoge-tiktok.log` |
| `recoge.web` | 09:15 | Recogedor de datos por canal — escribe lo que los agentes miden, nada más | `tail -3 dinero/logs-recoge-web.log` |
| `recoge.youtube` | 12:15 | Recogedor de datos por canal — escribe lo que los agentes miden, nada más | `tail -3 dinero/logs-recoge-youtube.log` |
| `recupera` | cada 30 min | Recupera los turnos perdidos cuando el Mac estaba apagado. 0 tokens | `tail -3 dinero/logs-recupera.log` |
| `redaccion.brief` | 08:40 | Brief de redacción: tema del día con dato propio, listo para el turno (0 tokens) | `tail -3 dinero/logs-brief.log` |
| `redaccion` | 09:30 | valorcarta_bot.py — la fábrica ValorCarta, una tarea por fichero y por funciones | `tail -3 ~/valorcarta_bot/logs/redaccion.log` |
| `redes` | 18:30, 22:30 | Agente de redes: hace el turno completo (TikTok + Instagram) en invisible, 0 tokens | `tail -3 ~/Downloads/FABRICA/social/logs/redes-agente.log` |
| `render` | 13:45 | Agente de render: guion registrado → vídeo 1080x1920 con voz ElevenLabs. 0 tokens API | `tail -3 dinero/logs-render.log` |
| `robustez` | 08:50 | Agente de robustez: busca errores de ingeniería y arregla los seguros. 0 tokens | `tail -3 dinero/logs-robustez.log` |
| `ronda` | cada 3 h | Ronda de mando (cada 3 h, 0 tokens): foto de cumplimiento y huecos para el Lead | `tail -3 dinero/logs-ronda.log` |
| `rota` | cada 10 min | rota.sh | `launchctl print gui/501/com.valorcarta.rota | grep state` |
| `scaner` | 09:30 | Scanner del dashboard: busca dónde flaquea el negocio, canal por canal. 0 tokens | `tail -3 dinero/logs-scaner.log` |
| `seo` | 07:50 | Agente SEO: audita toda la web y arregla lo determinista. 0 tokens | `tail -3 dinero/logs-seo.log` |
| `simula` | 09:35 | Simulador de clientes: 200 visitas aleatorias buscando fallos. 0 tokens | `tail -3 dinero/logs-simula.log` |
| `tiktok` | 18:30 | Publica en TikTok (invisible, headless) el siguiente vídeo pendiente de la cola | `tail -3 ~/Downloads/FABRICA/social/logs/tiktok-agente.log` |
| `tokens` | 07:35 | Agente de tokens: vigila, rota lo rotable y avisa de lo expuesto. NO imprime secretos | `tail -3 dinero/logs-tokens.log` |
| `visitas` | cada 3 h | Visitas web y de dónde vienen (GoatCounter, sesión del Chrome 9333). 0 tokens | `tail -3 dinero/logs-visitas.log` |
| `web` | 12:00 | valorcarta_bot.py — la fábrica ValorCarta, una tarea por fichero y por funciones | `tail -3 ~/valorcarta_bot/logs/web.log` |
| `webvivo` | cada 3 h | Agente de verdad en vivo: ¿lo que hay en dist/ es lo que sirve la web? 0 tokens | `tail -3 dinero/logs-webvivo.log` |
| `youtube` | 14:00, 20:00 | run.sh | `tail -3 ~/valorcarta_bot/logs/youtube.log` |
| `ytdemanda` | 06:50 | Demanda real de YouTube: qué busca la gente que llega al canal (0 tokens) | `tail -3 dinero/logs-ytdemanda.log` |
| `ytkpi` | 06:45 | KPI de YouTube con datos reales (0 tokens). Escribe dinero/YOUTUBE-KPI.md | `tail -3 dinero/logs-ytkpi.log` |

Reglas de esta página: si un agente no está aquí, no corre. Un plist con el script borrado sale como ⚠ y es un fallo, no una nota.
Regenerar: `python3 tools/gen_docs.py`. Comprobar uno a uno: `launchctl print gui/501/<label> | grep -E "state|pid"`.
