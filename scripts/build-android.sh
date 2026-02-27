#!/usr/bin/env bash
#
# Build Lockbox Android app (debug APK or release AAB).
#
# Prerequisites:
#   - bun installed (https://bun.sh)
#   - Java 17-24 (JAVA_HOME set, or auto-detected)
#   - Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT set)
#
# Usage:
#   ./scripts/build-android.sh              # debug APK
#   ./scripts/build-android.sh release      # release AAB (unsigned unless env vars set)
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

command -v bun >/dev/null 2>&1 || fail "bun not found. Install: https://bun.sh"

# ── Find a compatible JDK (17-24) ────────────────────────────────────
# Gradle 8.x does not support Java 25+. If the default java is too new,
# we try common JDK install locations to find a 17-24 JDK automatically.

get_java_major() {
  "$1" -version 2>&1 | head -1 | grep -oP '"(\d+)' | tr -d '"'
}

find_compatible_jdk() {
  local candidates=()

  # Check JAVA_HOME first
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    candidates+=("$JAVA_HOME")
  fi

  # Common JDK locations (Linux + macOS)
  for v in 24 23 22 21 17; do
    # SDKMAN
    for d in "$HOME/.sdkman/candidates/java/"*"$v"*; do
      [ -x "$d/bin/java" ] && candidates+=("$d")
    done
    # Linux /usr/lib/jvm
    for d in /usr/lib/jvm/*"$v"*; do
      [ -x "$d/bin/java" ] && candidates+=("$d")
    done
    # Homebrew (macOS)
    for d in /opt/homebrew/opt/openjdk@"$v" /usr/local/opt/openjdk@"$v"; do
      [ -x "$d/bin/java" ] && candidates+=("$d")
    done
    # macOS /Library/Java
    for d in /Library/Java/JavaVirtualMachines/*"$v"*/Contents/Home; do
      [ -x "$d/bin/java" ] && candidates+=("$d")
    done
    # Android Studio bundled JDK
    for d in "$HOME/Android/android-studio/jbr" "$HOME/Library/Application Support/Google/AndroidStudio"*/jbr "/opt/android-studio/jbr"; do
      [ -x "$d/bin/java" ] && candidates+=("$d")
    done
  done

  for jdk in "${candidates[@]}"; do
    local ver
    ver=$(get_java_major "$jdk/bin/java" 2>/dev/null) || continue
    if [ "$ver" -ge 17 ] && [ "$ver" -le 24 ] 2>/dev/null; then
      echo "$jdk"
      return 0
    fi
  done
  return 1
}

# Check if current java works
NEED_JDK_SEARCH=false
if command -v java >/dev/null 2>&1; then
  CUR_VER=$(get_java_major java 2>/dev/null) || CUR_VER=0
  if [ "$CUR_VER" -ge 17 ] && [ "$CUR_VER" -le 24 ] 2>/dev/null; then
    ok "Using Java $CUR_VER"
  elif [ "$CUR_VER" -ge 25 ] 2>/dev/null; then
    warn "Java $CUR_VER detected — Gradle 8.x supports Java 17-24"
    NEED_JDK_SEARCH=true
  else
    warn "Java $CUR_VER detected — need Java 17+"
    NEED_JDK_SEARCH=true
  fi
else
  warn "java not found on PATH"
  NEED_JDK_SEARCH=true
fi

if [ "$NEED_JDK_SEARCH" = true ]; then
  info "Searching for a compatible JDK (17-24)..."
  if FOUND_JDK=$(find_compatible_jdk); then
    FOUND_VER=$(get_java_major "$FOUND_JDK/bin/java")
    export JAVA_HOME="$FOUND_JDK"
    export PATH="$JAVA_HOME/bin:$PATH"
    ok "Found JDK $FOUND_VER at $JAVA_HOME"
  else
    echo ""
    fail "No compatible JDK (17-24) found. Install one and set JAVA_HOME:
   brew install openjdk@21        # macOS
   sudo apt install openjdk-21-jdk # Ubuntu/Debian
   sdk install java 21-tem         # SDKMAN"
  fi
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
