#!/usr/bin/env bash
# Atualiza Imóveis Radar em /opt/radar-imoveis (VPS Liganer, ao lado de /opt/imoveis).
set -euo pipefail

ROOT="${RADAR_IMOVEIS_ROOT:-/opt/radar-imoveis}"
REF="${RADAR_IMOVEIS_REF:-main}"

if [[ ! -w "${ROOT}/.git" || ! -w "${ROOT}" ]] && [[ "$(id -u)" -ne 0 ]]; then
  # VAR=value antes do comando casa com o sudoers (NOPASSWD: .../tools/deploy.sh).
  exec sudo -n RADAR_IMOVEIS_ROOT="$ROOT" RADAR_IMOVEIS_REF="$REF" "$0"
fi

cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERRO: falta ${ROOT}/.env (copie de .env.example e preencha os tokens)"
  exit 1
fi

echo "=== radar-imoveis deploy ref=${REF} ==="
git fetch origin "$REF"
git checkout "$REF"
git pull --ff-only origin "$REF"

# Garante Traefik dinâmico (idempotente)
if [[ -d /opt/traefik/dynamic ]]; then
  install -m 0644 deploy/traefik/radar-imoveis.yml /opt/traefik/dynamic/radar-imoveis.yml
  echo "=== traefik dynamic atualizado ==="
else
  echo "WARN: /opt/traefik/dynamic não encontrado — configure o proxy manualmente"
fi

echo "=== docker compose build ==="
docker compose build web

echo "=== docker compose up ==="
docker compose up -d web

echo "=== healthcheck ==="
ok=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:18090/" >/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" != "1" ]]; then
  echo "ERRO: app não respondeu em 127.0.0.1:18090"
  docker compose logs --tail=80 web || true
  exit 1
fi

echo "=== deploy ok → https://radar.liganer.com.br (após DNS) ==="
