# Authwell mobile

`apps/mobile` exposes one TypeScript contract to the Authwell web vault and implements it with native Android and iOS integrations.

| Integration                   | Android                                | iOS                                            |
| ----------------------------- | -------------------------------------- | ---------------------------------------------- |
| Offline encrypted-vault cache | Room                                   | SQLite in an App Group container               |
| Biometric unlock              | BiometricPrompt + AES-GCM Keystore key | LocalAuthentication + Secure Enclave ECIES key |
| Password autofill             | AutofillService                        | AutoFill Credential Provider extension         |
| Passkeys                      | Android Credential Provider            | iOS 17 AutoFill Credential Provider            |
| Native HTTP/connectivity      | Capacitor                              | Capacitor                                      |

Native credential indexes contain encrypted credential material. Password and passkey private-key plaintext is accepted only while the vault is unlocked, immediately encrypted to a biometric-bound device key, and decrypted by the provider after biometric authorization. A bounded display username is retained as device-local metadata so the system picker can distinguish accounts before authentication; passwords, item names, and raw targets remain encrypted. Newly created provider passkeys remain in a durable pending outbox until the web vault encrypts and uploads them.

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

Build and launch Authwell in an iOS Simulator from the repository root:

```bash
bun run ios:simulator
```

The command prefers a booted simulator, or selects an iPhone from the newest installed iOS runtime. Use `bun run ios:simulator -- --list` to list targets, or pass a simulator UDID after `--` to choose one explicitly.

Run the 12-case AutoFill form matrix through the real iOS app shell with:

```bash
bun run ios:test:autofill
```

Use `-- --case password-change` for one case, `-- --udid <id>` to choose a
Simulator, or `--skip-build` after the web assets and iOS project are current.
The XCUITest target is debug-only in effect: its launch environment can route a
debug build to `/test`, while Release builds compile out that route hook. Apple
does not expose a supported command-line switch for enabling a third-party
credential provider, so enable Authwell once in the Simulator's Password
AutoFill settings before doing manual provider-selection checks.

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

Build and launch Authwell on Android from the repository root:

```bash
bun run android:run
```

The command prefers an authorized physical device connected over USB or Wi-Fi, then falls back to a running emulator or an AVD using the newest installed Android SDK. Use `bun run android:run -- --list` to list every target, or pass a device serial or AVD ID after `--` to choose one explicitly. `bun run android:device` and `bun run android:emulator` force one target type.

Run the complete Android password AutoFill matrix on a running emulator:

```bash
bun run android:test:autofill
```

The command builds and installs the debug APK, enables Authwell's AutofillService, seeds disposable debug-only credentials, and drives all 12 `/test` cases through the real Android picker and save-session UI. It refuses physical-device serials so test data cannot replace a real device index. Use `-- --serial emulator-5554` to choose an emulator, `--case password-change` to run one case, or `--skip-build` while iterating after an APK build. The fixture receiver and plaintext test payload provider exist only in the debug source set and are absent from release builds.

The encrypted AutoFill index requires a screen lock and an enrolled strong biometric. On a new emulator, use Authwell's **Set up device biometrics** action before refreshing the index, then complete fingerprint enrollment in Android Settings.

Android exposes two complementary password-manager paths. The Autofill Framework service supports Android 8+ and apps with standard AutoFill fields, including Android's system **Save to Authwell?** prompt after a new or changed login is submitted. Accepted saves are immediately protected by a separate device-bound operations key and become locally fillable; the next normal Authwell unlock silently authorizes their import into the end-to-end encrypted vault with an account-scoped proof derived from the in-memory vault key. Neither the master password nor vault key is persisted or given to the AutofillService. On Android 14+, the Credential Manager provider advertises both password and public-key credential capabilities. After the first vault unlock, the in-app setup checklist reports whether each system provider is enabled, how many encrypted logins were indexed, and whether Android has queried Authwell.

Vault unlock uses `BiometricPrompt` with a per-use AES-256-GCM `CryptoObject`. The non-exportable Android Keystore key is invalidated by biometric enrollment changes, and the server/account scope is authenticated as AES-GCM additional data. SharedPreferences contains only the IV, scope, and wrapped vault key. Missing or invalidated Keystore material forces master-password unlock.

Website URLs match browser origins. Native Android apps match an explicit `androidapp://package.name` target on the login item. Authwell retains only a bounded display username outside the encrypted credential payload so Credential Manager and biometric prompts identify the selected account. Passwords, item names, and raw targets remain encrypted until strong biometric authentication decrypts the login.
