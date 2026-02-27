#!/usr/bin/env bash
#
# Lockbox Self-Hosted Relay Setup
# Sets up a Cloudflare Tunnel to expose your local Lockbox API.
#
# Prerequisites:
#   - cloudflared installed (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
#   - Cloudflare account
#
# Usage:
#   ./scripts/setup-tunnel.sh [tunnel-name]
#
set -euo pipefail

TUNNEL_NAME="${1:-lockbox-relay}"
CONFIG_DIR="$HOME/.lockbox"
RELAY_CONFIG="$CONFIG_DIR/relay.json"
TUNNEL_CONFIG="$CONFIG_DIR/tunnel.yml"
LOCAL_API_PORT="${LOCKBOX_API_PORT:-8787}"
LOCAL_API_URL="https://localhost:${LOCAL_API_PORT}"

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

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Lockbox Relay — Cloudflare Tunnel Setup ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Preflight checks ──────────────────────────────────────────────
command -v cloudflared >/dev/null 2>&1 || fail "cloudflared is required. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"

# ── 2. Ensure config directory exists ─────────────────────────────────
mkdir -p "$CONFIG_DIR"
ok "Config directory: $CONFIG_DIR"

# ── 3. Authenticate with Cloudflare (if needed) ──────────────────────
info "Checking Cloudflare authentication..."
if ! cloudflared tunnel list >/dev/null 2>&1; then
  warn "Not logged in to Cloudflare. Starting login..."
  cloudflared tunnel login
fi
ok "Authenticated with Cloudflare"

# ── 4. Create tunnel (idempotent) ────────────────────────────────────
info "Checking for existing tunnel '$TUNNEL_NAME'..."
EXISTING_TUNNEL=$(cloudflared tunnel list --output json 2>/dev/null | grep -o "\"id\":\"[^\"]*\"" | head -1 || true)

if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null \
    | python3 -c "import sys,json; tunnels=json.load(sys.stdin); print(next(t['id'] for t in tunnels if t['name']=='$TUNNEL_NAME'))" 2>/dev/null || true)
  if [ -n "$TUNNEL_ID" ]; then
    ok "Tunnel '$TUNNEL_NAME' already exists (ID: $TUNNEL_ID)"
  else
    warn "Tunnel '$TUNNEL_NAME' found but could not parse ID"
    TUNNEL_ID=""
  fi
else
  info "Creating tunnel '$TUNNEL_NAME'..."
  CREATE_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
  echo "$CREATE_OUTPUT"
  TUNNEL_ID=$(echo "$CREATE_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
  if [ -n "$TUNNEL_ID" ]; then
    ok "Tunnel created (ID: $TUNNEL_ID)"
  else
    warn "Tunnel created but could not parse ID from output"
  fi
fi

# ── 5. Write tunnel configuration ────────────────────────────────────
info "Writing tunnel configuration..."

cat > "$TUNNEL_CONFIG" <<EOF
tunnel: ${TUNNEL_ID:-TUNNEL_ID_HERE}
credentials-file: $HOME/.cloudflared/${TUNNEL_ID:-TUNNEL_ID_HERE}.json

ingress:
  - hostname: lockbox.local
    service: http://localhost:${LOCAL_API_PORT}
  - service: http_status:404
EOF

ok "Tunnel config written to $TUNNEL_CONFIG"

# ── 6. Write relay configuration ─────────────────────────────────────
info "Writing relay configuration..."

TUNNEL_HOSTNAME=""
if [ -n "${TUNNEL_ID:-}" ]; then
  TUNNEL_HOSTNAME="${TUNNEL_ID}.cfargotunnel.com"
fi

cat > "$RELAY_CONFIG" <<EOF
{
  "localUrl": "${LOCAL_API_URL}",
  "publicUrl": "",
  "tunnelId": "${TUNNEL_ID:-}",
  "tunnelName": "${TUNNEL_NAME}",
  "preferLocal": true,
  "healthCheckIntervalMs": 30000
}
EOF

ok "Relay config written to $RELAY_CONFIG"

# ── 7. Print summary ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Tunnel setup complete!            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Tunnel name:  ${CYAN}${TUNNEL_NAME}${NC}"
echo -e "  Tunnel ID:    ${CYAN}${TUNNEL_ID:-unknown}${NC}"
echo -e "  Config dir:   ${CYAN}${CONFIG_DIR}${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo ""
echo -e "  1. Start the tunnel:"
echo -e "     ${CYAN}cloudflared tunnel --config $TUNNEL_CONFIG run $TUNNEL_NAME${NC}"
echo ""
echo -e "  2. (Optional) Route a domain to the tunnel:"
echo -e "     ${CYAN}cloudflared tunnel route dns $TUNNEL_NAME lockbox.yourdomain.com${NC}"
echo ""
echo -e "  3. Update ${CYAN}$RELAY_CONFIG${NC} with your public URL if using a custom domain."
echo ""
echo -e "  4. Start your Lockbox API locally:"
echo -e "     ${CYAN}cd apps/api && bun run dev${NC}"
echo ""
