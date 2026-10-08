#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/theimhtikesoe/thuthayatethar.git"
BRANCH="feat/telegram-pdf-reader"
REPO_DIR="${REPO_DIR:-/opt/thuthayatethar}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/telegram-local-bot-api}"
TOKEN_FILE="$COMPOSE_DIR/tunnel-token"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root (for example: sudo bash $0)." >&2
  exit 1
fi
command -v git >/dev/null || { echo "git is required." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null
[[ -f "$COMPOSE_DIR/compose.yaml" ]] || { echo "Expected existing Compose file: $COMPOSE_DIR/compose.yaml" >&2; exit 1; }
[[ -f "$COMPOSE_DIR/.env" ]] || { echo "Expected existing $COMPOSE_DIR/.env; refusing to replace existing Telegram API settings." >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -Fxq 'telegram-local-bot-api' || { echo "telegram-local-bot-api is not running; no changes made." >&2; exit 1; }
docker volume inspect telegram-local-bot-api_telegram-bot-api-data >/dev/null || { echo "Expected Local Bot API data volume is missing; no changes made." >&2; exit 1; }

if [[ -d "$REPO_DIR/.git" ]]; then
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
    echo "Repository at $REPO_DIR has local changes; refusing to overwrite them." >&2
    exit 1
  fi
  git -C "$REPO_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$REPO_DIR" checkout -B "$BRANCH" FETCH_HEAD
elif [[ -e "$REPO_DIR" ]]; then
  echo "$REPO_DIR exists but is not a Git repository; refusing to overwrite it." >&2
  exit 1
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

install -d -m 700 "$COMPOSE_DIR"
install -m 600 "$REPO_DIR/infra/vps/compose.override.yaml.example" "$COMPOSE_DIR/compose.override.yaml"

printf '%s\n' "A Cloudflare Tunnel connector token will be saved locally with mode 600." \
  "Retrieve it in Cloudflare Dashboard > Networking > Tunnels > thuthayatethar-pdf-relay > Add a replica." \
  "Paste only the token value; input will not be displayed. Do not send it in chat."
read -r -s -p "Tunnel token: " tunnel_token
printf '\n'
if [[ -z "$tunnel_token" ]]; then
  echo "No token entered; stopping before starting the Tunnel." >&2
  exit 1
fi
umask 077
tmp_token_file="$(mktemp "$COMPOSE_DIR/.tunnel-token.XXXXXX")"
printf '%s\n' "$tunnel_token" > "$tmp_token_file"
unset tunnel_token
chmod 600 "$tmp_token_file"
mv -f "$tmp_token_file" "$TOKEN_FILE"

cd "$COMPOSE_DIR"
docker compose up -d --build pdf-relay
docker compose --profile tunnel up -d cloudflared

relay_healthy=false
for _ in $(seq 1 30); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' pdf-relay 2>/dev/null || true)"
  if [[ "$health" == "healthy" ]]; then
    relay_healthy=true
    break
  fi
  sleep 1
done
if [[ "$relay_healthy" != true ]]; then
  docker compose ps pdf-relay cloudflared
  echo "Relay did not become healthy; inspect its container logs before continuing." >&2
  exit 1
fi

echo "Relay and Tunnel containers are started. The bot session/webhook was not changed."
docker compose ps pdf-relay cloudflared
