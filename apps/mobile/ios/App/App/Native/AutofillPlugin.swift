import AuthenticationServices
import Capacitor
import Foundation

@objc(AutofillPlugin)
final class AutofillPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AutofillPlugin"
    let jsName = "Autofill"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestEnable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceCredentialIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replacePasskeyIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearCredentialIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPasskeysForUri", returnType: CAPPluginReturnPromise),
    ]

    @objc func isEnabled(_ call: CAPPluginCall) {
        AuthwellCredentialIdentityStore.state { enabled in
            do {
                var status = try AutofillDiagnostics.snapshot().bridgeValue
                status["supported"] = true
                status["enabled"] = enabled
                call.resolve(status)
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func requestEnable(_ call: CAPPluginCall) {
        ASSettingsHelper.openCredentialProviderAppSettings { error in
            if let error {
                call.reject("Failed to open AutoFill settings", nil, error)
            } else {
                call.resolve()
            }
        }
    }

    @objc func replaceCredentialIndex(_ call: CAPPluginCall) {
        perform(call) {
            guard let credentials = call.options["credentials"] as? [[String: Any]] else {
                throw AuthwellError.invalidArgument("credentials is required")
            }
            guard credentials.count <= 5_000 else {
                throw AuthwellError.invalidArgument("Too many credentials")
            }
            var records: [AutofillRecord] = []
            for credential in credentials {
                let id = try InputValidation.boundedString(
                    credential, key: "id", maximum: 100
                )
                let name = try InputValidation.boundedString(
                    credential, key: "name", maximum: 500
                )
                let username = credential["username"] as? String ?? ""
                let password = credential["password"] as? String ?? ""
                guard username.count <= 10_000, password.count <= 100_000 else {
                    throw AuthwellError.invalidArgument("Credential field is too large")
                }
                if password.isEmpty { continue }

                let uris = Array((credential["uris"] as? [String] ?? []).prefix(50))
                let identifiers = Array(Set(uris.compactMap(DomainIdentifier.normalize))).sorted()
                if identifiers.isEmpty { continue }
                let hashes = try identifiers.map(DomainIdentifier.hash)
                let payload = try JSONSerialization.data(
                    withJSONObject: [
                        "name": name,
                        "username": username,
                        "password": password,
                    ]
                )
                records.append(
                    AutofillRecord(
                        id: id,
                        domainHashes: hashes,
                        encryptedData: try DeviceIndexCrypto.encrypt(payload),
                        updatedAt: ISO8601DateFormatter().string(from: Date()),
                        serviceIdentifiers: identifiers
                    )
                )
            }
            try AuthwellDatabase.shared.replaceAutofill(records)
            self.refreshIdentities(
                call,
                result: ["indexed": records.count],
                indexedCredentials: records.count
            )
        }
    }

    @objc func replacePasskeyIndex(_ call: CAPPluginCall) {
        perform(call) {
            guard let passkeys = call.options["passkeys"] as? [[String: Any]] else {
                throw AuthwellError.invalidArgument("passkeys is required")
            }
            guard passkeys.count <= 5_000 else {
                throw AuthwellError.invalidArgument("Too many passkeys")
            }
            guard
                let accountId = call.getString("accountId"),
                accountId.range(
                    of: "^[A-Za-z0-9_-]{1,100}$",
                    options: .regularExpression
                ) != nil
            else {
                throw AuthwellError.invalidArgument("accountId is required")
            }

            let records = try passkeys.map { passkey -> PasskeyRecord in
                let credentialId = try InputValidation.canonicalBase64URL(
                    passkey, key: "credentialId", minimumBytes: 16, maximumBytes: 1_024
                )
                let privateKey = try InputValidation.canonicalBase64URL(
                    passkey, key: "privateKey", minimumBytes: 64, maximumBytes: 4_096
                )
                let publicKey = try InputValidation.canonicalBase64URL(
                    passkey, key: "publicKey", minimumBytes: 64, maximumBytes: 1_024
                )
                let itemId = try InputValidation.boundedString(
                    passkey, key: "id", maximum: 100
                )
                guard itemId.range(
                    of: "^[A-Za-z0-9_-]+$",
                    options: .regularExpression
                ) != nil else {
                    throw AuthwellError.invalidArgument("Invalid id")
                }
                let userName = try InputValidation.boundedString(
                    passkey, key: "userName", maximum: 10_000
                )
                let displayName = passkey["userDisplayName"] as? String ?? userName
                guard displayName.count <= 10_000 else {
                    throw AuthwellError.invalidArgument("Invalid userDisplayName")
                }
                let protectedKey = try DeviceIndexCrypto.encrypt(
                    try JSONSerialization.data(withJSONObject: ["privateKey": privateKey])
                )
                return PasskeyRecord(
                    credentialId: credentialId,
                    rpId: try InputValidation.relyingParty(passkey),
                    rpName: try InputValidation.boundedString(
                        passkey, key: "rpName", maximum: 500
                    ),
                    userName: userName,
                    userDisplayName: displayName,
                    userId: try InputValidation.canonicalBase64URL(
                        passkey, key: "userId", minimumBytes: 1, maximumBytes: 1_024
                    ),
                    createdAt: try InputValidation.boundedString(
                        passkey, key: "createdAt", maximum: 100
                    ),
                    encryptedPrivateKey: protectedKey,
                    publicKey: publicKey,
                    vaultItemId: itemId,
                    accountId: accountId,
                    source: PasskeyRecord.sourceSynced
                )
            }
            try AuthwellDatabase.shared.replaceSyncedPasskeys(records)
            try AuthwellAppGroup.sharedDefaults().set(
                accountId,
                forKey: AuthwellAppGroup.accountKey
            )
            self.refreshIdentities(call, result: ["indexed": records.count])
        }
    }

    @objc func clearCredentialIndex(_ call: CAPPluginCall) {
        perform(call) {
            try AuthwellDatabase.shared.clearAutofill()
            try AuthwellDatabase.shared.clearSyncedPasskeys()
            try AuthwellAppGroup.sharedDefaults().removeObject(
                forKey: AuthwellAppGroup.accountKey
            )
            self.refreshIdentities(call, result: [:], clearDiagnostics: true)
        }
    }

    @objc func getPasskeysForUri(_ call: CAPPluginCall) {
        perform(call) {
            guard
                let uri = call.getString("uri"),
                let relyingParty = DomainIdentifier.normalize(uri)
            else {
                throw AuthwellError.invalidArgument("Invalid URI")
            }
            guard let accountId = try AuthwellAppGroup.sharedDefaults().string(
                forKey: AuthwellAppGroup.accountKey
            ) else {
                call.resolve(["passkeys": []])
                return
            }
            call.resolve([
                "passkeys": try AuthwellDatabase.shared
                    .passkeys(relyingParty: relyingParty, accountId: accountId)
                    .map(\.metadataBridgeValue),
            ])
        }
    }

    private func perform(_ call: CAPPluginCall, operation: @escaping () throws -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { try operation() }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }

    private func refreshIdentities(
        _ call: CAPPluginCall,
        result: [String: Any],
        indexedCredentials: Int? = nil,
        clearDiagnostics: Bool = false
    ) {
        AuthwellCredentialIdentityStore.refresh { error in
            if let error {
                try? AutofillDiagnostics.recordFailure(
                    "The encrypted credential index could not refresh"
                )
                call.reject(error.localizedDescription, nil, error)
            } else {
                do {
                    if let indexedCredentials {
                        try AutofillDiagnostics.recordIndex(count: indexedCredentials)
                    } else if clearDiagnostics {
                        try AutofillDiagnostics.clearIndex()
                    }
                    call.resolve(result)
                } catch {
                    call.reject(error.localizedDescription, nil, error)
                }
            }
        }
    }
}
