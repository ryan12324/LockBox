#!/usr/bin/env bash
#
# 1-click deploy for the Lockbox API backend to Cloudflare Workers.
#
# Prerequisites:
#   - bun installed (https://bun.sh)
#   - wrangler authenticated: `bunx wrangler login`
#
# Usage:
#   ./scripts/deploy-backend.sh
#
set -euo pipefail

# Ensure bun is in PATH (common install location)
export PATH="$HOME/.bun/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WRANGLER="bunx wrangler"

# ── Colors ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Preflight checks ─────────────────────────────────────────────────
command -v bun  >/dev/null 2>&1 || fail "bun is required. Install: https://bun.sh"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Lockbox API — Deploy to Cloudflare    ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Check wrangler auth ───────────────────────────────────────────
info "Checking Cloudflare authentication..."
if ! $WRANGLER whoami >/dev/null 2>&1; then
  warn "Not logged in to Cloudflare. Starting login..."
  $WRANGLER login
fi
ok "Authenticated with Cloudflare"

# ── 2. Install dependencies ──────────────────────────────────────────
info "Installing dependencies..."
cd "$ROOT_DIR"
bun install
ok "Dependencies installed"

# ── 3. Build shared packages ─────────────────────────────────────────
info "Building packages..."
bun run build
ok "Packages built"

# ── 4. Create D1 database (idempotent) ───────────────────────────────
info "Ensuring D1 database exists..."
DB_NAME="lockbox-vault"

# Check if database already exists
if $WRANGLER d1 list 2>/dev/null | grep -q "$DB_NAME"; then
  ok "D1 database '$DB_NAME' already exists"
else
  info "Creating D1 database '$DB_NAME'..."
  DB_OUTPUT=$($WRANGLER d1 create "$DB_NAME" 2>&1)
  echo "$DB_OUTPUT"

  # Extract database ID and update wrangler.toml
  DB_ID=$(echo "$DB_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+' || true)
  if [ -n "$DB_ID" ]; then
    sed -i "s/placeholder-replace-at-deploy/$DB_ID/" "$API_DIR/wrangler.toml"
    ok "D1 database created (ID: $DB_ID)"
    ok "Updated wrangler.toml with database ID"
  else
    warn "Could not parse database ID — update apps/api/wrangler.toml manually"
  fi
fi

# ── 5. Apply migrations ──────────────────────────────────────────────
info "Applying D1 migrations..."
cd "$API_DIR"
$WRANGLER d1 migrations apply "$DB_NAME" --remote
ok "Migrations applied"

# ── 6. Deploy ────────────────────────────────────────────────────────
info "Deploying Worker..."
DEPLOY_OUTPUT=$($WRANGLER deploy 2>&1)
echo "$DEPLOY_OUTPUT"
ok "Worker deployed"

# ── 7. Print summary ─────────────────────────────────────────────────
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[^\s]+workers\.dev' || true)

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Deploy complete!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$WORKER_URL" ]; then
  echo -e "  API URL: ${CYAN}${WORKER_URL}${NC}"
  echo ""
  echo -e "  ${YELLOW}Next steps:${NC}"
  echo -e "  Set this as your API URL when building the web vault or extension:"
  echo -e "  ${CYAN}VITE_API_URL=${WORKER_URL} bun run build${NC}  (in apps/web)"
else
  echo -e "  ${YELLOW}Check the deploy output above for your Worker URL.${NC}"
  echo -e "  Then set VITE_API_URL to that URL when building the web vault."
fi
echo ""
