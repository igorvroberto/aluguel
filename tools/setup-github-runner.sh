#!/usr/bin/env bash
# Instala o GitHub Actions runner em /opt/radar-imoveis/actions-runner (uma vez na VPS).
# config.sh NÃO pode rodar como root — use este script (cria usuário radar-imoveis-runner).
#
# Uso (como root na VPS):
#   bash tools/setup-github-runner.sh SEU_TOKEN
#
# Token: GitHub → aluguel → Settings → Actions → Runners → New self-hosted runner
#
set -euo pipefail

TOKEN="${1:-}"
ROOT="/opt/radar-imoveis"
RUNNER_DIR="${ROOT}/actions-runner"
RUNNER_USER="${RUNNER_USER:-radar-imoveis-runner}"
RUNNER_NAME="${RUNNER_NAME:-radar-imoveis-vps}"
RUNNER_LABELS="${RUNNER_LABELS:-radar-imoveis,self-hosted,Linux,X64}"
RUNNER_VERSION="${RUNNER_VERSION:-2.329.0}"
SUDOERS="/etc/sudoers.d/radar-imoveis-runner-deploy"
REPO_URL="https://github.com/igorvroberto/aluguel"

if [[ -z "$TOKEN" ]]; then
  echo "Uso: $0 <registration-token>"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode como root: sudo bash $0 <token>"
  exit 1
fi

if [[ ! -d "$ROOT/.git" ]]; then
  echo "ERRO: $ROOT não é um clone git"
  exit 1
fi

if ! id "$RUNNER_USER" &>/dev/null; then
  echo "=== criando usuário ${RUNNER_USER} ==="
  useradd --system --home-dir "$RUNNER_DIR" --create-home --shell /bin/bash "$RUNNER_USER"
fi

if getent group docker &>/dev/null; then
  usermod -aG docker "$RUNNER_USER"
fi

mkdir -p "$RUNNER_DIR"
chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

if [[ ! -f "$RUNNER_DIR/config.sh" ]]; then
  echo "=== baixando actions-runner v${RUNNER_VERSION} ==="
  curl -fsSL -o "$RUNNER_DIR/actions-runner.tar.gz" \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  tar xzf "$RUNNER_DIR/actions-runner.tar.gz" -C "$RUNNER_DIR"
  rm -f "$RUNNER_DIR/actions-runner.tar.gz"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"
fi

echo "=== configurando runner ${RUNNER_NAME} (usuário ${RUNNER_USER}) ==="
sudo -u "$RUNNER_USER" bash -c "cd '$RUNNER_DIR' && ./config.sh \
  --url '$REPO_URL' \
  --token '$TOKEN' \
  --name '$RUNNER_NAME' \
  --labels '$RUNNER_LABELS' \
  --work '_work' \
  --unattended \
  --replace"

echo "=== sudo sem senha só para deploy.sh ==="
printf '%s ALL=(root) NOPASSWD: %s/tools/deploy.sh\n' "$RUNNER_USER" "$ROOT" > "$SUDOERS"
chmod 440 "$SUDOERS"

echo "=== serviço systemd ==="
cd "$RUNNER_DIR"
./svc.sh install "$RUNNER_USER"
./svc.sh start
./svc.sh status

echo
echo "OK. Runner ${RUNNER_NAME} ativo em ${RUNNER_DIR}."
echo "Reexecute o workflow em GitHub → Actions → Deploy VPS → Re-run."
