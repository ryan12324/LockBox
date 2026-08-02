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
LOCKBOX_CORS_ORIGINS="${LOCKBOX_CORS_ORIGINS:-https://authwell.app,https://www.authwell.app,https://vault.authwell.app,https://lockbox-web.pages.dev,http://localhost:5173,http://localhost:3000,https://localhost}"
LOCKBOX_EXTENSION_IDS="${LOCKBOX_EXTENSION_IDS:-}"
LOCKBOX_REGISTRATION_ENABLED="${LOCKBOX_REGISTRATION_ENABLED:-true}"
R2_BUCKET_NAME="lockbox-attachments"
LOCKBOX_TOTP_ENCRYPTION_KEY="${LOCKBOX_TOTP_ENCRYPTION_KEY:-}"
LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS="${LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS:-}"
TOTP_SECRETS_FILE=""

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

cleanup() {
  if [ -n "$TOTP_SECRETS_FILE" ] && [ -f "$TOTP_SECRETS_FILE" ]; then
    rm -f -- "$TOTP_SECRETS_FILE"
  fi
}
trap cleanup EXIT

validate_totp_encryption_key() {
  LOCKBOX_KEY_TO_VALIDATE="$1" bun -e '
    const value = process.env.LOCKBOX_KEY_TO_VALIDATE ?? "";
    const decoded = Buffer.from(value, "base64");
    if (decoded.byteLength !== 32 || decoded.toString("base64") !== value) process.exit(1);
  '
}

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
bun install --frozen-lockfile
ok "Dependencies installed"

# ── 3. Build shared packages ─────────────────────────────────────────
info "Building packages..."
bun run build
ok "Packages built"

# ── 4. Create D1 database (idempotent) ───────────────────────────────
info "Ensuring D1 database exists..."
DB_NAME="lockbox-vault"

find_database_id() {
  $WRANGLER d1 list --json | LOCKBOX_DB_NAME="$DB_NAME" bun -e '
    const parsed = JSON.parse(await Bun.stdin.text());
    const databases = Array.isArray(parsed) ? parsed : (parsed.result ?? []);
    const database = databases.find((entry) => entry.name === process.env.LOCKBOX_DB_NAME);
    const id = database?.uuid ?? database?.id ?? database?.database_id;
    if (id) console.log(id);
  '
}

DB_ID=$(find_database_id)
if [ -n "$DB_ID" ]; then
  ok "D1 database '$DB_NAME' already exists"
else
  info "Creating D1 database '$DB_NAME'..."
  DB_OUTPUT=$($WRANGLER d1 create "$DB_NAME" 2>&1)
  echo "$DB_OUTPUT"
  DB_ID=$(find_database_id)
fi

if [ -z "$DB_ID" ]; then
  fail "Could not resolve the D1 database ID after creation"
fi

# Keep wrangler.toml aligned even when the database already existed. Writing via
# a sibling temporary file works on both BSD/macOS and GNU/Linux sed.
LOCKBOX_CONFIG_TMP=$(mktemp "${API_DIR}/wrangler.toml.XXXXXX")
sed -E 's|(database_id[[:space:]]*=[[:space:]]*")[^"]*(")|\1'"$DB_ID"'\2|' \
  "$API_DIR/wrangler.toml" > "$LOCKBOX_CONFIG_TMP"
mv "$LOCKBOX_CONFIG_TMP" "$API_DIR/wrangler.toml"
ok "Configured D1 database ID: $DB_ID"

# ── 5. Create R2 bucket (idempotent) ─────────────────────────────────
info "Ensuring R2 bucket exists..."
cd "$API_DIR"
if $WRANGLER r2 bucket info "$R2_BUCKET_NAME" --json >/dev/null 2>&1; then
  ok "R2 bucket '$R2_BUCKET_NAME' already exists"
else
  info "Creating R2 bucket '$R2_BUCKET_NAME'..."
  $WRANGLER r2 bucket create "$R2_BUCKET_NAME"
  ok "R2 bucket created"
fi

# ── 6. Apply migrations ──────────────────────────────────────────────
info "Applying D1 migrations..."
$WRANGLER d1 migrations apply "$DB_NAME" --remote
ok "Migrations applied"

# ── 7. Deploy ────────────────────────────────────────────────────────
info "Deploying Worker..."
DEPLOY_SECRET_ARGS=()
if [ -n "$LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS" ] && [ -z "$LOCKBOX_TOTP_ENCRYPTION_KEY" ]; then
  fail "LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS requires LOCKBOX_TOTP_ENCRYPTION_KEY"
fi

if [ -n "$LOCKBOX_TOTP_ENCRYPTION_KEY" ]; then
  validate_totp_encryption_key "$LOCKBOX_TOTP_ENCRYPTION_KEY" \
    || fail "LOCKBOX_TOTP_ENCRYPTION_KEY must be exactly 32 random bytes encoded as Base64"
  if [ -n "$LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS" ]; then
    validate_totp_encryption_key "$LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS" \
      || fail "LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS must be exactly 32 random bytes encoded as Base64"
  fi

  umask 077
  TOTP_SECRETS_FILE=$(mktemp "${TMPDIR:-/tmp}/lockbox-worker-secrets.XXXXXX")
  printf 'TOTP_ENCRYPTION_KEY=%s\n' "$LOCKBOX_TOTP_ENCRYPTION_KEY" > "$TOTP_SECRETS_FILE"
  if [ -n "$LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS" ]; then
    printf 'TOTP_ENCRYPTION_KEY_PREVIOUS=%s\n' \
      "$LOCKBOX_TOTP_ENCRYPTION_KEY_PREVIOUS" >> "$TOTP_SECRETS_FILE"
  fi
  DEPLOY_SECRET_ARGS=(--secrets-file "$TOTP_SECRETS_FILE")
else
  if ! $WRANGLER secret list --format json \
    | bun -e '
        const parsed = JSON.parse(await Bun.stdin.text());
        const secrets = Array.isArray(parsed) ? parsed : (parsed.result ?? []);
        process.exit(secrets.some((entry) => entry.name === "TOTP_ENCRYPTION_KEY") ? 0 : 1);
      '; then
    fail "Set LOCKBOX_TOTP_ENCRYPTION_KEY for the first deployment (generate it with: openssl rand -base64 32)"
  fi
fi

DEPLOY_OUTPUT=$(
  $WRANGLER deploy \
    "${DEPLOY_SECRET_ARGS[@]}" \
    --var "CORS_ORIGINS:${LOCKBOX_CORS_ORIGINS}" \
    --var "EXTENSION_IDS:${LOCKBOX_EXTENSION_IDS}" \
    --var "REGISTRATION_ENABLED:${LOCKBOX_REGISTRATION_ENABLED}" \
    2>&1
)
echo "$DEPLOY_OUTPUT"
ok "Worker deployed"

# ── 8. Print summary ─────────────────────────────────────────────────
WORKER_URL=$(printf '%s\n' "$DEPLOY_OUTPUT" \
  | sed -nE 's|.*(https://[^[:space:]]+\.workers\.dev).*|\1|p' \
  | sed -n '1p')

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
