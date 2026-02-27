#!/usr/bin/env bash
#
# Build Lockbox Android app (debug APK or release AAB).
#
# Prerequisites:
#   - bun installed (https://bun.sh)
#   - Java 17+ (JAVA_HOME set)
#   - Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT set)
#
# Usage:
#   ./scripts/build-android.sh              # debug APK
#   ./scripts/build-android.sh release      # release AAB (unsigned unless env vars set)
#   ./scripts/build-android.sh release sign # release AAB with keystore from env
#
# Signing env vars (for release):
#   LOCKBOX_KEYSTORE_FILE      — path to .jks keystore
#   LOCKBOX_KEYSTORE_PASSWORD  — keystore password
#   LOCKBOX_KEY_ALIAS          — key alias
#   LOCKBOX_KEY_PASSWORD       — key password
#
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
ANDROID_DIR="$MOBILE_DIR/android"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}✕${NC} $*"; exit 1; }

MODE="${1:-debug}"

# ── Preflight checks ─────────────────────────────────────────────────

command -v bun  >/dev/null 2>&1 || fail "bun not found. Install: https://bun.sh"
command -v java >/dev/null 2>&1 || fail "java not found. Install JDK 17+."

JAVA_VER=$(java -version 2>&1 | head -1 | grep -oP '\"(\d+)' | tr -d '"')
if [ "$JAVA_VER" -lt 17 ] 2>/dev/null; then
  fail "Java 17+ required (found $JAVA_VER)"
fi

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
  warn "ANDROID_HOME / ANDROID_SDK_ROOT not set — Gradle may still find the SDK via local.properties"
fi

# ── Step 1: Install dependencies ──────────────────────────────────────

info "Installing dependencies..."
(cd "$ROOT_DIR" && bun install --frozen-lockfile 2>/dev/null || bun install)
ok "Dependencies installed"

# ── Step 2: Build web assets ──────────────────────────────────────────

info "Building web vault..."
(cd "$WEB_DIR" && bun run build)
ok "Web vault built → apps/web/dist/"

# ── Step 3: Capacitor sync ────────────────────────────────────────────

info "Syncing Capacitor → Android..."
(cd "$MOBILE_DIR" && npx cap sync android)
ok "Capacitor synced"

# ── Step 4: Gradle build ─────────────────────────────────────────────

if [ "$MODE" = "release" ]; then
  info "Building release AAB..."

  if [ -n "${LOCKBOX_KEYSTORE_FILE:-}" ]; then
    ok "Signing with keystore: $LOCKBOX_KEYSTORE_FILE"
  else
    warn "No LOCKBOX_KEYSTORE_FILE set — AAB will be unsigned (sign via Play Console or jarsigner)"
  fi

  (cd "$ANDROID_DIR" && ./gradlew :app:bundleRelease --no-daemon)

  AAB="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
  if [ -f "$AAB" ]; then
    SIZE=$(du -h "$AAB" | cut -f1)
    echo ""
    ok "Release AAB built ($SIZE)"
    echo -e "   ${BOLD}$AAB${NC}"
  else
    fail "AAB not found at expected path"
  fi
else
  info "Building debug APK..."
  (cd "$ANDROID_DIR" && ./gradlew :app:assembleDebug --no-daemon)

  APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
  if [ -f "$APK" ]; then
    SIZE=$(du -h "$APK" | cut -f1)
    echo ""
    ok "Debug APK built ($SIZE)"
    echo -e "   ${BOLD}$APK${NC}"
    echo ""
    info "Install on device: adb install -r \"$APK\""
  else
    fail "APK not found at expected path"
  fi
fi
