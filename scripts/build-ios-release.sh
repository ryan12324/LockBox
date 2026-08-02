#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
configuration="${IOS_CONFIGURATION:-Release}"
unsigned_build="${IOS_UNSIGNED:-0}"
timestamp="$(date -u +%Y%m%d-%H%M%S)"
archive_path="${IOS_ARCHIVE_PATH:-$repository_root/apps/mobile/ios/build/Authwell-$timestamp.xcarchive}"
workspace="$repository_root/apps/mobile/ios/App/App.xcworkspace"
derived_data="$(mktemp -d "${TMPDIR:-/private/tmp}/authwell-ios-release.XXXXXX")"
trap 'rm -rf "$derived_data"' EXIT

fail() {
  echo "iOS release verification failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_file() {
  [[ -f "$1" ]] || fail "missing $1"
}

require_directory() {
  [[ -d "$1" ]] || fail "missing $1"
}

assert_plist_value() {
  local plist_path="$1"
  local key_path="$2"
  local expected="$3"
  local actual
  actual="$(/usr/libexec/PlistBuddy -c "Print :$key_path" "$plist_path" 2>/dev/null)" ||
    fail "$plist_path has no $key_path"
  [[ "$actual" == "$expected" ]] ||
    fail "$plist_path $key_path is '$actual', expected '$expected'"
}

assert_arm64() {
  local binary_path="$1"
  local architectures
  architectures="$(xcrun lipo -archs "$binary_path")"
  [[ " $architectures " == *" arm64 "* ]] ||
    fail "$binary_path does not contain arm64"
}

case "$unsigned_build" in
  0|1) ;;
  *) fail "IOS_UNSIGNED must be 0 or 1" ;;
esac

[[ "$(uname -s)" == "Darwin" ]] || fail "the iOS release build requires macOS"
require_command bun
require_command pod
require_command xcodebuild
require_command xcrun
require_command codesign

cd "$repository_root"
bun run --cwd apps/web build
bun run --cwd apps/mobile build:ios
bun run test:ios-native

require_directory "$workspace"
mkdir -p "$(dirname "$archive_path")"

xcodebuild_arguments=(
  -workspace "$workspace"
  -scheme App
  -configuration "$configuration"
  -sdk iphoneos
  -destination "generic/platform=iOS"
  -derivedDataPath "$derived_data"
  -archivePath "$archive_path"
  COMPILER_INDEX_STORE_ENABLE=NO
)

if [[ "$unsigned_build" == "1" ]]; then
  xcodebuild_arguments+=(CODE_SIGNING_ALLOWED=NO)
elif [[ -n "${IOS_DEVELOPMENT_TEAM:-}" ]]; then
  xcodebuild_arguments+=("DEVELOPMENT_TEAM=$IOS_DEVELOPMENT_TEAM")
fi

if [[ "${IOS_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  xcodebuild_arguments+=(-allowProvisioningUpdates)
fi

xcodebuild "${xcodebuild_arguments[@]}" archive

app_bundle="$archive_path/Products/Applications/App.app"
extension_bundle="$app_bundle/PlugIns/AuthwellAutoFill.appex"
app_plist="$app_bundle/Info.plist"
extension_plist="$extension_bundle/Info.plist"
package_version="$(bun -p "require('./package.json').version")"

require_file "$archive_path/Info.plist"
require_file "$app_bundle/App"
require_file "$extension_bundle/AuthwellAutoFill"
require_file "$app_bundle/Assets.car"
require_file "$app_bundle/AppIcon60x60@2x.png"
require_file "$app_bundle/PrivacyInfo.xcprivacy"
require_file "$extension_bundle/PrivacyInfo.xcprivacy"
require_file "$app_bundle/public/index.html"
require_file "$app_bundle/public/.well-known/lockbox.json"
require_file "$archive_path/dSYMs/App.app.dSYM/Contents/Resources/DWARF/App"
require_file "$archive_path/dSYMs/AuthwellAutoFill.appex.dSYM/Contents/Resources/DWARF/AuthwellAutoFill"
require_directory "$app_bundle/Frameworks/Capacitor.framework"
require_directory "$app_bundle/Frameworks/CapacitorNetwork.framework"
require_directory "$app_bundle/Frameworks/Cordova.framework"

assert_arm64 "$app_bundle/App"
assert_arm64 "$extension_bundle/AuthwellAutoFill"
assert_plist_value "$app_plist" CFBundleDisplayName Authwell
assert_plist_value "$app_plist" CFBundleIdentifier dev.lockbox.app
assert_plist_value "$app_plist" CFBundleShortVersionString "$package_version"
assert_plist_value "$app_plist" MinimumOSVersion 17.0
assert_plist_value "$extension_plist" CFBundleIdentifier dev.lockbox.app.autofill
assert_plist_value "$extension_plist" CFBundleShortVersionString "$package_version"
assert_plist_value "$extension_plist" MinimumOSVersion 17.0
assert_plist_value "$extension_plist" NSExtension:NSExtensionPointIdentifier \
  com.apple.authentication-services-credential-provider-ui
assert_plist_value "$extension_plist" \
  NSExtension:NSExtensionAttributes:ASCredentialProviderExtensionCapabilities:ProvidesPasswords true
assert_plist_value "$extension_plist" \
  NSExtension:NSExtensionAttributes:ASCredentialProviderExtensionCapabilities:ProvidesPasskeys true
assert_plist_value "$extension_plist" \
  NSExtension:NSExtensionAttributes:ASCredentialProviderExtensionCapabilities:ShowsConfigurationUI true

if [[ "$unsigned_build" == "0" ]]; then
  codesign --verify --deep --strict "$app_bundle"
  app_entitlements="$derived_data/app-entitlements.plist"
  extension_entitlements="$derived_data/extension-entitlements.plist"
  codesign -d --entitlements - "$app_bundle" > "$app_entitlements" 2>/dev/null
  codesign -d --entitlements - "$extension_bundle" > "$extension_entitlements" 2>/dev/null
  assert_plist_value "$app_entitlements" \
    com.apple.developer.authentication-services.autofill-credential-provider true
  assert_plist_value "$extension_entitlements" \
    com.apple.developer.authentication-services.autofill-credential-provider true
  assert_plist_value "$app_entitlements" \
    com.apple.security.application-groups:0 group.dev.lockbox.app
  assert_plist_value "$extension_entitlements" \
    com.apple.security.application-groups:0 group.dev.lockbox.app
fi

echo "Verified iOS $configuration archive: $archive_path"
