import AuthenticationServices
import Capacitor
import Foundation

@objc(AutofillPlugin)
final class AutofillPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AutofillPlugin"
    let jsName = "Autofill"
    let pluginMethods: [CAPPluginMethod] = {
        var methods: [CAPPluginMethod] = [
            CAPPluginMethod(name: "isEnabled", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "requestEnable", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "replaceCredentialIndex", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "replaceTotpIndex", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "replacePasskeyIndex", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "clearCredentialIndex", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "getPasskeysForUri", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "getPendingCredentialSaves", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "exportPendingCredentialSave", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "markCredentialSaveSynced", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "getPendingTotpSetups", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "exportPendingTotpSetup", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "markTotpSetupHandled", returnType: CAPPluginReturnPromise),
        ]
#if DEBUG
        methods.append(
            CAPPluginMethod(name: "runAutofillAcceptanceCase", returnType: CAPPluginReturnPromise)
        )
#endif
        return methods
    }()

    @objc func isEnabled(_ call: CAPPluginCall) {
        AuthwellCredentialIdentityStore.state { enabled in
            do {
                var status = try AutofillDiagnostics.snapshot().bridgeValue
                status["supported"] = true
                status["enabled"] = enabled
                status["passwordSaveSupported"] = {
                    if #available(iOS 26.2, *) { return true }
                    return false
                }()
                status["oneTimeCodeSupported"] = {
                    if #available(iOS 18.0, *) { return true }
                    return false
                }()
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
            let accountId = try self.accountId(call)
            let authorization = try self.authorization(call, key: "saveAuthorization")
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
                        displayUsername: username,
                        encryptedData: try DeviceIndexCrypto.encrypt(payload),
                        updatedAt: ISO8601DateFormatter().string(from: Date()),
                        serviceIdentifiers: identifiers
                    )
                )
            }
            let pending = try AuthwellDatabase.shared.pendingCredentialSaves(accountId: accountId)
            let vaultIds = Set(records.map(\.id))
            let combined = records + pending
                .filter { !vaultIds.contains($0.id) }
                .map(\.autofillRecord)
            try AuthwellDatabase.shared.replaceAutofill(combined)
            try PendingSaveAuthorization.configure(accountId: accountId, proof: authorization)
            try AuthwellAppGroup.sharedDefaults().set(accountId, forKey: AuthwellAppGroup.accountKey)
            self.refreshIdentities(
                call,
                result: ["indexed": combined.count],
                indexedCredentials: combined.count
            )
        }
    }

    @objc func replaceTotpIndex(_ call: CAPPluginCall) {
        guard #available(iOS 18.0, *) else {
            call.resolve(["indexed": 0])
            return
        }
        perform(call) {
            guard let entries = call.options["totps"] as? [[String: Any]] else {
                throw AuthwellError.invalidArgument("totps is required")
            }
            guard entries.count <= 5_000 else {
                throw AuthwellError.invalidArgument("Too many verification codes")
            }
            let records = try entries.compactMap { entry -> TotpRecord? in
                let id = try InputValidation.boundedString(entry, key: "id", maximum: 100)
                let name = try InputValidation.boundedString(entry, key: "name", maximum: 500)
                let username = entry["username"] as? String ?? ""
                let totp = try InputValidation.boundedString(entry, key: "totp", maximum: 16_384)
                guard (try? NativeTotpConfiguration.parse(totp)) != nil else { return nil }
                let identifiers = Array(Set(
                    Array((entry["uris"] as? [String] ?? []).prefix(50))
                        .compactMap(DomainIdentifier.normalize)
                )).sorted()
                if identifiers.isEmpty { return nil }
                let payload = try JSONSerialization.data(withJSONObject: ["totp": totp])
                let label = username.isEmpty ? name : "\(name) · \(username)"
                return TotpRecord(
                    id: id,
                    domainHashes: try identifiers.map(DomainIdentifier.hash),
                    displayLabel: label,
                    encryptedData: try DeviceIndexCrypto.encrypt(payload),
                    updatedAt: ISO8601DateFormatter().string(from: Date()),
                    serviceIdentifiers: identifiers
                )
            }
            try AuthwellDatabase.shared.replaceTotp(records)
            self.refreshIdentities(call, result: ["indexed": records.count])
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
            try AuthwellDatabase.shared.clearTotp()
            try AuthwellDatabase.shared.clearPendingCredentialSaves()
            try AuthwellDatabase.shared.clearPendingTotpSetups()
            try DeviceOutboxCrypto.removeKey()
            try AuthwellDatabase.shared.clearSyncedPasskeys()
            try PendingSaveAuthorization.clear()
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

    @objc func getPendingCredentialSaves(_ call: CAPPluginCall) {
        perform(call) {
            guard let accountId = try AuthwellAppGroup.sharedDefaults().string(
                forKey: AuthwellAppGroup.accountKey
            ) else {
                call.resolve(["saves": []])
                return
            }
            call.resolve([
                "saves": try AuthwellDatabase.shared.pendingCredentialSaves(accountId: accountId)
                    .map(\.metadataBridgeValue),
            ])
        }
    }

    @objc func exportPendingCredentialSave(_ call: CAPPluginCall) {
        perform(call) {
            let id = try self.recordId(call)
            let accountId = try self.requireAuthorizedAccount(
                proof: try self.authorization(call, key: "authorization")
            )
            guard let record = try AuthwellDatabase.shared.pendingCredentialSave(
                id: id,
                accountId: accountId
            ) else {
                throw AuthwellError.invalidArgument("Saved login no longer exists")
            }
            let plaintext = try DeviceOutboxCrypto.decrypt(record.encryptedData)
            guard let payload = try JSONSerialization.jsonObject(with: plaintext) as? [String: String],
                  let name = payload["name"], let username = payload["username"],
                  let password = payload["password"], let uri = payload["uri"],
                  !name.isEmpty, !password.isEmpty, DomainIdentifier.normalize(uri) != nil else {
                throw AuthwellError.storage("The saved login is malformed")
            }
            call.resolve([
                "id": record.id, "name": name, "username": username,
                "password": password, "uri": uri, "createdAt": record.createdAt,
            ])
        }
    }

    @objc func markCredentialSaveSynced(_ call: CAPPluginCall) {
        perform(call) {
            let id = try self.recordId(call)
            let accountId = try self.requireAuthorizedAccount(
                proof: try self.authorization(call, key: "authorization")
            )
            guard try AuthwellDatabase.shared.deletePendingCredentialSave(id: id, accountId: accountId) else {
                throw AuthwellError.invalidArgument("Saved login no longer exists")
            }
            call.resolve()
        }
    }

    @objc func getPendingTotpSetups(_ call: CAPPluginCall) {
        perform(call) {
            guard let accountId = try AuthwellAppGroup.sharedDefaults().string(
                forKey: AuthwellAppGroup.accountKey
            ) else {
                call.resolve(["setups": []])
                return
            }
            call.resolve([
                "setups": try AuthwellDatabase.shared.pendingTotpSetups(accountId: accountId)
                    .map(\.metadataBridgeValue),
            ])
        }
    }

    @objc func exportPendingTotpSetup(_ call: CAPPluginCall) {
        perform(call) {
            let id = try self.recordId(call)
            let accountId = try self.requireAuthorizedAccount(
                proof: try self.authorization(call, key: "authorization")
            )
            guard let record = try AuthwellDatabase.shared.pendingTotpSetup(
                id: id,
                accountId: accountId
            ) else {
                throw AuthwellError.invalidArgument("Verification-code setup no longer exists")
            }
            let plaintext = try DeviceOutboxCrypto.decrypt(record.encryptedData)
            guard let uri = String(data: plaintext, encoding: .utf8) else {
                throw AuthwellError.storage("Verification-code setup is malformed")
            }
            call.resolve([
                "id": record.id, "uri": uri, "scheme": record.scheme,
                "createdAt": record.createdAt,
            ])
        }
    }

    @objc func markTotpSetupHandled(_ call: CAPPluginCall) {
        perform(call) {
            let id = try self.recordId(call)
            let accountId = try self.requireAuthorizedAccount(
                proof: try self.authorization(call, key: "authorization")
            )
            guard try AuthwellDatabase.shared.deletePendingTotpSetup(id: id, accountId: accountId) else {
                throw AuthwellError.invalidArgument("Verification-code setup no longer exists")
            }
            call.resolve()
        }
    }

#if DEBUG
    /// XCUITest-only proof that form completion reaches the same encrypted
    /// capture routine invoked by the iOS 26.2 ASSavePasswordRequest callbacks.
    @objc func runAutofillAcceptanceCase(_ call: CAPPluginCall) {
        perform(call) {
            guard let scenario = call.getString("scenarioId"),
                  ProcessInfo.processInfo.environment["AUTHWELL_AUTOFILL_E2E_CASE"] == scenario,
                  Self.acceptanceCases.contains(scenario) else {
                throw AuthwellError.authentication("The iOS AutoFill acceptance bridge is disabled")
            }

            if Self.acceptanceNoSaveCases.contains(scenario) {
                guard call.getString("username") == nil, call.getString("password") == nil else {
                    throw AuthwellError.invalidArgument("A no-save test supplied a credential")
                }
                call.resolve([
                    "outcome": "ignored",
                    "indexed": false,
                    "encrypted": false,
                ])
                return
            }

            guard let username = call.getString("username"),
                  !username.isEmpty, username.count <= 10_000,
                  let password = call.getString("password"),
                  !password.isEmpty, password.count <= 100_000 else {
                throw AuthwellError.invalidArgument("The iOS test login is incomplete")
            }

            let accountId = "ios_autofill_acceptance"
            let serviceIdentifier = "https://\(scenario).autofill.authwell.test"
            let defaults = try AuthwellAppGroup.sharedDefaults()
            let previousAccountId = defaults.string(forKey: AuthwellAppGroup.accountKey)
            defaults.set(accountId, forKey: AuthwellAppGroup.accountKey)
            defer {
                if let previousAccountId {
                    defaults.set(previousAccountId, forKey: AuthwellAppGroup.accountKey)
                } else {
                    defaults.removeObject(forKey: AuthwellAppGroup.accountKey)
                }
            }

            var updateCandidate = false
            if scenario == "password-change" {
                let seed = try NativeCredentialCapture.savePassword(
                    username: username,
                    password: "Authwell-Previous-Password-Only",
                    serviceIdentifier: serviceIdentifier,
                    title: "Authwell iOS update fixture",
                    sessionId: "acceptance-password-change-existing",
                    event: "acceptanceSeed"
                )
                _ = try AuthwellDatabase.shared.deletePendingCredentialSave(
                    id: seed.id,
                    accountId: accountId
                )
                updateCandidate = try NativeCredentialCapture.hasMatchingPassword(
                    username: username,
                    serviceIdentifier: serviceIdentifier
                )
            }

            let record = try NativeCredentialCapture.savePassword(
                username: username,
                password: password,
                serviceIdentifier: serviceIdentifier,
                title: "Authwell iOS AutoFill acceptance",
                sessionId: "acceptance-\(scenario)",
                event: "acceptanceFormCompletion"
            )
            guard let storedPending = try AuthwellDatabase.shared.pendingCredentialSave(
                id: record.id,
                accountId: accountId
            ), let storedIndex = try AuthwellDatabase.shared.autofill(id: record.id),
                  storedIndex.serviceIdentifiers == record.autofillRecord.serviceIdentifiers else {
                throw AuthwellError.storage("The iOS test login was not indexed")
            }

            var plaintext = try DeviceOutboxCrypto.decrypt(storedPending.encryptedData)
            defer { plaintext.resetBytes(in: 0..<plaintext.count) }
            guard let payload = try JSONSerialization.jsonObject(with: plaintext) as? [String: String],
                  payload["username"] == username,
                  payload["password"] == password,
                  payload["uri"] == serviceIdentifier,
                  Data(base64Encoded: storedPending.encryptedData) != plaintext else {
                throw AuthwellError.storage("The iOS test login was not encrypted correctly")
            }
            if scenario == "password-change", !updateCandidate {
                throw AuthwellError.storage("The replacement password did not match an existing login")
            }

            self.refreshIdentities(call, result: [
                "outcome": scenario == "password-change" ? "updated" : "saved",
                "indexed": true,
                "encrypted": true,
            ])
        }
    }

    private static let acceptanceCases = Set([
        "standard", "email", "signup", "password-change", "password-only", "multi-step",
        "dynamic", "phone", "pin", "fallback", "one-time-code", "sso-only",
    ])
    private static let acceptanceNoSaveCases = Set(["one-time-code", "sso-only"])
#endif

    private func accountId(_ call: CAPPluginCall) throws -> String {
        guard let value = call.getString("accountId"),
              value.range(of: "^[A-Za-z0-9_-]{1,100}$", options: .regularExpression) != nil else {
            throw AuthwellError.invalidArgument("accountId is required")
        }
        return value
    }

    private func recordId(_ call: CAPPluginCall) throws -> String {
        guard let value = call.getString("id"),
              value.range(of: "^[A-Za-z0-9_-]{1,100}$", options: .regularExpression) != nil else {
            throw AuthwellError.invalidArgument("Valid id is required")
        }
        return value
    }

    private func authorization(_ call: CAPPluginCall, key: String) throws -> Data {
        guard let value = call.getString(key), value.count == 43,
              value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
              let proof = Data(base64URLEncoded: value), proof.count == 32,
              proof.base64URLEncodedString == value else {
            throw AuthwellError.invalidArgument("\(key) is required")
        }
        return proof
    }

    private func requireAuthorizedAccount(proof: Data) throws -> String {
        guard let accountId = try AuthwellAppGroup.sharedDefaults().string(
            forKey: AuthwellAppGroup.accountKey
        ), try PendingSaveAuthorization.verify(accountId: accountId, proof: proof) else {
            throw AuthwellError.authentication("Unlock Authwell before importing device credentials")
        }
        return accountId
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
