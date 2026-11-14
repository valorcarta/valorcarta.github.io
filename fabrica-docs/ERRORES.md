# Errores y post-mortems — qué pasó, cómo se supo y qué quedó

Formato: **síntoma → prueba → causa → arreglo → guarda**. Si un error no tiene prueba, no
entra en esta página. Los arreglos pendientes llevan fecha o condición de reversión.

## 2026-11-12 · Disco lleno y la fábrica escribiendo sobre un Mac sin espacio

- **Síntoma**: el registro de precios muere; nada de lo que escribe en disco es fiable.
- **Prueba**: `logs/precios.err`, 12-11 08:12: `OSError: [Errno 28] No space left on device`.
- **Causa**: 2,3 GB libres de 228 GB (`df -h /`), uso normal del Mac.
- **Arreglo**: el dueño liberó espacio; a las 12:08 había 8,7 GB.
- **Guarda**: antes de vídeo o de un turno que escriba mucho, `df -h /`; **nunca borrar
  fuera del workspace**: si falta espacio, se mide, se dice y decide el dueño.

## 2026-11-12 y 14 · El render no genera voz (402)

- **Síntoma**: el vídeo de fábrica no sale; la cola de subida queda vacía.
- **Prueba**: `dinero/videos/RENDER-IA.log`: seis intentos (07:34, 11:19, 15:42, 17:12,
  18:40, 19:12) con `http=402 paid_plan_required`.
- **Causa**: el servicio de voz exige plan Pro; la cuenta está en plan gratuito.
- **Arreglo**: pendiente (decisión de pago del dueño). Mientras: solo se suben vídeos que
  ya traen audio; `puerta_video.py` exige voz ElevenLabs real.
- **Guarda**: la puerta del vídeo mide antes de subir; sin PASS no se sube.

## 2026-11-12 · El build de la web no reconstruye desde el agente de las 12:00

- **Síntoma**: `web.log` dice "3/3 OK" pero el build nunca ocurre.
- **Prueba**: `logs/web.log`, 12-11 12:00: `/bin/sh: node: command not found`.
- **Causa**: el plist `com.valorcarta.web` lanza `~/valorcarta_bot/valorcarta_bot.py --task web`,
  que (a) no tiene `scripts/build.mjs` en su directorio y (b) launchd no lleva el PATH de Homebrew.
- **Arreglo**: el build bueno es `PATH="/opt/homebrew/opt/node@22/bin:$PATH" node scripts/build.mjs`
  desde el repo (`SITIO.md`). El turno de las 12:00 sigue roto: no tomar su log como prueba.
- **Guarda**: la fecha del catálogo en la portada se comprueba con `curl`.

## 2026-11-13 · La ficha del banco decía "pendiente" de un vídeo ya subido

- **Síntoma**: se informa al dueño de que un vídeo no está subido cuando llevaba 13,9 h público.
- **Prueba**: `ficha.json` del 13-11 en `estado: pendiente`; la API del canal devolvía
  `7jsK89fEkQ4`, publicado 13-11 13:22 (13,9 h antes de la consulta).
- **Causa**: dos registros de la misma verdad (ficha local y `dinero/youtube-estado.json`).
- **Arreglo**: ficha corregida con `estado: subido` e id.
- **Guarda**: el estado de subida manda por el canal: `tools/yt_subir.py --listar`.

## 2026-11-12 · Se afirmó texto de un vídeo sin ampliarlo ("Chartizard")

- **Síntoma**: se le dijo al dueño que la carta del clip decía "Chartizard"; decía "Charizard".
- **Prueba**: recorte ampliado del fotograma (`dinero/tmp/zoom-tl.png`).
- **Causa**: leer texto en una vista pequeña y presentarlo como dato.
- **Guarda**: texto de vídeo se confirma ampliando el fotograma o con OCR; si no se lee, NO SÉ.

## 2026-11-14 · La portada decía "ACTUALIZADO EL 13" con los precios del 14

- **Síntoma**: fecha del catálogo un día atrasada aunque el recálculo de precios había ido bien.
- **Prueba**: `data/cards.json` con `updated` máximo 13-11 22:24 y build del 14 a las 10:00.
- **Causa**: `scripts/build.mjs` usaba el máximo de `updated` de las cartas como fecha del dato.
- **Arreglo**: `scripts/build.mjs:262` toma el máximo entre esa fecha y `changes.json` (día
  del recálculo). Verificado: el dist dice "ACTUALIZADO EL 14 DE NOVIEMBRE".
- **Guarda**: el sello de fecha se comprueba con `curl` sobre el vivo, no sobre `dist`.

## 2026-11-12 · Chrome no abría al pulsar el icono

- **Síntoma**: doble clic en Chrome no abría ninguna ventana.
- **Prueba**: con el Chrome invisible encendido, `open -a "Google Chrome"` no creaba proceso;
  `open -n -a "Google Chrome"` sí abría ventana.
- **Causa**: `com.valorcarta.chrome` tenía `KeepAlive=1` y el invisible se quedaba con la app.
- **Arreglo**: sustituido por `tools/cdp_proxy.py` (escucha en 9333 y enciende Chrome solo
  cuando un turno lo usa; lo apaga a los 2 min sin clientes). A mano: `tools/chrome_fijar.sh`.
- **Guarda**: `bash tools/chrome_fijar.sh estado`.
