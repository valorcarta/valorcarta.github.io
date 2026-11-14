# ValorCarta

Web estática que calcula **cuánto vale una colección de cartas Pokémon** con precios reales de Cardmarket
(vía la API pública de TCGdex). 8.554 cartas con precio, 100 sets, catálogo completo en español.
Sin base de datos, sin backend, sin cookies, sin dependencias de npm.

- Portada + buscador
- `/valorar/` — calculadora: busca, añade cantidades, total y variación de 30 días. Guarda en el navegador y comparte por enlace.
- `/carta/<slug>/` — 8.554 fichas: precio, media 30 días, mínimo, tabla por versión (normal/reversa/holo), gráfica y CTA de afiliado.
- `/set/<id>/` — 100 listados por set con valor total.
- `/premium/` + `/gracias/` — planes y entrega post-compra.
- `sitemap.xml` con 8.660 URLs, `robots.txt`, `_headers`, 404.

## Arrancar

```bash
npm run dev          # build + http://localhost:4321
npm run fetch        # refresca catálogo y precios (2-3 min, reanudable)
npm run daily        # fetch + build + foto de precios + aviso Telegram
```

## Publicar (gratis, con GitHub)

El repo debe llamarse **`TUUSUARIO.github.io`** (así los enlaces absolutos funcionan en la raíz).

```bash
git remote add origin https://github.com/TUUSUARIO/TUUSUARIO.github.io.git
git branch -M main
git push -u origin main
```

Luego, en el repo: **Settings → Pages → Source: GitHub Actions**. En 3-4 minutos está en
`https://TUUSUARIO.github.io`. Cada push y cada día a las 06:10 UTC se reconstruye solo
(`.github/workflows/publicar.yml`: baja precios, construye, guarda histórico y despliega).

Cuando haya ingresos, se le pone dominio propio (~10 €/año) sin tocar código: `SITE_URL` se toma
del propio Pages.

## Lo único que sigue necesitando tu cuenta (2 cosas)

1. **Etiqueta de Amazon**: alta en [afiliados.amazon.es](https://afiliados.amazon.es) y pegar el tag
   en `config.json` → `amazonTag`. Hacen falta 3 ventas en 180 días para que aprueben.
2. **Cobro**: producto en Lemon Squeezy (5 % + 0,50, ellos liquidan el IVA de la UE) y su URL en
   `config.json` → `premiumUrl`. Tu NIF en `titular`/`nif` para el aviso legal.

## Dónde está el dinero (en orden)

| Fuente | Cuándo | Cuánto |
|---|---|---|
| Afiliado Amazon 7 % (juguetes) | desde el día 1 | ~3,50 € por ETB de 50 € |
| Suscripción 4,99 €/mes | con ~1.000 usuarios activos | ~85 € netos por cada 1.000 activos (2 % de conversión, hipótesis) |
| Singles (eBay, tickets altos) | mes 2-3 | pendiente de alta |

La suscripción no se sostiene sin tráfico: con 0 visitas da 0 €. El orden real es **contenido → tráfico → cobro**.

## Automatización

Hay tres relojes, y solo uno depende de mí:

- **Sesión activa**: recordatorio diario a las 07:10 (Europe/Madrid) que ejecuta el ciclo y publica si hay token.
- **GitHub Actions**: `.github/workflows/daily.yml` a las 06:10 UTC, con secretos.
- **launchd/cron local**: descartado. macOS bloquea ejecutar scripts dentro de `~/Documents` (`Operation not permitted`, TCC): el agente queda instalado pero sale con código 126. Por eso el planificador vive en la sesión, no en el sistema.

`.github/workflows/daily.yml` corre a las 06:10 UTC: descarga precios, reconstruye la web, guarda la foto
del día en `data/history/`, publica el resumen en Telegram y despliega. Secretos necesarios:
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Contenido

9 guías publicadas en `/guias/` (autenticidad, conservación, compra, venta, catalogación). Escritas por agentes
con una regla: cero cifras inventadas. Para añadir una, suelta un JSON en `content/guias/` y reconstruye.

## Límites, dichos a la cara

- El precio es **referencia de mercado**, no tasación: no distingue Near Mint de jugada. Una carta en mal estado vale mucho menos.
- Los precios vienen de Cardmarket a través de TCGdex. Si TCGdex cambia o corta, la web se queda con la última foto.
- Las imágenes se enlazan desde `assets.tcgdex.net` (no se copian). Si abusan del hotlink habría que moverlas.
- El acceso Premium es un enlace de invitación a Telegram: vale para empezar, no es autenticación. Con ~100 suscriptores hay que pasar a login real.
- Las páginas legales llevan placeholders (`NOMBRE Y APELLIDOS`, `00000000X`): hay que rellenarlos antes de publicar.

## Estructura

```
config.json          marca, tag de Amazon, checkout, NIF, precios
scripts/fetch.mjs    API TCGdex -> data/cards.json (cache en data/cache)
scripts/build.mjs    data/*.json -> dist/ (8.660 páginas)
scripts/snapshot.mjs foto diaria + movimientos > 3% -> out/digest.txt
scripts/telegram.mjs publica el resumen
scripts/auto.sh      ciclo completo (lo llama el planificador o el CI)
scripts/serve.mjs    servidor local con URLs limpias
content/guias/      9 guías escritas por agentes, se renderizan en /guia/<slug>/
site/                plantillas, CSS y JS (sin framework)
```

## Documentación operativa

`fabrica-docs/INDICE.md` — mapa de la fábrica: qué agente corre, dónde vive cada dato,
cómo se construye y publica, comandos probados y errores ya vistos. Se lee por necesidad;
`AGENTES.md` y `DATOS.md` se generan con `python3 tools/gen_docs.py`.
