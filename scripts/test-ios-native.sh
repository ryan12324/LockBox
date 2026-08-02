#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d /private/tmp/authwell-ios-native-tests.XXXXXX)"
trap 'rm -rf "$test_root"' EXIT

mkdir -p "$test_root/module-cache"
xcrun --sdk macosx swiftc \
  -parse-as-library \
  -module-cache-path "$test_root/module-cache" \
  "$repository_root/apps/mobile/ios/App/Shared/AuthwellShared.swift" \
  "$repository_root/apps/mobile/ios/Tests/AuthwellNativeTests.swift" \
  -o "$test_root/AuthwellNativeTests"

"$test_root/AuthwellNativeTests"
