#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d /private/tmp/authwell-ios-native-tests.XXXXXX)"
trap 'rm -rf "$test_root"' EXIT
app_scheme="$repository_root/apps/mobile/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"
ui_test_scheme="$repository_root/apps/mobile/ios/App/App.xcodeproj/xcshareddata/xcschemes/AuthwellAutofillUITests.xcscheme"
project_file="$repository_root/apps/mobile/ios/App/App.xcodeproj/project.pbxproj"
provider_source="$repository_root/apps/mobile/ios/App/CredentialProvider/CredentialProviderViewController.swift"

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
[[ -f "$ui_test_scheme" ]] || {
  echo "Missing shared iOS AutoFill UI-test scheme: $ui_test_scheme" >&2
  exit 1
}
grep -q 'BuildableName = "AuthwellUITests.xctest"' "$ui_test_scheme" || {
  echo "iOS AutoFill UI-test scheme does not build AuthwellUITests.xctest" >&2
  exit 1
}
[[ "$(grep -c 'PRODUCT_NAME = "$(TARGET_NAME)";' "$project_file")" -ge 4 ]] || {
  echo "iOS AutoFill UI-test target is missing PRODUCT_NAME" >&2
  exit 1
}
grep -q 'performWithoutUserInteractionIfPossible' "$provider_source" || {
  echo "iOS provider is missing the AuthenticationServices background save callback" >&2
  exit 1
}
grep -q 'prepareInterface(for savePasswordRequest: ASSavePasswordRequest)' "$provider_source" || {
  echo "iOS provider is missing the AuthenticationServices interactive save callback" >&2
  exit 1
}
grep -q 'NativeCredentialCapture.savePassword' "$provider_source" || {
  echo "iOS provider save callbacks are not connected to secure native capture" >&2
  exit 1
}
grep -q 'generatePasswordsRequest: ASGeneratePasswordsRequest' "$provider_source" || {
  echo "iOS provider is missing the AuthenticationServices password generation callback" >&2
  exit 1
}
grep -q 'completeGeneratePasswordRequest' "$provider_source" || {
  echo "iOS provider does not return generated-password choices to AuthenticationServices" >&2
  exit 1
}
grep -q 'generatedPasswordFilled' "$provider_source" || {
  echo "iOS provider does not capture selected generated passwords" >&2
  exit 1
}
grep -q 'NativeCredentialCapture.prepareForPasswordGeneration' "$provider_source" || {
  echo "iOS provider offers generated passwords without preflighting secure save" >&2
  exit 1
}
grep -q 'Saved password; identity refresh failed' "$provider_source" || {
  echo "iOS provider can incorrectly fail a durable save after identity refresh" >&2
  exit 1
}
grep -q 'SupportsGeneratePasswordCredentials' \
  "$repository_root/apps/mobile/ios/App/CredentialProvider/Info.plist" || {
  echo "iOS provider does not advertise generated-password support" >&2
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
