#!/usr/bin/env bash
#
# 1-click deploy for the Lockbox Web Vault to Cloudflare Pages.
#
# Prerequisites:
#   - bun installed (https://bun.sh)
#   - wrangler authenticated: `bunx wrangler login`
#   - API already deployed (you need the API URL)
#
# Usage:
#   ./scripts/deploy-web.sh
#   VITE_API_URL=https://lockbox-api.example.workers.dev ./scripts/deploy-web.sh
#
set -euo pipefail

# Ensure bun is in PATH (common install location)
export PATH="$HOME/.bun/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
WRANGLER="bunx wrangler"
PROJECT_NAME="lockbox-web"

# ── Colors ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Preflight checks ─────────────────────────────────────────────────
command -v bun >/dev/null 2>&1 || fail "bun is required. Install: https://bun.sh"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Lockbox Web Vault — Deploy to Pages     ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Check wrangler auth ───────────────────────────────────────────
info "Checking Cloudflare authentication..."
if ! $WRANGLER whoami >/dev/null 2>&1; then
  warn "Not logged in to Cloudflare. Starting login..."
  $WRANGLER login
fi
ok "Authenticated with Cloudflare"

# ── 2. Resolve API URL ──────────────────────────────────────────────
if [ -z "${VITE_API_URL:-}" ]; then
  # Check for .env.local at repo root
  if [ -f "$ROOT_DIR/.env.local" ]; then
    FOUND_URL=$(grep -oP '^VITE_API_URL=\K.+' "$ROOT_DIR/.env.local" 2>/dev/null || true)
    if [ -n "$FOUND_URL" ]; then
      export VITE_API_URL="$FOUND_URL"
      ok "Using API URL from .env.local: ${CYAN}${VITE_API_URL}${NC}"
    fi
  fi
fi

if [ -z "${VITE_API_URL:-}" ]; then
  echo ""
  echo -e "  ${YELLOW}The web vault needs your API URL to connect to the backend.${NC}"
  echo -e "  This is the URL printed when you ran ${CYAN}bun run deploy:api${NC}."
  echo ""
  read -rp "  Enter your API URL (e.g. https://lockbox-api.xxx.workers.dev): " VITE_API_URL
  echo ""

  if [ -z "$VITE_API_URL" ]; then
    fail "API URL is required. Deploy the API first: bun run deploy:api"
  fi

  export VITE_API_URL
fi

# Validate URL format
if [[ ! "$VITE_API_URL" =~ ^https:// ]]; then
  fail "API URL must start with https://"
fi

ok "API URL: ${CYAN}${VITE_API_URL}${NC}"

# ── 3. Install dependencies ──────────────────────────────────────────
info "Installing dependencies..."
cd "$ROOT_DIR"
bun install
ok "Dependencies installed"

# ── 4. Build everything ──────────────────────────────────────────────
info "Building web vault (and shared packages)..."
bun run build
ok "Build complete"

# ── 5. Deploy to Cloudflare Pages ────────────────────────────────────
info "Deploying to Cloudflare Pages..."
cd "$WEB_DIR"
if ! DEPLOY_OUTPUT=$($WRANGLER pages deploy dist --project-name="$PROJECT_NAME" 2>&1); then
  echo "$DEPLOY_OUTPUT"
  fail "Pages deploy failed. See output above."
fi
echo "$DEPLOY_OUTPUT"
ok "Deployed to Cloudflare Pages"

# ── 6. Print summary ────────────────────────────────────────────────
PAGES_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[^\s]+\.pages\.dev' | head -1 || true)

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Deploy complete!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$PAGES_URL" ]; then
  echo -e "  Web Vault: ${CYAN}${PAGES_URL}${NC}"
  echo -e "  API:       ${CYAN}${VITE_API_URL}${NC}"
else
  echo -e "  ${YELLOW}Check the deploy output above for your Pages URL.${NC}"
  echo -e "  It will be: ${CYAN}https://${PROJECT_NAME}.pages.dev${NC}"
fi
echo ""
echo -e "  ${BOLD}Tip:${NC} Save the API URL for next time:"
echo -e "  ${CYAN}echo \"VITE_API_URL=${VITE_API_URL}\" > .env.local${NC}"
echo ""
