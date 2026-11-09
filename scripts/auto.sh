#!/bin/bash
# Ciclo diario completo. Lo lanza launchd (com.valorcarta.daily) o el cron.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
NODE="/opt/homebrew/opt/node@22/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node)"
LOG="logs/auto-$(date +%F).log"
mkdir -p logs

# credenciales opcionales (tag de Amazon, checkout, token de Cloudflare, Telegram)
if [ -f .env ]; then set -a; . ./.env; set +a; fi

{
  echo "=== $(date -Iseconds) inicio (pid $$)"
  "$NODE" scripts/fetch.mjs || { echo "fetch FALLO"; exit 1; }
  python3 tools/recomienda.py || echo "recomienda FALLO"
  "$NODE" scripts/build.mjs || { echo "build FALLO"; exit 1; }
  "$NODE" scripts/snapshot.mjs || echo "snapshot FALLO"
  "$NODE" scripts/telegram.mjs || echo "telegram FALLO"
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    npx --yes wrangler pages deploy dist --project-name=valorcarta --commit-dirty=true || echo "deploy FALLO"
  else
    echo "sin CLOUDFLARE_API_TOKEN: build local, no se publica"
  fi
  echo "=== $(date -Iseconds) fin"
} >> "$LOG" 2>&1

find logs -name 'auto-*.log' -mtime +30 -delete 2>/dev/null
