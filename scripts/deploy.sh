#!/bin/bash
# Roda DENTRO da EC2, disparado via SSH pelo GitHub Actions (.github/workflows/deploy.yml).
# Atualiza o código, reinstala deps, recarrega o PM2 e confere o /health.
# Se o healthcheck falhar, volta pro commit anterior automaticamente.

set -uo pipefail

APP_DIR="$HOME/calendar-agent-whatsapp"
REPO_URL="https://github.com/KhaiDreams/IA-calendar-agent-telegram.git"
HEALTH_URL="http://localhost:3002/health"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Repo não encontrado em $APP_DIR, clonando..."
  git clone "$REPO_URL" "$APP_DIR" || exit 1
fi

cd "$APP_DIR" || exit 1

PREV_COMMIT=$(git rev-parse HEAD)
echo "Commit atual antes do deploy: $PREV_COMMIT"

git fetch origin main || { echo "git fetch falhou"; exit 1; }
git reset --hard origin/main || { echo "git reset falhou"; exit 1; }

echo "Instalando dependências..."
npm ci || { echo "npm ci falhou"; exit 1; }

mkdir -p logs data

echo "Recarregando PM2..."
pm2 startOrReload ecosystem.config.cjs --update-env

echo "Aguardando healthcheck..."
for i in 1 2 3 4 5 6 7 8; do
  sleep 3
  if curl -sf "$HEALTH_URL" > /dev/null; then
    echo "Healthcheck OK. Deploy concluído em $(git rev-parse HEAD)."
    exit 0
  fi
  echo "Tentativa $i sem sucesso, tentando de novo..."
done

echo "Healthcheck FALHOU. Revertendo pro commit anterior: $PREV_COMMIT"
git reset --hard "$PREV_COMMIT"
npm ci
pm2 startOrReload ecosystem.config.cjs --update-env
echo "Rollback concluído. Deploy FALHOU."
exit 1
