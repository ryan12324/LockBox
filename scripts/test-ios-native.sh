#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d /private/tmp/authwell-ios-native-tests.XXXXXX)"
trap 'rm -rf "$test_root"' EXIT
app_scheme="$repository_root/apps/mobile/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"

[[ -f "$app_scheme" ]] || {
  echo "Missing shared iOS App scheme: $app_scheme" >&2
  exit 1
}
grep -q 'BuildableName = "App.app"' "$app_scheme" || {
  echo "Shared iOS App scheme does not build App.app" >&2
  exit 1
}
grep -q 'BlueprintName = "App"' "$app_scheme" || {
  echo "Shared iOS App scheme does not target App" >&2
  exit 1
}

mkdir -p "$test_root/module-cache"
xcrun --sdk macosx swiftc \
  -parse-as-library \
  -module-cache-path "$test_root/module-cache" \
  "$repository_root/apps/mobile/ios/App/Shared/AuthwellShared.swift" \
  "$repository_root/apps/mobile/ios/Tests/AuthwellNativeTests.swift" \
  -o "$test_root/AuthwellNativeTests"

"$test_root/AuthwellNativeTests"
