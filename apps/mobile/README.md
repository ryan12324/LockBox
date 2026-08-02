# Authwell mobile

`apps/mobile` exposes one TypeScript contract to the Authwell web vault and implements it with native Android and iOS integrations.

| Integration | Android | iOS |
| ----------- | ------- | --- |
| Offline encrypted-vault cache | Room | SQLite in an App Group container |
| Biometric unlock | BiometricPrompt + AES-GCM Keystore key | LocalAuthentication + Secure Enclave ECIES key |
| Password autofill | AutofillService | AutoFill Credential Provider extension |
| Passkeys | Android Credential Provider | iOS 17 AutoFill Credential Provider |
| Native HTTP/connectivity | Capacitor | Capacitor |

Native credential indexes contain encrypted credential material. Password and passkey private-key plaintext is accepted only while the vault is unlocked, immediately encrypted to a biometric-bound device key, and decrypted by the provider after biometric authorization. Newly created provider passkeys remain in a durable pending outbox until the web vault encrypts and uploads them.

## iOS development

Requirements: macOS, Xcode 15 or newer, CocoaPods, and iOS 17+ for the credential-provider APIs.

```bash
cd apps/web
bun run build

cd ../mobile
bun run build:ios

cd ../..
open apps/mobile/ios/App/App.xcworkspace
```

Use the workspace for all signed builds. Select the same Apple development team for `App` and `CredentialProvider`, and enable the AutoFill Credential Provider capability plus `group.dev.lockbox.app` on both App IDs. The committed project already contains the extension; the idempotent Ruby configurator can restore its target membership if the Capacitor project is manually regenerated.

The provider must be enabled on a device under **Settings → General → AutoFill & Passwords**. Unlock Authwell once to seed its encrypted local indexes. Test both password and passkey flows on physical hardware because the Simulator uses a Data Protection Keychain fallback in place of Secure Enclave.

Biometric vault unlock is opt-in under **Authwell Settings → Biometric unlock**. Enrollment stores only an account-scoped wrapped 64-byte vault key: iOS keeps ECIES ciphertext in App Group preferences while the unwrap private key is protected by Secure Enclave/Keychain `biometryCurrentSet`. Face ID or Touch ID changes invalidate that private key and force the master-password fallback. Switching accounts or servers cannot reuse the prior envelope. Signing out clears the native AutoFill index, biometric enrollment, and offline database before ending the local session.

Run the platform-independent Swift contract checks with:

```bash
bun run test:ios-native
```

Create and verify a signed Release archive after configuring the Apple team:

```bash
IOS_DEVELOPMENT_TEAM=YOUR_TEAM_ID \
IOS_ALLOW_PROVISIONING_UPDATES=1 \
bun run build:ios:release
```

The release command rejects archives missing compiled assets, arm64 binaries, the AutoFill extension, privacy manifests, dSYMs, production web assets, matching versions, credential-provider capabilities, signatures, or App Group entitlements. CI runs the same verifier with `IOS_UNSIGNED=1`.

## Android development

See the root `AGENTS.md` and `DEPLOYING.md` for the required JDK/SDK combination and signed release commands.

Android exposes two complementary password-manager paths. The Autofill Framework service supports Android 8+ and apps with standard AutoFill fields. On Android 14+, the Credential Manager provider advertises both password and public-key credential capabilities. After the first vault unlock, the in-app setup checklist reports whether each system provider is enabled, how many encrypted logins were indexed, and whether Android has queried Authwell.

Vault unlock uses `BiometricPrompt` with a per-use AES-256-GCM `CryptoObject`. The non-exportable Android Keystore key is invalidated by biometric enrollment changes, and the server/account scope is authenticated as AES-GCM additional data. SharedPreferences contains only the IV, scope, and wrapped vault key. Missing or invalidated Keystore material forces master-password unlock.

Website URLs match browser origins. Native Android apps match an explicit `androidapp://package.name` target on the login item. Authwell keeps usernames, passwords, item names, and raw targets out of the native index; Credential Manager shows a generic entry until strong biometric authentication decrypts the selected login.
