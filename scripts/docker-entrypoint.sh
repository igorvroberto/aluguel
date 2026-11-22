#!/bin/sh
set -eu

DATA_DIR="${APARTMENTS_DATA_DIR:-/app/data}"
SEED_DIR="${APARTMENTS_SEED_DIR:-/app/data-seed}"
TARGET="${APARTMENTS_DATA_PATH:-${DATA_DIR}/apartments.json}"

mkdir -p "$(dirname "$TARGET")"

if [ ! -f "$TARGET" ] || [ ! -s "$TARGET" ]; then
  if [ -f "${SEED_DIR}/apartments.json" ]; then
    echo "seed: copiando apartments.json inicial para ${TARGET}"
    cp "${SEED_DIR}/apartments.json" "$TARGET"
  fi
fi

# Volume antigo pode ter imóveis sem link de anúncio; preenche a partir do seed.
if [ -f "${SEED_DIR}/apartments.json" ] && [ -f "$TARGET" ] && [ -f /app/scripts/sync-seed-urls.mjs ]; then
  node /app/scripts/sync-seed-urls.mjs || echo "seed-urls: sync falhou (seguindo)"
fi

chown -R nextjs:nodejs "$(dirname "$TARGET")" 2>/dev/null || true

if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1; then
  exec su-exec nextjs "$@"
fi

exec "$@"
