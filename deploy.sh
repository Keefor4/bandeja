#!/usr/bin/env bash
# deploy.sh — pull latest, build frontend, restart containers
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${CYAN}▸ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
error()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── Pre-flight checks ──────────────────────────────────────────────────────────
[ -f .env ] || error ".env not found. Copy .env.example → .env and fill in values."
command -v pnpm  >/dev/null 2>&1 || error "pnpm not found. Install: npm i -g pnpm"
command -v docker >/dev/null 2>&1 || error "Docker not found."

# Load env vars (needed for VITE_* during frontend build)
set -o allexport
# shellcheck disable=SC1091
source .env
set +o allexport

# Validate required vars
for var in FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY \
           ANTHROPIC_API_KEY BANDEJA_STORAGE_PATH \
           VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
           VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID; do
  [ -n "${!var:-}" ] || error "Missing required env var: $var"
done

# Ensure storage path exists
mkdir -p "$BANDEJA_STORAGE_PATH/renders"
success "Storage path: $BANDEJA_STORAGE_PATH"

# ── Pull latest code ───────────────────────────────────────────────────────────
info "Pulling latest from git..."
git pull origin master
success "Code up to date"

# ── Install dependencies ───────────────────────────────────────────────────────
info "Installing dependencies..."
pnpm install --frozen-lockfile
success "Dependencies installed"

# ── Build frontend ─────────────────────────────────────────────────────────────
# Copy root .env to web package so Vite picks up VITE_* vars
info "Building frontend..."
cp .env apps/web/.env.local
(cd apps/web && pnpm build)
rm -f apps/web/.env.local
success "Frontend built → apps/web/dist/"

# ── Docker containers ──────────────────────────────────────────────────────────
info "Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build
success "Containers started"

# ── Done ───────────────────────────────────────────────────────────────────────
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Bandeja deployed!${NC}"
echo -e "  App:    http://${IP}"
echo -e "  Health: http://${IP}/api/health"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
