#!/usr/bin/env bash
# Roda o teste Imovelweb numa imagem Node+Playwright (host da VPS não tem npx).
# Uso (na VPS, em /opt/radar-imoveis, com .env já tendo SCRAPE_PROXY_URL):
#   bash scripts/vps-test-imovelweb.sh
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

if [[ -z "${SCRAPE_PROXY_URL:-}" ]]; then
  echo "ERRO: SCRAPE_PROXY_URL vazio no .env"
  exit 1
fi

echo "proxy=${SCRAPE_PROXY_URL//:*@/:***@}"
echo "=== docker playwright firefox + test-imovelweb-scrape ==="

docker run --rm -i \
  --network host \
  -e SCRAPE_PROXY_URL \
  -v "$ROOT:/work" \
  -w /work \
  mcr.microsoft.com/playwright:v1.49.1-jammy \
  bash -lc 'npm ci --omit=dev=false 2>/dev/null || npm install --no-save playwright tsx dotenv; npx tsx scripts/test-imovelweb-scrape.ts'
