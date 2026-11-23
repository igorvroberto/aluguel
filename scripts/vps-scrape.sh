#!/usr/bin/env bash
# Scrape completo na VPS via imagem Playwright (host sem Node).
# Uso:
#   bash scripts/vps-scrape.sh
#   SCRAPE_SKIP_PORTALS=quintoandar,chavesnamao bash scripts/vps-scrape.sh
#   SCRAPE_ONLY_PORTALS=vivareal,zapimoveis,imovelweb bash scripts/vps-scrape.sh
#
# Grava no volume Docker do app (não apaga existentes — só acrescenta por URL).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERRO: falta .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env
set +a

VOL_DATA="/var/lib/docker/volumes/radar_imoveis_apartments_data/_data/apartments.json"
HOST_DATA="${ROOT}/data/apartments.json"
mkdir -p "${ROOT}/data"

if [[ -f "$VOL_DATA" ]]; then
  echo "=== sync volume → host data (base atual) ==="
  cp -a "$VOL_DATA" "$HOST_DATA"
fi

echo "=== scrape (skip=${SCRAPE_SKIP_PORTALS:-} only=${SCRAPE_ONLY_PORTALS:-}) ==="

docker run --rm -i \
  --network host \
  -e SCRAPE_PROXY_URL \
  -e NEXT_PUBLIC_MAPBOX_TOKEN \
  -e SCRAPE_SKIP_PORTALS \
  -e SCRAPE_ONLY_PORTALS \
  -e DISPLAY \
  -v "$ROOT:/work" \
  -v "$VOL_DATA:/work/data/apartments.json" \
  -w /work \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  bash -lc 'npm ci --omit=dev=false 2>/dev/null || npm install --no-save playwright tsx dotenv @turf/turf cheerio; xvfb-run -a npx tsx scripts/scrape-now.ts'

# Espelho no checkout (backup local)
if [[ -f "$VOL_DATA" ]]; then
  cp -a "$VOL_DATA" "$HOST_DATA"
fi

echo "=== ok — dados em volume + ${HOST_DATA} ==="
