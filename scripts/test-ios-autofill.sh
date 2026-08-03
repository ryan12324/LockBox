#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
requested_case=""
requested_target="${IOS_SIMULATOR_UDID:-}"
skip_build=false
list_devices=false

usage() {
  cat <<'EOF'
Build and run Authwell's 12-case AutoFill matrix in an iOS Simulator.

Usage:
  bun run ios:test:autofill
  bun run ios:test:autofill -- --case multi-step
  bun run ios:test:autofill -- --udid <simulator-udid>
  bun run ios:test:autofill -- --list

The suite launches the real Capacitor/WKWebView app and verifies every form
contract. AuthenticationServices provider selection still uses the Simulator's
normal Password AutoFill setting; the test build does not bypass that boundary.
EOF
}

fail() {
  echo "iOS AutoFill test failed: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --case)
      [[ $# -ge 2 ]] || fail "--case requires a scenario id"
      requested_case="$2"
      shift 2
      ;;
    --udid)
      [[ $# -ge 2 ]] || fail "--udid requires a Simulator identifier"
      requested_target="$2"
      shift 2
      ;;
    --skip-build)
      skip_build=true
      shift
      ;;
    --list)
      list_devices=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option '$1' (use --help for usage)"
      ;;
  esac
done

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS is required"
command -v bun >/dev/null 2>&1 || fail "bun is required"
command -v xcodebuild >/dev/null 2>&1 || fail "Xcode is required"
command -v xcrun >/dev/null 2>&1 || fail "Xcode command-line tools are required"
command -v pod >/dev/null 2>&1 || fail "CocoaPods is required"

if [[ "$list_devices" == true ]]; then
  xcrun simctl list devices available
  exit 0
fi

case "$requested_case" in
  ""|standard|email|signup|password-change|password-only|multi-step|dynamic|phone|pin|fallback|one-time-code|sso-only) ;;
  *) fail "unknown AutoFill case '$requested_case'" ;;
esac

simulator_catalog="$(xcrun simctl list devices available --json)" ||
  fail "unable to query CoreSimulator; open Xcode once and install an iOS runtime"

selection="$(bun -e '
  const requested = process.argv[1] ?? "";
  const catalog = JSON.parse(await Bun.stdin.text());
  const version = (runtime) => {
    const match = runtime.match(/\.iOS-(\d+)(?:-(\d+))?(?:-(\d+))?$/);
    return match ? match.slice(1).map((part) => Number(part ?? 0)) : [0, 0, 0];
  };
  const compare = (left, right) => {
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return 0;
  };
  const devices = Object.entries(catalog.devices ?? {})
    .filter(([runtime]) => runtime.includes(".CoreSimulator.SimRuntime.iOS-"))
    .flatMap(([runtime, entries]) => entries
      .filter((entry) => entry.isAvailable !== false)
      .map((entry) => ({ ...entry, runtimeVersion: version(runtime) })))
    .sort((left, right) => compare(left.runtimeVersion, right.runtimeVersion));
  const selected = requested
    ? devices.find((device) => device.udid === requested)
    : devices.find((device) => device.state === "Booted") ??
      devices.find((device) => device.name.startsWith("iPhone")) ?? devices[0];
  if (!selected) process.exit(2);
  process.stdout.write(`${selected.udid}\t${selected.name}`);
' "$requested_target" <<<"$simulator_catalog")" || fail "no matching iOS Simulator is available"

simulator_udid="${selection%%$'\t'*}"
simulator_name="${selection#*$'\t'}"
echo "Using iOS Simulator: $simulator_name ($simulator_udid)"

if [[ "$skip_build" != true ]]; then
  echo "Building web vault and syncing iOS..."
  bun run --cwd "$repository_root/apps/web" build
  bun run --cwd "$repository_root/apps/mobile" build:ios
fi

pod_executable="$(command -v pod)"
cocoapods_gem_home="$(sed -n 's/^GEM_HOME="\([^"]*\)".*/\1/p' "$pod_executable")"
ruby_executable="$(command -v ruby)"
if [[ -x /opt/homebrew/opt/ruby/bin/ruby ]]; then
  ruby_executable=/opt/homebrew/opt/ruby/bin/ruby
elif [[ -x /usr/local/opt/ruby/bin/ruby ]]; then
  ruby_executable=/usr/local/opt/ruby/bin/ruby
fi
if [[ -n "$cocoapods_gem_home" ]]; then
  GEM_HOME="$cocoapods_gem_home" "$ruby_executable" "$repository_root/scripts/configure-ios-project.rb"
else
  "$ruby_executable" "$repository_root/scripts/configure-ios-project.rb"
fi

derived_data="$(mktemp -d /private/tmp/authwell-ios-autofill.XXXXXX)"
trap 'rm -rf "$derived_data"' EXIT

if [[ -n "$requested_case" ]]; then
  case "$requested_case" in
    standard) test_method="testStandard" ;;
    email) test_method="testEmail" ;;
    signup) test_method="testSignup" ;;
    password-change) test_method="testPasswordChange" ;;
    password-only) test_method="testPasswordOnly" ;;
    multi-step) test_method="testMultiStep" ;;
    dynamic) test_method="testDynamic" ;;
    phone) test_method="testPhone" ;;
    pin) test_method="testPin" ;;
    fallback) test_method="testFallback" ;;
    one-time-code) test_method="testOneTimeCode" ;;
    sso-only) test_method="testSsoOnly" ;;
  esac
fi

xcodebuild_args=(
  test
  -workspace "$repository_root/apps/mobile/ios/App/App.xcworkspace"
  -scheme AuthwellAutofillUITests
  -destination "platform=iOS Simulator,id=$simulator_udid"
  -derivedDataPath "$derived_data"
  -parallel-testing-enabled NO
)
if [[ -n "$requested_case" ]]; then
  xcodebuild_args+=(
    -only-testing:"AuthwellUITests/AutofillMatrixUITests/$test_method"
  )
fi
xcodebuild "${xcodebuild_args[@]}"
