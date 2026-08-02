#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="auto"
list_only="false"
requested_target=""

usage() {
  cat <<'EOF'
Build, install, and launch Authwell on Android.

Usage:
  bun run android:run
  bun run android:run -- --list
  bun run android:run -- <device-serial-or-avd-id>
  bun run android:device
  bun run android:emulator

The default launcher prefers an authorized, connected physical device. If none
is connected, it uses a running emulator or an AVD with the newest installed
Android SDK. Set ANDROID_TARGET_ID to persist a device serial or AVD ID.
EOF
}

fail() {
  echo "Android launch failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$2"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --list)
      list_only="true"
      ;;
    --device)
      [[ "$mode" != "emulator" ]] || fail "--device and --emulator cannot be combined"
      mode="device"
      ;;
    --emulator)
      [[ "$mode" != "device" ]] || fail "--device and --emulator cannot be combined"
      mode="emulator"
      ;;
    -*)
      fail "unknown option '$1' (use --help for usage)"
      ;;
    *)
      [[ -z "$requested_target" ]] || fail "pass at most one device serial or AVD ID"
      requested_target="$1"
      ;;
  esac
  shift
done

requested_target="${requested_target:-${ANDROID_TARGET_ID:-${ANDROID_EMULATOR_ID:-}}}"

require_command bun "bun is required"

target_catalog="$(bunx native-run android --list --json)" ||
  fail "unable to query Android targets; check the SDK and adb connection"

if [[ "$list_only" == "true" ]]; then
  bun -e '
    const mode = process.argv[1] ?? "auto";
    const catalog = JSON.parse(await Bun.stdin.text());
    const devices = (catalog.devices ?? []).filter(
      (target) => !String(target.id ?? "").startsWith("emulator-"),
    );
    const emulators = catalog.virtualDevices ?? [];
    const printTargets = (heading, targets, emptyMessage) => {
      console.log(`${heading}:`);
      if (targets.length === 0) console.log(`  ${emptyMessage}`);
      for (const target of targets) {
        const name = target.name ?? target.model ?? target.id;
        console.log(`  ${name} · API ${target.sdkVersion ?? "?"} · ${target.id}`);
      }
    };
    if (mode !== "emulator") {
      printTargets("Physical devices", devices, "None connected or authorized");
    }
    if (mode !== "device") {
      if (mode === "auto") console.log("");
      printTargets("Android emulators", emulators, "No AVDs installed");
    }
  ' "$mode" <<<"$target_catalog"
  exit 0
fi

adb_path=""
if command -v adb >/dev/null 2>&1; then
  adb_path="$(command -v adb)"
else
  for sdk_root in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk"; do
    if [[ -n "$sdk_root" && -x "$sdk_root/platform-tools/adb" ]]; then
      adb_path="$sdk_root/platform-tools/adb"
      break
    fi
  done
fi

running_avd=""
if [[ -n "$adb_path" ]]; then
  while read -r device_serial device_state _; do
    [[ "$device_serial" == emulator-* && "$device_state" == "device" ]] || continue
    running_avd="$("$adb_path" -s "$device_serial" emu avd name 2>/dev/null | sed -n '1p' | tr -d '\r')"
    [[ -n "$running_avd" ]] && break
  done < <("$adb_path" devices 2>/dev/null)
fi

selection="$(bun -e '
  const requested = process.argv[1] ?? "";
  const running = process.argv[2] ?? "";
  const mode = process.argv[3] ?? "auto";
  const catalog = JSON.parse(await Bun.stdin.text());
  const devices = (catalog.devices ?? []).filter(
    (target) => !String(target.id ?? "").startsWith("emulator-"),
  );
  const emulators = [...(catalog.virtualDevices ?? [])].sort((left, right) => {
    const sdkDifference = Number(right.sdkVersion ?? 0) - Number(left.sdkVersion ?? 0);
    return sdkDifference || String(left.name ?? left.id).localeCompare(String(right.name ?? right.id));
  });
  const allowed = mode === "device" ? devices : mode === "emulator" ? emulators : [...devices, ...emulators];

  const selected = requested
    ? allowed.find((target) => target.id === requested)
    : mode === "device"
      ? devices[0]
      : mode === "emulator"
        ? emulators.find((target) => target.id === running) ?? emulators[0]
        : devices[0] ?? emulators.find((target) => target.id === running) ?? emulators[0];

  if (!selected) {
    const targetKind = mode === "device" ? "authorized physical device" : mode === "emulator" ? "Android Virtual Device" : "Android target";
    const message = requested
      ? `${targetKind} ${requested} is not connected or installed.`
      : `No ${targetKind} is available.`;
    console.error(`${message} Run with --list to inspect available targets.`);
    process.exit(2);
  }

  const kind = devices.some((device) => device.id === selected.id) ? "physical device" : "emulator";
  process.stdout.write(`${selected.id}\t${selected.name ?? selected.model ?? selected.id}\t${kind}`);
' "$requested_target" "$running_avd" "$mode" <<<"$target_catalog")"

target_id="${selection%%$'\t'*}"
selection_remainder="${selection#*$'\t'}"
target_name="${selection_remainder%%$'\t'*}"
target_kind="${selection_remainder#*$'\t'}"
apk_path="$repository_root/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"

echo "Using Android $target_kind: $target_name ($target_id)"
"$repository_root/scripts/build-android.sh"

[[ -f "$apk_path" ]] || fail "debug APK was not created at $apk_path"

echo "Installing and launching Authwell..."
(
  cd "$repository_root/apps/mobile"
  bunx native-run android --app "$apk_path" --target "$target_id"
)
