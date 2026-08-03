import AuthenticationServices
import CryptoKit
import Foundation
import LocalAuthentication
import UIKit

final class CredentialProviderViewController: ASCredentialProviderViewController {
    private enum Choice {
        case password(AutofillRecord, name: String, username: String, password: String)
        case passkey(PasskeyRecord)

        var title: String {
            switch self {
            case .password(_, let name, _, _): return name
            case .passkey(let record): return record.userName
            }
        }

        var subtitle: String {
            switch self {
            case .password(_, _, let username, _): return username
            case .passkey(let record): return "Passkey · \(record.rpName)"
            }
        }
    }

    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private let messageLabel = UILabel()
    private var choices: [Choice] = []
    private var passkeyParameters: ASPasskeyCredentialRequestParameters?
    private var unlockedContext: LAContext?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground

        let titleLabel = UILabel()
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Authwell"
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.adjustsFontForContentSizeCategory = true

        messageLabel.translatesAutoresizingMaskIntoConstraints = false
        messageLabel.text = "Unlocking your credentials…"
        messageLabel.textColor = .secondaryLabel
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "credential")
        tableView.isHidden = true

        view.addSubview(titleLabel)
        view.addSubview(messageLabel)
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            messageLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            messageLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            messageLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            tableView.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 12),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        passkeyParameters = nil
        unlockAndLoad(serviceIdentifiers: serviceIdentifiers, passkeyParameters: nil)
    }

    override func prepareCredentialList(
        for serviceIdentifiers: [ASCredentialServiceIdentifier],
        requestParameters: ASPasskeyCredentialRequestParameters
    ) {
        passkeyParameters = requestParameters
        unlockAndLoad(serviceIdentifiers: serviceIdentifiers, passkeyParameters: requestParameters)
    }

    override func provideCredentialWithoutUserInteraction(
        for credentialRequest: ASCredentialRequest
    ) {
        cancel(.userInteractionRequired, message: "Biometric authentication is required")
    }

    override func prepareInterfaceToProvideCredential(for credentialRequest: ASCredentialRequest) {
        let displayUsername: String
        if let passwordRequest = credentialRequest as? ASPasswordCredentialRequest,
           let identity = passwordRequest.credentialIdentity as? ASPasswordCredentialIdentity {
            displayUsername = identity.user
        } else if let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest,
                  let identity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity {
            displayUsername = identity.userName
        } else {
            displayUsername = ""
        }
        authenticate(reason: AutofillPresentation.authenticationReason(displayUsername)) { context in
            do {
                if let passwordRequest = credentialRequest as? ASPasswordCredentialRequest {
                    guard let identity = passwordRequest.credentialIdentity as? ASPasswordCredentialIdentity else {
                        throw AuthwellError.invalidArgument("Password credential not found")
                    }
                    try self.completePassword(
                        identity: identity,
                        context: context
                    )
                } else if let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest {
                    try self.completePasskey(request: passkeyRequest, context: context)
                } else {
                    throw AuthwellError.invalidArgument("Unsupported credential request")
                }
                try? AutofillDiagnostics.recordRequest(matchCount: 1)
            } catch {
                try? AutofillDiagnostics.recordFailure(error.localizedDescription)
                self.cancel(.credentialIdentityNotFound, message: error.localizedDescription)
            }
        }
    }

    override func prepareInterface(forPasskeyRegistration registrationRequest: ASCredentialRequest) {
        authenticate(reason: "Create a passkey with Authwell") { context in
            do {
                try self.completePasskeyRegistration(registrationRequest, context: context)
            } catch {
                self.cancel(.failed, message: error.localizedDescription)
            }
        }
    }

    override func prepareInterfaceForExtensionConfiguration() {
        AuthwellCredentialIdentityStore.refresh { error in
            if let error {
                self.cancel(.failed, message: error.localizedDescription)
            } else {
                self.extensionContext.completeExtensionConfigurationRequest()
            }
        }
    }

    private func unlockAndLoad(
        serviceIdentifiers: [ASCredentialServiceIdentifier],
        passkeyParameters: ASPasskeyCredentialRequestParameters?
    ) {
        authenticate(reason: "Show your Authwell credentials") { context in
            do {
                self.unlockedContext = context
                self.choices = try self.loadChoices(
                    serviceIdentifiers: serviceIdentifiers,
                    passkeyParameters: passkeyParameters,
                    context: context
                )
                try? AutofillDiagnostics.recordRequest(matchCount: self.choices.count)
                DispatchQueue.main.async {
                    self.messageLabel.text = self.choices.isEmpty
                        ? "No matching credentials are stored in Authwell."
                        : nil
                    self.messageLabel.isHidden = !self.choices.isEmpty
                    self.tableView.isHidden = self.choices.isEmpty
                    self.tableView.reloadData()
                }
            } catch {
                try? AutofillDiagnostics.recordFailure(error.localizedDescription)
                self.cancel(.failed, message: error.localizedDescription)
            }
        }
    }

    private func loadChoices(
        serviceIdentifiers: [ASCredentialServiceIdentifier],
        passkeyParameters: ASPasskeyCredentialRequestParameters?,
        context: LAContext
    ) throws -> [Choice] {
        let domains = Set(serviceIdentifiers.compactMap {
            DomainIdentifier.normalize($0.identifier)
        })
        var passwordRecords: [String: AutofillRecord] = [:]
        for domain in domains {
            for record in try AuthwellDatabase.shared.matchingAutofill(
                domainHash: DomainIdentifier.hash(domain)
            ) {
                passwordRecords[record.id] = record
            }
        }

        var result: [Choice] = try passwordRecords.values.map { record in
            let plaintext = try DeviceIndexCrypto.decrypt(record.encryptedData, context: context)
            guard let payload = try JSONSerialization.jsonObject(with: plaintext) as? [String: String],
                  let name = payload["name"],
                  let username = payload["username"],
                  let password = payload["password"] else {
                throw AuthwellError.storage("A protected password record is malformed")
            }
            return .password(record, name: name, username: username, password: password)
        }

        if let parameters = passkeyParameters,
           let accountId = try AuthwellAppGroup.sharedDefaults().string(
               forKey: AuthwellAppGroup.accountKey
           ) {
            let allowed = Set(parameters.allowedCredentials.map(\.base64URLEncodedString))
            let passkeys = try AuthwellDatabase.shared.passkeys(
                relyingParty: parameters.relyingPartyIdentifier,
                accountId: accountId
            ).filter { allowed.isEmpty || allowed.contains($0.credentialId) }
            result.append(contentsOf: passkeys.map(Choice.passkey))
        }
        return result.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    private func completePassword(
        identity: ASPasswordCredentialIdentity,
        context: LAContext
    ) throws {
        guard let id = identity.recordIdentifier,
              let record = try AuthwellDatabase.shared.autofill(id: id) else {
            throw AuthwellError.invalidArgument("Credential not found")
        }
        let plaintext = try DeviceIndexCrypto.decrypt(record.encryptedData, context: context)
        guard let payload = try JSONSerialization.jsonObject(with: plaintext) as? [String: String],
              let username = payload["username"],
              let password = payload["password"] else {
            throw AuthwellError.storage("The credential is malformed")
        }
        extensionContext.completeRequest(
            withSelectedCredential: ASPasswordCredential(user: username, password: password),
            completionHandler: nil
        )
    }

    private func completePassword(choice: Choice) {
        guard case .password(_, _, let username, let password) = choice else { return }
        extensionContext.completeRequest(
            withSelectedCredential: ASPasswordCredential(user: username, password: password),
            completionHandler: nil
        )
    }

    private func completePasskey(request: ASPasskeyCredentialRequest, context: LAContext) throws {
        guard let identity = request.credentialIdentity as? ASPasskeyCredentialIdentity,
              let credentialId = identity.recordIdentifier,
              let accountId = try AuthwellAppGroup.sharedDefaults().string(
                  forKey: AuthwellAppGroup.accountKey
              ),
              let record = try AuthwellDatabase.shared.passkey(
                  credentialId: credentialId,
                  accountId: accountId
              ) else {
            throw AuthwellError.invalidArgument("Passkey not found")
        }
        try completePasskey(record: record, clientDataHash: request.clientDataHash, context: context)
    }

    private func completePasskey(
        record: PasskeyRecord,
        clientDataHash: Data,
        context: LAContext
    ) throws {
        let protectedData = try DeviceIndexCrypto.decrypt(
            record.encryptedPrivateKey,
            context: context
        )
        guard let payload = try JSONSerialization.jsonObject(with: protectedData) as? [String: String],
              let encodedKey = payload["privateKey"],
              let privateKeyData = Data(base64URLEncoded: encodedKey),
              let credentialID = Data(base64URLEncoded: record.credentialId),
              let userHandle = Data(base64URLEncoded: record.userId) else {
            throw AuthwellError.storage("Passkey material is malformed")
        }
        let privateKey = try P256.Signing.PrivateKey(derRepresentation: privateKeyData)
        let authenticatorData = PasskeyEncoding.assertionAuthenticatorData(
            relyingParty: record.rpId,
            isSynced: record.source == PasskeyRecord.sourceSynced
        )
        let signature = try privateKey.signature(
            for: authenticatorData + clientDataHash
        ).derRepresentation
        let credential = ASPasskeyAssertionCredential(
            userHandle: userHandle,
            relyingParty: record.rpId,
            signature: signature,
            clientDataHash: clientDataHash,
            authenticatorData: authenticatorData,
            credentialID: credentialID
        )
        extensionContext.completeAssertionRequest(using: credential, completionHandler: nil)
    }

    private func completePasskeyRegistration(
        _ request: ASCredentialRequest,
        context: LAContext
    ) throws {
        guard let passkeyRequest = request as? ASPasskeyCredentialRequest,
              let identity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity,
              let accountId = try AuthwellAppGroup.sharedDefaults().string(
                  forKey: AuthwellAppGroup.accountKey
              ) else {
            throw AuthwellError.authentication("Unlock Authwell before creating a passkey")
        }
        guard passkeyRequest.supportedAlgorithms.isEmpty
                || passkeyRequest.supportedAlgorithms.contains(.ES256) else {
            throw AuthwellError.unavailable("The website does not support ES256 passkeys")
        }
        let excludedIDs = excludedCredentialIDs(from: passkeyRequest)
        if !excludedIDs.isEmpty {
            let hasExcludedCredential = try AuthwellDatabase.shared.passkeys(
                relyingParty: identity.relyingPartyIdentifier,
                accountId: accountId
            ).contains { excludedIDs.contains($0.credentialId) }
            guard !hasExcludedCredential else {
                throw AuthwellError.invalidArgument("A matching excluded credential already exists")
            }
        }

        let privateKey = P256.Signing.PrivateKey()
        let credentialID = Data((0..<32).map { _ in UInt8.random(in: .min ... .max) })
        let coseKey = try PasskeyEncoding.cosePublicKey(privateKey.publicKey)
        let authenticatorData = PasskeyEncoding.registrationAuthenticatorData(
            relyingParty: identity.relyingPartyIdentifier,
            credentialID: credentialID,
            coseKey: coseKey
        )
        let attestation = PasskeyEncoding.attestationObject(authenticatorData: authenticatorData)
        let encodedPrivateKey = privateKey.derRepresentation.base64URLEncodedString
        let protectedKey = try DeviceIndexCrypto.encrypt(
            try JSONSerialization.data(withJSONObject: ["privateKey": encodedPrivateKey])
        )
        let now = ISO8601DateFormatter().string(from: Date())
        let record = PasskeyRecord(
            credentialId: credentialID.base64URLEncodedString,
            rpId: identity.relyingPartyIdentifier,
            rpName: identity.relyingPartyIdentifier,
            userName: identity.userName,
            userDisplayName: identity.userName,
            userId: identity.userHandle.base64URLEncodedString,
            createdAt: now,
            encryptedPrivateKey: protectedKey,
            publicKey: coseKey.base64URLEncodedString,
            vaultItemId: UUID().uuidString.lowercased(),
            accountId: accountId,
            source: PasskeyRecord.sourcePending
        )
        try AuthwellDatabase.shared.upsertPasskey(record)

        let credential = ASPasskeyRegistrationCredential(
            relyingParty: record.rpId,
            clientDataHash: passkeyRequest.clientDataHash,
            credentialID: credentialID,
            attestationObject: attestation
        )
        AuthwellCredentialIdentityStore.refresh { error in
            if let error {
                try? AuthwellDatabase.shared.deletePasskey(
                    credentialId: record.credentialId,
                    accountId: accountId
                )
                self.cancel(.failed, message: error.localizedDescription)
            } else {
                self.extensionContext.completeRegistrationRequest(
                    using: credential,
                    completionHandler: nil
                )
            }
        }
    }

    private func excludedCredentialIDs(
        from request: ASPasskeyCredentialRequest
    ) -> Set<String> {
        // excludedCredentials was added to this request in the iOS 18 SDK.
        // Runtime lookup preserves iOS 18 behavior while keeping the project
        // buildable with the Xcode 15 / iOS 17 SDK used by the minimum target.
        let selector = NSSelectorFromString("excludedCredentials")
        guard request.responds(to: selector),
              let descriptors = request.value(forKey: "excludedCredentials")
                as? [ASAuthorizationPlatformPublicKeyCredentialDescriptor] else {
            return []
        }
        return Set(descriptors.map { $0.credentialID.base64URLEncodedString })
    }

    private func authenticate(reason: String, completion: @escaping (LAContext) -> Void) {
        let context = LAContext()
        context.localizedReason = reason
        context.localizedFallbackTitle = ""
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: reason
        ) { success, error in
            DispatchQueue.main.async {
                if success {
                    completion(context)
                } else {
                    self.cancel(.userCanceled, message: error?.localizedDescription ?? "Cancelled")
                }
            }
        }
    }

    private func cancel(_ code: ASExtensionError.Code, message: String) {
        extensionContext.cancelRequest(
            withError: NSError(
                domain: ASExtensionErrorDomain,
                code: code.rawValue,
                userInfo: [NSLocalizedDescriptionKey: message]
            )
        )
    }
}

extension CredentialProviderViewController: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        choices.count
    }

    func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "credential", for: indexPath)
        var content = cell.defaultContentConfiguration()
        content.text = choices[indexPath.row].title
        content.secondaryText = choices[indexPath.row].subtitle
        content.image = UIImage(systemName: {
            if case .passkey = choices[indexPath.row] { return "person.badge.key" }
            return "key"
        }())
        cell.contentConfiguration = content
        cell.accessoryType = .disclosureIndicator
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let choice = choices[indexPath.row]
        switch choice {
        case .password:
            completePassword(choice: choice)
        case .passkey(let record):
            guard let parameters = passkeyParameters, let context = unlockedContext else {
                cancel(.failed, message: "The passkey request expired")
                return
            }
            do {
                try completePasskey(
                    record: record,
                    clientDataHash: parameters.clientDataHash,
                    context: context
                )
            } catch {
                cancel(.failed, message: error.localizedDescription)
            }
        }
    }
}
