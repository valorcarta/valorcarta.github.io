<!-- GENERADO por tools/gen_docs.py · no editar a mano · regenerar: python3 tools/gen_docs.py -->


# Datos de la fábrica — qué hay, qué forma tiene y quién lo toca

Generado: 2026-11-14 · 33 ficheros JSON en data/. La forma sale de abrir el fichero, no de suponerla.

| fichero | forma | peso | lo tocan |
|---|---|---|---|
| `amazon-csv-resumen.json` | objeto · fecha, filas, clics, pedidos, ganancias, fuente | 138 B | amazon_csv.py |
| `amazon-informes.json` | objeto · fecha, clics_30d, ventana_30d, fuente | 171 B | amazon_informes.py, dashboard_datos.py, dashboard_objetivos.py … |
| `arte-referencias.json` | objeto · onepeace, pokebeach, limitless | 1 KB | arte_referencias.py |
| `arte.json` | objeto · actualizado, score, colores, fuentes, tamanos, espacios … | 391 B | agente_arte.py, dashboard_datos.py, scaner_dashboard.py … |
| `asins.json` | objeto · sv01, sv08.5, me02.5, me02, me03, 30th … | 2 KB | audita_cta.py, auditoria.mjs, build.mjs … |
| `cards-en.json` | objeto · swsh7-215, 30th-R, 30th-G, swsh7-218, 30th-B, neo1-9 … | 69 KB | build.mjs |
| `cards.json` | lista de 19014 · campos: id, localId, name, setId, setName, serie | 14.9 MB | assemble.mjs, audita_cta.py, build.mjs … |
| `changes.json` | objeto · fecha, contra, suben, bajan | 2 KB | auditoria.mjs, build.mjs, cola.py … |
| `ciclos.json` | objeto · actualizado, canales | 3 KB | scaner_ciclos.py |
| `comercio.json` | objeto · actualizado, score, productos, disponibles, con_foto, enlaces_dp … | 408 B | agente_comercio.py, dashboard_datos.py, scaner_dashboard.py … |
| `demanda.json` | objeto · actualizado, desde, hasta, buscadores, fuentes_web, fuente | 528 B | demanda.mjs, yt_demanda.py |
| `empresa.json` | objeto · generado, racha, diasPerdidos, canalesMuertos, cerradas, abiertas … | 9 KB | mapa.mjs |
| `panel.json` | objeto · total, desde, hasta, rango, actualizado, top … | 1 KB | auditoria.mjs, build.mjs, panel.mjs … |
| `pinterest-top.json` | objeto · actualizado, pines | 2 KB | pinterest_top.py |
| `primer-pedido.json` | objeto · fecha, clics_30d, pedidos, ganancias_eur, conversion_pct, ventana … | 304 B | sin referencias |
| `productos-extra.json` | objeto · _doc, productos | 755 B | amazon_vigia.py, build.mjs, recomienda.py |
| `productos-verificados.json` | objeto · _doc, comprobado, fuente, productos | 12 KB | agente_comercio.py, amazon_vigia.py, build.mjs … |
| `productos.json` | lista de 21 · campos: asin, nombre, gancho, precio, imagen_local, enlace_amazon | 6 KB | amazon_vigia.py, build.mjs, precios_amazon.py … |
| `proyecto.json` | objeto · actualizado, items, disco_gb | 878 B | scaner_proyecto.py |
| `radar.json` | lista de 6 · campos: slug, fecha, etiqueta, titulo, gancho, parrafos | 12 KB | audita_texto.py, build.mjs, control.py … |
| `recomendaciones.json` | objeto · generado, fuente, sugerencias, disponibles, productos, por_asin | 6 KB | build.mjs, recomienda.py |
| `regalos.json` | objeto · verificado, fuente, productos | 800 B | build.mjs, publica_web.py |
| `robustez.json` | objeto · actualizado, problemas, arreglados, scripts | 3 KB | agente_robustez.py |
| `scaner.json` | objeto · actualizado, grietas | 1 KB | scaner_dashboard.py |
| `selector-map.json` | objeto · amazon.clics, amazon.pedidos, amazon.filtro_id, gcp.add_users, gcp.guardar_test, oauth.cuenta … | 318 B | navegador.py |
| `seo.json` | objeto · fecha, paginas, con_problemas, score, title_duplicados, sitemap_urls … | 1 KB | agente_seo.py, dashboard_datos.py, scaner_dashboard.py … |
| `sets-en.json` | objeto · base1, base3, tk-ex-latia, np, base2, ex10 … | 15 KB | build.mjs |
| `sets.json` | lista de 160 · campos: id, name, serie, releaseDate, cardCount, logo | 36 KB | build.mjs, fetch.mjs, fill-en.mjs … |
| `yt_client.json` | objeto · installed | 414 B | autotest.py, yt_autorizar.py, yt_autorizar_full.py … |
| `yt_client_final.json` | objeto · web | 373 B | yt_autorizar_full.py |
| `yt_client_web.json` | objeto · web | 315 B | sin referencias |
| `yt_client_web2.json` | objeto · web | 315 B | sin referencias |
| `yt_token.json` | objeto · token, refresh_token, token_uri, client_id, client_secret, scopes … | 887 B | agente_tokens.py, autotest.py, dashboard_datos.py … |

Datos grandes (catálogo, precios) se rehacen por turnos; si un fichero no tiene quien lo toque, o está muerto o lo escribe un agente de fuera del repo: comprobarlo antes de fiarse.
Regenerar: `python3 tools/gen_docs.py`.
