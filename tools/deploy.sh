#!/usr/bin/env bash
# Atualiza Imóveis Radar em /opt/radar-imoveis (VPS Liganer, ao lado de /opt/imoveis).
set -euo pipefail

ROOT="${RADAR_IMOVEIS_ROOT:-/opt/radar-imoveis}"
REF="${RADAR_IMOVEIS_REF:-main}"

if [[ ! -w "${ROOT}/.git" || ! -w "${ROOT}" ]] && [[ "$(id -u)" -ne 0 ]]; then
  # Sem VAR=value no sudo: o sudoers da VPS bloqueia setar env na linha de comando.
  # Defaults de ROOT/REF (/opt/radar-imoveis + main) bastam no deploy de produção.
  exec sudo -n "$0"
fi

cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERRO: falta ${ROOT}/.env (copie de .env.example e preencha os tokens)"
  exit 1
fi

echo "=== radar-imoveis deploy ref=${REF} ==="
before="$(git rev-parse HEAD)"
git fetch origin "$REF"
git checkout "$REF"
git pull --ff-only origin "$REF"
after="$(git rev-parse HEAD)"

# Garante Traefik dinâmico (idempotente)
if [[ -d /opt/traefik/dynamic ]]; then
  install -m 0644 deploy/traefik/radar-imoveis.yml /opt/traefik/dynamic/radar-imoveis.yml
  echo "=== traefik dynamic atualizado ==="
else
  echo "WARN: /opt/traefik/dynamic não encontrado — configure o proxy manualmente"
fi

# Rebuild só quando muda o que entra na imagem Next.js.
# tools/ .github/ deploy/ docs → skip (igual espírito do imoveis: deploy leve).
# Force: RADAR_IMOVEIS_FORCE_BUILD=1
need_build=1
if [[ "${RADAR_IMOVEIS_FORCE_BUILD:-}" == "1" ]]; then
  echo "=== force build (RADAR_IMOVEIS_FORCE_BUILD=1) ==="
elif [[ "$before" == "$after" ]]; then
  need_build=0
  echo "=== skip build (HEAD já em ${after:0:7}) ==="
else
  changed="$(git diff --name-only "$before" "$after" || true)"
  if [[ -z "$changed" ]]; then
    need_build=0
    echo "=== skip build (sem arquivos no diff) ==="
  elif ! echo "$changed" | grep -qvE '^(tools/|\.github/|deploy/|.*\.md$|\.gitignore$)'; then
    need_build=0
    echo "=== skip build (só tools/ci/docs/deploy) ==="
    echo "$changed" | sed 's/^/  - /'
  else
    echo "=== app mudou — rebuild ==="
    echo "$changed" | sed 's/^/  - /'
  fi
fi

if [[ "$need_build" == "1" ]]; then
  echo "=== docker compose build ==="
  docker compose build web
  echo "=== docker compose up ==="
  docker compose up -d web
else
  # Garante container no ar sem rebuild (~segundos).
  docker compose up -d web >/dev/null
fi

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
