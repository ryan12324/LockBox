import AuthenticationServices
import Foundation

enum AuthwellCredentialIdentityStore {
    static func state(completion: @escaping (Bool) -> Void) {
        ASCredentialIdentityStore.shared.getState { state in
            completion(state.isEnabled)
        }
    }

    static func refresh(completion: @escaping (Error?) -> Void) {
        ASCredentialIdentityStore.shared.getState { state in
            guard state.isEnabled else {
                completion(nil)
                return
            }
            do {
                let identities = try makeIdentities()
                ASCredentialIdentityStore.shared.replaceCredentialIdentities(identities) {
                    success, error in
                    if success {
                        completion(nil)
                    } else {
                        completion(error ?? AuthwellError.storage(
                            "Could not update the iOS credential identity store"
                        ))
                    }
                }
            } catch {
                completion(error)
            }
        }
    }

    private static func makeIdentities() throws -> [any ASCredentialIdentity] {
        var identities: [any ASCredentialIdentity] = []

        for record in try AuthwellDatabase.shared.allAutofill() {
            for identifier in record.serviceIdentifiers {
                let service = ASCredentialServiceIdentifier(
                    identifier: identifier,
                    type: .domain
                )
                let identity = ASPasswordCredentialIdentity(
                    serviceIdentifier: service,
                    user: "Authwell credential",
                    recordIdentifier: record.id
                )
                identities.append(identity)
            }
        }

        if let accountId = try AuthwellAppGroup.sharedDefaults().string(
            forKey: AuthwellAppGroup.accountKey
        ) {
            for record in try AuthwellDatabase.shared.passkeys(accountId: accountId) {
                guard
                    let credentialID = Data(base64URLEncoded: record.credentialId),
                    let userHandle = Data(base64URLEncoded: record.userId)
                else { continue }
                identities.append(
                    ASPasskeyCredentialIdentity(
                        relyingPartyIdentifier: record.rpId,
                        userName: record.userName,
                        credentialID: credentialID,
                        userHandle: userHandle,
                        recordIdentifier: record.credentialId
                    )
                )
            }
        }
        return identities
    }
}
