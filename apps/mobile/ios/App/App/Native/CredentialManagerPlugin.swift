import AuthenticationServices
import Capacitor
import Foundation
import LocalAuthentication

@objc(CredentialManagerPlugin)
final class CredentialManagerPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "CredentialManagerPlugin"
    let jsName = "CredentialManager"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isProviderEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestEnableProvider", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createPasskey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStoredPasskeys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingPasskeys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportPendingPasskey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markPasskeySynced", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deletePasskey", returnType: CAPPluginReturnPromise),
    ]

    private var authorizationCall: CAPPluginCall?
    private var authorizationKind: AuthorizationKind?

    private enum AuthorizationKind { case registration, assertion }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    @objc func isProviderEnabled(_ call: CAPPluginCall) {
        AuthwellCredentialIdentityStore.state { enabled in
            call.resolve(["available": true, "enabled": enabled])
        }
    }

    @objc func requestEnableProvider(_ call: CAPPluginCall) {
        ASSettingsHelper.openCredentialProviderAppSettings { error in
            if let error {
                call.reject("Failed to open passkey provider settings", nil, error)
            } else {
                call.resolve()
            }
        }
    }

    @objc func createPasskey(_ call: CAPPluginCall) {
        do {
            guard authorizationCall == nil else {
                throw AuthwellError.unavailable("Another passkey request is already active")
            }
            guard let options = call.options as? [String: Any] else {
                throw AuthwellError.invalidArgument("Invalid passkey request")
            }
            let rpId = try InputValidation.relyingParty(options)
            let userName = try InputValidation.boundedString(
                options, key: "userName", maximum: 10_000
            )
            let userId = try InputValidation.canonicalBase64URL(
                options, key: "userId", minimumBytes: 1, maximumBytes: 1_024
            )
            let challenge = try InputValidation.canonicalBase64URL(
                options, key: "challenge", minimumBytes: 1, maximumBytes: 1_024
            )
            guard let userIDData = Data(base64URLEncoded: userId),
                  let challengeData = Data(base64URLEncoded: challenge) else {
                throw AuthwellError.invalidArgument("Invalid passkey request")
            }

            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
                relyingPartyIdentifier: rpId
            )
            let request = provider.createCredentialRegistrationRequest(
                challenge: challengeData,
                name: userName,
                userID: userIDData
            )
            request.displayName = call.getString("userDisplayName") ?? userName
            request.userVerificationPreference = .required
            switch call.getString("attestation") {
            case "direct": request.attestationPreference = .direct
            case "indirect": request.attestationPreference = .indirect
            default: request.attestationPreference = .none
            }
            beginAuthorization(request, call: call, kind: .registration)
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        do {
            guard authorizationCall == nil else {
                throw AuthwellError.unavailable("Another passkey request is already active")
            }
            guard let options = call.options as? [String: Any] else {
                throw AuthwellError.invalidArgument("Invalid passkey request")
            }
            let rpId = try InputValidation.relyingParty(options)
            let challenge = try InputValidation.canonicalBase64URL(
                options, key: "challenge", minimumBytes: 1, maximumBytes: 1_024
            )
            guard let challengeData = Data(base64URLEncoded: challenge) else {
                throw AuthwellError.invalidArgument("Invalid challenge")
            }
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
                relyingPartyIdentifier: rpId
            )
            let request = provider.createCredentialAssertionRequest(challenge: challengeData)
            if let allowed = call.getArray("allowCredentials") as? [String] {
                request.allowedCredentials = try allowed.map { value in
                    guard let data = Data(base64URLEncoded: value),
                          data.base64URLEncodedString == value else {
                        throw AuthwellError.invalidArgument("Invalid allowCredentials")
                    }
                    return ASAuthorizationPlatformPublicKeyCredentialDescriptor(
                        credentialID: data
                    )
                }
            }
            switch call.getString("userVerification") {
            case "required": request.userVerificationPreference = .required
            case "discouraged": request.userVerificationPreference = .discouraged
            default: request.userVerificationPreference = .preferred
            }
            beginAuthorization(request, call: call, kind: .assertion)
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func getStoredPasskeys(_ call: CAPPluginCall) {
        perform(call) {
            guard let accountId = try AuthwellAppGroup.sharedDefaults().string(
                forKey: AuthwellAppGroup.accountKey
            ) else {
                call.resolve(["passkeys": []])
                return
            }
            let records = try AuthwellDatabase.shared.passkeys(
                relyingParty: call.getString("rpId"),
                accountId: accountId
            )
            call.resolve([
                "passkeys": records.map {
                    [
                        "credentialId": $0.credentialId,
                        "rpId": $0.rpId,
                        "userName": $0.userName,
                    ]
                },
            ])
        }
    }

    @objc func getPendingPasskeys(_ call: CAPPluginCall) {
        perform(call) {
            guard let accountId = try AuthwellAppGroup.sharedDefaults().string(
                forKey: AuthwellAppGroup.accountKey
            ) else {
                call.resolve(["passkeys": []])
                return
            }
            let records = try AuthwellDatabase.shared.passkeys(
                source: PasskeyRecord.sourcePending,
                accountId: accountId
            )
            call.resolve([
                "passkeys": records.map {
                    [
                        "credentialId": $0.credentialId,
                        "vaultItemId": $0.vaultItemId,
                        "rpId": $0.rpId,
                        "userName": $0.userName,
                    ]
                },
            ])
        }
    }

    @objc func exportPendingPasskey(_ call: CAPPluginCall) {
        do {
            guard let credentialId = call.getString("credentialId"),
                  let accountId = try AuthwellAppGroup.sharedDefaults().string(
                      forKey: AuthwellAppGroup.accountKey
                  ) else {
                throw AuthwellError.authentication("Unlock Authwell before syncing passkeys")
            }
            guard let record = try AuthwellDatabase.shared.passkey(
                credentialId: credentialId,
                accountId: accountId
            ), record.source == PasskeyRecord.sourcePending else {
                throw AuthwellError.invalidArgument("Pending passkey not found")
            }
            let context = LAContext()
            context.localizedReason = "Sync \(record.userName) · \(record.rpName) to Authwell"
            context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: context.localizedReason
            ) { success, error in
                guard success else {
                    call.reject("Passkey sync was cancelled", nil, error)
                    return
                }
                do {
                    let data = try DeviceIndexCrypto.decrypt(
                        record.encryptedPrivateKey,
                        context: context
                    )
                    guard
                        let payload = try JSONSerialization.jsonObject(with: data) as? [String: String],
                        let privateKey = payload["privateKey"]
                    else {
                        throw AuthwellError.storage("Pending passkey is incomplete")
                    }
                    call.resolve([
                        "vaultItemId": record.vaultItemId,
                        "credentialId": record.credentialId,
                        "rpId": record.rpId,
                        "rpName": record.rpName,
                        "userId": record.userId,
                        "userName": record.userName,
                        "userDisplayName": record.userDisplayName,
                        "publicKey": record.publicKey,
                        "privateKey": privateKey,
                        "createdAt": record.createdAt,
                    ])
                } catch {
                    call.reject("Failed to decrypt the pending passkey", nil, error)
                }
            }
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func markPasskeySynced(_ call: CAPPluginCall) {
        perform(call) {
            guard let credentialId = call.getString("credentialId"),
                  let vaultItemId = call.getString("vaultItemId"),
                  let accountId = try AuthwellAppGroup.sharedDefaults().string(
                      forKey: AuthwellAppGroup.accountKey
                  ) else {
                throw AuthwellError.invalidArgument("Passkey sync acknowledgement is incomplete")
            }
            guard try AuthwellDatabase.shared.updatePasskeySource(
                credentialId: credentialId,
                vaultItemId: vaultItemId,
                accountId: accountId,
                source: PasskeyRecord.sourceSynced
            ) else {
                throw AuthwellError.invalidArgument("Pending passkey no longer exists")
            }
            call.resolve()
        }
    }

    @objc func deletePasskey(_ call: CAPPluginCall) {
        perform(call) {
            guard let credentialId = call.getString("credentialId"),
                  let accountId = try AuthwellAppGroup.sharedDefaults().string(
                      forKey: AuthwellAppGroup.accountKey
                  ) else {
                throw AuthwellError.invalidArgument("credentialId is required")
            }
            try AuthwellDatabase.shared.deletePasskey(
                credentialId: credentialId,
                accountId: accountId
            )
            AuthwellCredentialIdentityStore.refresh { error in
                if let error { call.reject(error.localizedDescription, nil, error) }
                else { call.resolve() }
            }
        }
    }

    private func beginAuthorization(
        _ request: ASAuthorizationRequest,
        call: CAPPluginCall,
        kind: AuthorizationKind
    ) {
        authorizationCall = call
        authorizationKind = kind
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    private func perform(_ call: CAPPluginCall, operation: @escaping () throws -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { try operation() }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }
}

extension CredentialManagerPlugin: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let call = authorizationCall, let kind = authorizationKind else { return }
        authorizationCall = nil
        authorizationKind = nil

        switch (kind, authorization.credential) {
        case (.registration, let credential as ASAuthorizationPlatformPublicKeyCredentialRegistration):
            do {
                guard let attestationObject = credential.rawAttestationObject else {
                    throw AuthwellError.storage("The passkey registration returned no attestation")
                }
                let publicKey = try PasskeyEncoding.cosePublicKey(
                    fromAttestationObject: attestationObject
                )
                call.resolve([
                    "credentialId": credential.credentialID.base64URLEncodedString,
                    "publicKey": publicKey.base64URLEncodedString,
                    "attestationObject": attestationObject.base64URLEncodedString,
                    "clientDataJSON": credential.rawClientDataJSON.base64URLEncodedString,
                ])
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        case (.assertion, let credential as ASAuthorizationPlatformPublicKeyCredentialAssertion):
            call.resolve([
                "credentialId": credential.credentialID.base64URLEncodedString,
                "authenticatorData": credential.rawAuthenticatorData.base64URLEncodedString,
                "signature": credential.signature.base64URLEncodedString,
                "clientDataJSON": credential.rawClientDataJSON.base64URLEncodedString,
                "userHandle": credential.userID.base64URLEncodedString,
            ])
        default:
            call.reject("The system returned an unexpected passkey credential")
        }
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        authorizationCall?.reject("Passkey request failed: \(error.localizedDescription)", nil, error)
        authorizationCall = nil
        authorizationKind = nil
    }
}

extension CredentialManagerPlugin: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
