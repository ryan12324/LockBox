#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested_target="${1:-${IOS_SIMULATOR_UDID:-}}"

usage() {
  cat <<'EOF'
Build, install, and launch Authwell in an iOS Simulator.

Usage:
  bun run ios:simulator
  bun run ios:simulator -- --list
  bun run ios:simulator -- <simulator-udid>

The launcher prefers an already-booted iOS Simulator. Otherwise, it selects an
iPhone from the newest installed iOS runtime. Set IOS_SIMULATOR_UDID to persist
a target without passing it on every run.
EOF
}

fail() {
  echo "iOS Simulator launch failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$2"
}

case "$requested_target" in
  -h|--help)
    usage
    exit 0
    ;;
  --list)
    [[ "$(uname -s)" == "Darwin" ]] || fail "macOS is required"
    require_command xcrun "Xcode command-line tools are required"
    xcrun simctl list devices available
    exit 0
    ;;
  -*)
    fail "unknown option '$requested_target' (use --help for usage)"
    ;;
esac

[[ $# -le 1 ]] || fail "pass at most one simulator UDID"
[[ "$(uname -s)" == "Darwin" ]] || fail "macOS is required"
require_command bun "bun is required"
require_command pod "CocoaPods is required (install it with 'brew install cocoapods')"
require_command xcodebuild "Xcode is required"
require_command xcrun "Xcode command-line tools are required"

simulator_catalog="$(xcrun simctl list devices available --json)" ||
  fail "unable to query CoreSimulator; open Xcode once and install an iOS Simulator runtime"

selection="$(bun -e '
  const requested = process.argv[1] ?? "";
  const catalog = JSON.parse(await Bun.stdin.text());
  const version = (runtime) => {
    const match = runtime.match(/\.iOS-(\d+)(?:-(\d+))?(?:-(\d+))?$/);
    return match ? match.slice(1).map((part) => Number(part ?? 0)) : [0, 0, 0];
  };
  const compareVersions = (left, right) => {
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return 0;
  };
  const simulators = Object.entries(catalog.devices ?? {})
    .filter(([runtime]) => runtime.includes(".CoreSimulator.SimRuntime.iOS-"))
    .flatMap(([runtime, devices]) =>
      devices
        .filter((device) => device.isAvailable !== false)
        .map((device) => ({ ...device, runtimeVersion: version(runtime) })),
    )
    .sort((left, right) => compareVersions(left.runtimeVersion, right.runtimeVersion));

  const selected = requested
    ? simulators.find((simulator) => simulator.udid === requested)
    : simulators.find((simulator) => simulator.state === "Booted") ??
      simulators.find((simulator) => simulator.name.startsWith("iPhone")) ??
      simulators[0];

  if (!selected) {
    const message = requested
      ? `Simulator ${requested} is not installed or unavailable.`
      : "No available iOS Simulator is installed.";
    console.error(`${message} Run with --list to inspect available targets.`);
    process.exit(2);
  }

  process.stdout.write(`${selected.udid}\t${selected.name}`);
' "$requested_target" <<<"$simulator_catalog")"

simulator_udid="${selection%%$'\t'*}"
simulator_name="${selection#*$'\t'}"

echo "Using iOS Simulator: $simulator_name ($simulator_udid)"
echo "Building web vault..."
bun run --cwd "$repository_root/apps/web" build

echo "Syncing iOS project..."
bun run --cwd "$repository_root/apps/mobile" build:ios

echo "Building and launching Authwell..."
(
  cd "$repository_root/apps/mobile"
  bunx cap run ios --no-sync --scheme App --target "$simulator_udid"
)
