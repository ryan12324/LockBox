import CryptoKit
import Foundation

enum AuthwellError: LocalizedError {
    case invalidArgument(String)
    case unavailable(String)
    case storage(String)
    case authentication(String)

    var errorDescription: String? {
        switch self {
        case .invalidArgument(let message),
             .unavailable(let message),
             .storage(let message),
             .authentication(let message):
            return message
        }
    }
}

enum NativeGeneratedPasswordKind {
    case strong
    case alphanumeric
}

struct NativeGeneratedPasswordChoice {
    let kind: NativeGeneratedPasswordKind
    let value: String
}

/**
 * In-memory password generation for AuthenticationServices signup requests.
 * It honors the common Password Rules constraints supplied by the target form
 * and never writes generated values to defaults, Keychain, logs, or the vault.
 */
enum NativePasswordGenerator {
    private static let uppercase = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    private static let lowercase = Array("abcdefghijklmnopqrstuvwxyz")
    private static let digits = Array("0123456789")
    private static let symbols = Array("!@#$%^&*()-_=+[]{};:,.?")
    private static let printable = Set(uppercase + lowercase + digits + symbols)

    static func choices(rules: [String?]) -> [NativeGeneratedPasswordChoice] {
        let policy = PasswordRulePolicy.parse(rules.compactMap { $0 })
        return [NativeGeneratedPasswordKind.strong, .alphanumeric].compactMap { kind in
            guard let value = generate(kind: kind, policy: policy) else { return nil }
            return NativeGeneratedPasswordChoice(kind: kind, value: value)
        }
    }

    private static func generate(
        kind: NativeGeneratedPasswordKind,
        policy: PasswordRulePolicy
    ) -> String? {
        var allowed = kind == .strong
            ? printable
            : Set(uppercase + lowercase + digits)
        if let ruleAllowed = policy.allowed {
            allowed.formIntersection(ruleAllowed)
        }
        guard !allowed.isEmpty else { return nil }

        var required = policy.required.map { $0.intersection(allowed) }
        guard required.allSatisfy({ !$0.isEmpty }) else { return nil }

        let securityPools = [Set(uppercase), Set(lowercase), Set(digits)]
        for pool in securityPools {
            let available = pool.intersection(allowed)
            if !available.isEmpty && !required.contains(where: { !$0.isDisjoint(with: available) }) {
                required.append(available)
            }
        }
        if kind == .strong {
            let availableSymbols = Set(symbols).intersection(allowed)
            guard !availableSymbols.isEmpty else { return nil }
            if !required.contains(where: { !$0.isDisjoint(with: availableSymbols) }) {
                required.append(availableSymbols)
            }
        }

        let minimum = max(policy.minimumLength, required.count, 8)
        let maximum = min(policy.maximumLength, 128)
        guard minimum <= maximum else { return nil }
        let length = min(max(20, minimum), maximum)
        let available = Array(allowed)

        for _ in 0..<64 {
            var random = SystemRandomNumberGenerator()
            var characters = required.compactMap { pool in
                Array(pool).randomElement(using: &random)
            }
            while characters.count < length {
                guard let next = available.randomElement(using: &random) else { return nil }
                characters.append(next)
            }
            characters.shuffle(using: &random)
            if respectsMaximumConsecutive(characters, maximum: policy.maximumConsecutive) {
                return String(characters)
            }
        }
        return nil
    }

    private static func respectsMaximumConsecutive(
        _ characters: [Character],
        maximum: Int?
    ) -> Bool {
        guard let maximum, maximum > 0 else { return true }
        var previous: Character?
        var count = 0
        for character in characters {
            if character == previous {
                count += 1
                if count > maximum { return false }
            } else {
                previous = character
                count = 1
            }
        }
        return true
    }

    private struct PasswordRulePolicy {
        var allowed: Set<Character>?
        var required: [Set<Character>]
        var minimumLength: Int
        var maximumLength: Int
        var maximumConsecutive: Int?

        static func parse(_ descriptors: [String]) -> PasswordRulePolicy {
            var policy = PasswordRulePolicy(
                allowed: nil,
                required: [],
                minimumLength: 0,
                maximumLength: 128,
                maximumConsecutive: nil
            )

            for descriptor in descriptors {
                var descriptorAllowed: Set<Character>?
                for clause in descriptor.split(separator: ";") {
                    let parts = clause.split(separator: ":", maxSplits: 1).map(String.init)
                    guard parts.count == 2 else { continue }
                    let name = parts[0].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    let value = parts[1].trimmingCharacters(in: .whitespacesAndNewlines)
                    switch name {
                    case "allowed":
                        if let characters = parseCharacterClasses(value), !characters.isEmpty {
                            descriptorAllowed = (descriptorAllowed ?? []).union(characters)
                        }
                    case "required":
                        if let characters = parseCharacterClasses(value), !characters.isEmpty {
                            policy.required.append(characters)
                        }
                    case "minlength":
                        if let length = Int(value), length > 0 {
                            policy.minimumLength = max(policy.minimumLength, length)
                        }
                    case "maxlength":
                        if let length = Int(value), length > 0 {
                            policy.maximumLength = min(policy.maximumLength, length)
                        }
                    case "max-consecutive":
                        if let count = Int(value), count > 0 {
                            policy.maximumConsecutive = min(policy.maximumConsecutive ?? count, count)
                        }
                    default:
                        continue
                    }
                }
                if let descriptorAllowed {
                    policy.allowed = policy.allowed.map { $0.intersection(descriptorAllowed) }
                        ?? descriptorAllowed
                }
            }
            if policy.allowed != nil {
                policy.required.forEach { policy.allowed?.formUnion($0) }
            }
            return policy
        }

        private static func parseCharacterClasses(_ value: String) -> Set<Character>? {
            var tokens: [String] = []
            var current = ""
            var bracketDepth = 0
            for character in value {
                if character == "[" { bracketDepth += 1 }
                if character == "]" { bracketDepth = max(0, bracketDepth - 1) }
                if character == "," && bracketDepth == 0 {
                    tokens.append(current)
                    current = ""
                } else {
                    current.append(character)
                }
            }
            tokens.append(current)

            var characters = Set<Character>()
            var recognized = false
            for rawToken in tokens {
                let token = rawToken.trimmingCharacters(in: .whitespacesAndNewlines)
                switch token.lowercased() {
                case "upper": characters.formUnion(uppercase); recognized = true
                case "lower": characters.formUnion(lowercase); recognized = true
                case "digit", "digits": characters.formUnion(digits); recognized = true
                case "special": characters.formUnion(symbols); recognized = true
                case "ascii-printable", "unicode": characters.formUnion(printable); recognized = true
                default:
                    if token.first == "[", token.last == "]", token.count >= 2 {
                        characters.formUnion(token.dropFirst().dropLast())
                        recognized = true
                    }
                }
            }
            return recognized ? characters : nil
        }
    }
}

enum AuthwellAppGroup {
    static let identifier = "group.dev.lockbox.app"
    static let accountKey = "authwell.activeAccountId"
    static let indexSaltKey = "authwell.autofillIndexSalt"
    static let publicEncryptionKey = "authwell.publicEncryptionKey"
    static let outboxPublicEncryptionKey = "authwell.outboxPublicEncryptionKey.v1"
    static let biometricEnrolledKey = "authwell.biometricEnrolled"
    static let biometricWrappedVaultKey = "authwell.biometricWrappedVaultKey.v2"
    static let biometricScopeKey = "authwell.biometricScope.v2"
    static let pendingSaveAccountKey = "authwell.pendingSave.account.v1"
    static let pendingSaveProofHashKey = "authwell.pendingSave.proofHash.v1"

    static func sharedDefaults() throws -> UserDefaults {
        guard let defaults = UserDefaults(suiteName: identifier) else {
            throw AuthwellError.storage("The Authwell App Group is not configured")
        }
        return defaults
    }

    static func containerURL() throws -> URL {
        guard let url = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: identifier
        ) else {
            throw AuthwellError.storage("The Authwell App Group is not available")
        }
        return url
    }

    static func keychainAccessGroup() throws -> String {
        guard
            let group = Bundle.main.object(forInfoDictionaryKey: "AuthwellKeychainAccessGroup") as? String,
            !group.isEmpty,
            !group.contains("$(")
        else {
            throw AuthwellError.storage("The Authwell Keychain Access Group is not configured")
        }
        return group
    }
}

struct AutofillDiagnosticsSnapshot {
    let indexedCredentials: Int
    let indexedAt: Int64?
    let lastRequestAt: Int64?
    let lastMatchCount: Int?
    let lastError: String?

    var bridgeValue: [String: Any] {
        var value: [String: Any] = [
            "indexedCredentials": indexedCredentials,
        ]
        if let indexedAt { value["indexedAt"] = indexedAt }
        if let lastRequestAt { value["lastRequestAt"] = lastRequestAt }
        if let lastMatchCount { value["lastMatchCount"] = lastMatchCount }
        if let lastError { value["lastError"] = lastError }
        return value
    }
}

enum AutofillDiagnostics {
    private static let indexedCountKey = "authwell.autofillHealth.indexedCount"
    private static let indexedAtKey = "authwell.autofillHealth.indexedAt"
    private static let lastRequestAtKey = "authwell.autofillHealth.lastRequestAt"
    private static let lastMatchCountKey = "authwell.autofillHealth.lastMatchCount"
    private static let lastErrorKey = "authwell.autofillHealth.lastError"

    static func recordIndex(count: Int) throws {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.set(count, forKey: indexedCountKey)
        defaults.set(nowMilliseconds, forKey: indexedAtKey)
        defaults.removeObject(forKey: lastErrorKey)
    }

    static func recordRequest(matchCount: Int) throws {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.set(nowMilliseconds, forKey: lastRequestAtKey)
        defaults.set(matchCount, forKey: lastMatchCountKey)
        defaults.removeObject(forKey: lastErrorKey)
    }

    static func recordFailure(_ message: String) throws {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.set(nowMilliseconds, forKey: lastRequestAtKey)
        defaults.set(String(message.prefix(160)), forKey: lastErrorKey)
    }

    static func clearIndex() throws {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.set(0, forKey: indexedCountKey)
        defaults.removeObject(forKey: indexedAtKey)
        defaults.removeObject(forKey: lastErrorKey)
    }

    static func snapshot() throws -> AutofillDiagnosticsSnapshot {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        return AutofillDiagnosticsSnapshot(
            indexedCredentials: defaults.integer(forKey: indexedCountKey),
            indexedAt: optionalInt64(defaults, key: indexedAtKey),
            lastRequestAt: optionalInt64(defaults, key: lastRequestAtKey),
            lastMatchCount: defaults.object(forKey: lastMatchCountKey) == nil
                ? nil
                : defaults.integer(forKey: lastMatchCountKey),
            lastError: defaults.string(forKey: lastErrorKey)
        )
    }

    private static var nowMilliseconds: Int64 {
        Int64((Date().timeIntervalSince1970 * 1_000).rounded())
    }

    private static func optionalInt64(_ defaults: UserDefaults, key: String) -> Int64? {
        guard defaults.object(forKey: key) != nil else { return nil }
        return Int64(defaults.double(forKey: key))
    }
}

extension Data {
    init?(base64URLEncoded value: String) {
        var base64 = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder != 0 {
            base64.append(String(repeating: "=", count: 4 - remainder))
        }
        self.init(base64Encoded: base64)
    }

    var base64URLEncodedString: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum InputValidation {
    static func boundedString(
        _ dictionary: [String: Any],
        key: String,
        minimum: Int = 1,
        maximum: Int
    ) throws -> String {
        guard
            let value = dictionary[key] as? String,
            value.count >= minimum,
            value.count <= maximum
        else {
            throw AuthwellError.invalidArgument("Invalid \(key)")
        }
        return value
    }

    static func canonicalBase64URL(
        _ dictionary: [String: Any],
        key: String,
        minimumBytes: Int,
        maximumBytes: Int
    ) throws -> String {
        let value = try boundedString(dictionary, key: key, maximum: maximumBytes * 2)
        guard
            value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
            let data = Data(base64URLEncoded: value),
            data.count >= minimumBytes,
            data.count <= maximumBytes,
            data.base64URLEncodedString == value
        else {
            throw AuthwellError.invalidArgument("Invalid \(key)")
        }
        return value
    }

    static func relyingParty(_ dictionary: [String: Any], key: String = "rpId") throws -> String {
        let value = try boundedString(dictionary, key: key, maximum: 253)
        guard value == value.lowercased(), !value.hasSuffix(".") else {
            throw AuthwellError.invalidArgument("Invalid \(key)")
        }
        let labelPattern = "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
        guard value.split(separator: ".", omittingEmptySubsequences: false).allSatisfy({
            String($0).range(of: labelPattern, options: .regularExpression) != nil
        }) else {
            throw AuthwellError.invalidArgument("Invalid \(key)")
        }
        return value
    }
}

enum DomainIdentifier {
    static func normalize(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }

        // iOS matches native apps through their associated web domains. Android
        // package targets must never be published as iOS domain identities.
        if trimmed.hasPrefix("iosapp://") || trimmed.hasPrefix("androidapp://") {
            return nil
        }

        let candidate = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard let host = URLComponents(string: candidate)?.host else { return nil }
        return host.removingPrefix("www.").trimmingCharacters(in: CharacterSet(charactersIn: "."))
    }

    static func hash(_ identifier: String) throws -> String {
        guard let normalized = normalize(identifier) else {
            throw AuthwellError.invalidArgument("Invalid autofill identifier")
        }
        let defaults = try AuthwellAppGroup.sharedDefaults()
        let salt: Data
        if let existing = defaults.data(forKey: AuthwellAppGroup.indexSaltKey) {
            salt = existing
        } else {
            var bytes = [UInt8](repeating: 0, count: 32)
            let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            guard status == errSecSuccess else {
                throw AuthwellError.storage("Could not create the autofill index salt")
            }
            salt = Data(bytes)
            defaults.set(salt, forKey: AuthwellAppGroup.indexSaltKey)
        }
        return Data(SHA256.hash(data: salt + Data(normalized.utf8))).map {
            String(format: "%02x", $0)
        }.joined()
    }
}

private extension String {
    func removingPrefix(_ prefix: String) -> String {
        hasPrefix(prefix) ? String(dropFirst(prefix.count)) : self
    }
}

struct VaultRecord: Codable {
    let id: String
    let encryptedData: String
    let type: String
    let folderId: String?
    let tags: [String]
    let favorite: Bool
    let revisionDate: String
    var baseRevisionDate: String?
    var syncStatus: String

    var bridgeValue: [String: Any] {
        [
            "id": id,
            "encryptedData": encryptedData,
            "type": type,
            "folderId": folderId.map { $0 as Any } ?? NSNull(),
            "tags": tags,
            "favorite": favorite,
            "revisionDate": revisionDate,
            "baseRevisionDate": baseRevisionDate.map { $0 as Any } ?? NSNull(),
            "syncStatus": syncStatus,
        ]
    }
}

enum AutofillPresentation {
    private static let maximumDisplayUsernameLength = 200

    static func username(_ value: String) -> String {
        String(
            value
                .split(whereSeparator: { $0.isWhitespace })
                .joined(separator: " ")
                .prefix(maximumDisplayUsernameLength)
        )
    }

    static func credentialLabel(_ value: String) -> String {
        let displayUsername = username(value)
        return displayUsername.isEmpty ? "Authwell credential" : displayUsername
    }

    static func authenticationReason(_ value: String) -> String {
        let displayUsername = username(value)
        return displayUsername.isEmpty
            ? "Use an Authwell credential"
            : "Use \(displayUsername) with Authwell"
    }
}

struct AutofillRecord: Codable {
    let id: String
    let domainHashes: [String]
    let displayUsername: String
    let encryptedData: String
    let updatedAt: String
    let serviceIdentifiers: [String]

    init(
        id: String,
        domainHashes: [String],
        displayUsername: String,
        encryptedData: String,
        updatedAt: String,
        serviceIdentifiers: [String]
    ) {
        self.id = id
        self.domainHashes = domainHashes
        self.displayUsername = AutofillPresentation.username(displayUsername)
        self.encryptedData = encryptedData
        self.updatedAt = updatedAt
        self.serviceIdentifiers = serviceIdentifiers
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case domainHashes
        case displayUsername
        case encryptedData
        case updatedAt
        case serviceIdentifiers
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        domainHashes = try container.decode([String].self, forKey: .domainHashes)
        displayUsername = AutofillPresentation.username(
            try container.decodeIfPresent(String.self, forKey: .displayUsername) ?? ""
        )
        encryptedData = try container.decode(String.self, forKey: .encryptedData)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
        serviceIdentifiers = try container.decode([String].self, forKey: .serviceIdentifiers)
    }
}

struct TotpRecord: Codable {
    let id: String
    let domainHashes: [String]
    let displayLabel: String
    let encryptedData: String
    let updatedAt: String
    let serviceIdentifiers: [String]

    init(
        id: String,
        domainHashes: [String],
        displayLabel: String,
        encryptedData: String,
        updatedAt: String,
        serviceIdentifiers: [String]
    ) {
        self.id = id
        self.domainHashes = domainHashes
        self.displayLabel = AutofillPresentation.username(displayLabel)
        self.encryptedData = encryptedData
        self.updatedAt = updatedAt
        self.serviceIdentifiers = serviceIdentifiers
    }
}

struct PendingCredentialSaveRecord: Codable {
    let id: String
    let accountId: String
    let createdAt: String
    let encryptedData: String
    let domainHashes: [String]
    /// Present when the biometric AutoFill index was available at capture
    /// time. The encrypted pending save remains durable without it and is
    /// imported into the vault after the next unlock.
    let autofillRecord: AutofillRecord?

    var metadataBridgeValue: [String: Any] {
        ["id": id, "createdAt": createdAt]
    }
}

struct PendingTotpSetupRecord: Codable {
    let id: String
    let accountId: String
    let createdAt: String
    let scheme: String
    let encryptedData: String

    var metadataBridgeValue: [String: Any] {
        ["id": id, "createdAt": createdAt, "scheme": scheme]
    }
}

enum PendingSaveAuthorization {
    static func configure(accountId: String, proof: Data) throws {
        guard proof.count == 32 else {
            throw AuthwellError.invalidArgument("Invalid saved-login authorization")
        }
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.set(accountId, forKey: AuthwellAppGroup.pendingSaveAccountKey)
        defaults.set(
            Data(SHA256.hash(data: proof)),
            forKey: AuthwellAppGroup.pendingSaveProofHashKey
        )
    }

    static func verify(accountId: String, proof: Data) throws -> Bool {
        guard proof.count == 32 else { return false }
        let defaults = try AuthwellAppGroup.sharedDefaults()
        guard defaults.string(forKey: AuthwellAppGroup.pendingSaveAccountKey) == accountId,
              let expected = defaults.data(forKey: AuthwellAppGroup.pendingSaveProofHashKey) else {
            return false
        }
        return constantTimeEqual(expected, Data(SHA256.hash(data: proof)))
    }

    static func clear() throws {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.removeObject(forKey: AuthwellAppGroup.pendingSaveAccountKey)
        defaults.removeObject(forKey: AuthwellAppGroup.pendingSaveProofHashKey)
    }

    private static func constantTimeEqual(_ left: Data, _ right: Data) -> Bool {
        guard left.count == right.count else { return false }
        var difference: UInt8 = 0
        for index in left.indices { difference |= left[index] ^ right[index] }
        return difference == 0
    }
}

struct NativeTotpConfiguration: Codable {
    let secret: Data
    let period: Int
    let digits: Int
    let algorithm: String

    static func parse(_ value: String) throws -> NativeTotpConfiguration {
        let input = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty, input.count <= 16_384 else {
            throw AuthwellError.invalidArgument("Invalid authenticator key")
        }
        if input.lowercased().hasPrefix("otpauth://") {
            guard let components = URLComponents(string: input),
                  components.scheme?.lowercased() == "otpauth",
                  components.host?.lowercased() == "totp" else {
                throw AuthwellError.invalidArgument("Only TOTP setup links are supported")
            }
            var values: [String: String] = [:]
            for item in components.queryItems ?? [] {
                let key = item.name.lowercased()
                guard values[key] == nil else {
                    throw AuthwellError.invalidArgument("Duplicate authenticator parameter")
                }
                values[key] = item.value ?? ""
            }
            guard let encodedSecret = values["secret"] else {
                throw AuthwellError.invalidArgument("The authenticator key is missing")
            }
            return try NativeTotpConfiguration(
                secret: decodeBase32(encodedSecret),
                period: parseInteger(values["period"], defaultValue: 30, range: 1...86_400),
                digits: parseInteger(values["digits"], defaultValue: 6, range: 6...8),
                algorithm: normalizeAlgorithm(values["algorithm"])
            )
        }
        return try NativeTotpConfiguration(
            secret: decodeBase32(input),
            period: 30,
            digits: 6,
            algorithm: "SHA1"
        )
    }

    func code(at date: Date = Date()) throws -> String {
        let counter = UInt64(floor(date.timeIntervalSince1970 / Double(period)))
        var bigEndian = counter.bigEndian
        let message = withUnsafeBytes(of: &bigEndian) { Data($0) }
        let digest: Data
        switch algorithm {
        case "SHA1":
            digest = Data(HMAC<Insecure.SHA1>.authenticationCode(for: message, using: SymmetricKey(data: secret)))
        case "SHA256":
            digest = Data(HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: secret)))
        case "SHA512":
            digest = Data(HMAC<SHA512>.authenticationCode(for: message, using: SymmetricKey(data: secret)))
        default:
            throw AuthwellError.storage("Unsupported authenticator algorithm")
        }
        let offset = Int(digest[digest.count - 1] & 0x0f)
        guard offset + 3 < digest.count else {
            throw AuthwellError.storage("The authenticator result is malformed")
        }
        let binary = (UInt32(digest[offset] & 0x7f) << 24)
            | (UInt32(digest[offset + 1]) << 16)
            | (UInt32(digest[offset + 2]) << 8)
            | UInt32(digest[offset + 3])
        return String(format: "%0*u", digits, binary % UInt32(pow(10.0, Double(digits))))
    }

    private static func parseInteger(
        _ value: String?,
        defaultValue: Int,
        range: ClosedRange<Int>
    ) throws -> Int {
        guard let value else { return defaultValue }
        guard value.range(of: "^[0-9]+$", options: .regularExpression) != nil,
              let parsed = Int(value), range.contains(parsed) else {
            throw AuthwellError.invalidArgument("Invalid authenticator parameter")
        }
        return parsed
    }

    private static func normalizeAlgorithm(_ value: String?) throws -> String {
        switch (value ?? "SHA1").uppercased().replacingOccurrences(of: "-", with: "") {
        case "SHA1": return "SHA1"
        case "SHA256": return "SHA256"
        case "SHA512": return "SHA512"
        default: throw AuthwellError.invalidArgument("Unsupported authenticator algorithm")
        }
    }

    private static func decodeBase32(_ value: String) throws -> Data {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
        let lookup = Dictionary(uniqueKeysWithValues: alphabet.enumerated().map { ($0.element, $0.offset) })
        let normalized = value.uppercased().filter { !$0.isWhitespace && $0 != "-" && $0 != "=" }
        guard normalized.count >= 16, normalized.count <= 4_096 else {
            throw AuthwellError.invalidArgument("Invalid authenticator key")
        }
        var buffer = 0
        var bits = 0
        var bytes: [UInt8] = []
        for character in normalized {
            guard let digit = lookup[character] else {
                throw AuthwellError.invalidArgument("Invalid authenticator key")
            }
            buffer = (buffer << 5) | digit
            bits += 5
            if bits >= 8 {
                bits -= 8
                bytes.append(UInt8((buffer >> bits) & 0xff))
                buffer &= (1 << bits) - 1
            }
        }
        guard bytes.count >= 10, bytes.count <= 256 else {
            throw AuthwellError.invalidArgument("Invalid authenticator key")
        }
        return Data(bytes)
    }
}

struct PasskeyRecord: Codable {
    static let sourcePending = "pending"
    static let sourceSynced = "synced"

    let credentialId: String
    let rpId: String
    let rpName: String
    let userName: String
    let userDisplayName: String
    let userId: String
    let createdAt: String
    let encryptedPrivateKey: String
    let publicKey: String
    let vaultItemId: String
    let accountId: String
    var source: String

    var metadataBridgeValue: [String: Any] {
        [
            "credentialId": credentialId,
            "rpId": rpId,
            "rpName": rpName,
            "userName": userName,
            "userDisplayName": userDisplayName,
        ]
    }
}

enum PasskeyEncoding {
    static func cosePublicKey(_ publicKey: P256.Signing.PublicKey) throws -> Data {
        let representation = publicKey.x963Representation
        guard representation.count == 65, representation.first == 0x04 else {
            throw AuthwellError.storage("Invalid P-256 public key")
        }
        let x = representation[representation.index(after: representation.startIndex)..<representation.index(representation.startIndex, offsetBy: 33)]
        let y = representation[representation.index(representation.startIndex, offsetBy: 33)..<representation.endIndex]
        return Data([0xA5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20])
            + Data(x)
            + Data([0x22, 0x58, 0x20])
            + Data(y)
    }

    static func registrationAuthenticatorData(
        relyingParty: String,
        credentialID: Data,
        coseKey: Data
    ) -> Data {
        var result = Data(SHA256.hash(data: Data(relyingParty.utf8)))
        result.append(0x4D) // UP | UV | BE | AT; backup is pending.
        result.append(contentsOf: [0, 0, 0, 0])
        result.append(contentsOf: [UInt8](repeating: 0, count: 16))
        result.append(UInt8((credentialID.count >> 8) & 0xFF))
        result.append(UInt8(credentialID.count & 0xFF))
        result.append(credentialID)
        result.append(coseKey)
        return result
    }

    static func assertionAuthenticatorData(relyingParty: String, isSynced: Bool) -> Data {
        var result = Data(SHA256.hash(data: Data(relyingParty.utf8)))
        result.append(isSynced ? 0x1D : 0x0D) // UP | UV | BE, plus BS after vault upload.
        result.append(contentsOf: [0, 0, 0, 0])
        return result
    }

    static func attestationObject(authenticatorData: Data) -> Data {
        var result = Data([0xA3])
        result.append(cborText("fmt"))
        result.append(cborText("none"))
        result.append(cborText("attStmt"))
        result.append(0xA0)
        result.append(cborText("authData"))
        result.append(cborBytes(authenticatorData))
        return result
    }

    static func cosePublicKey(fromAttestationObject attestationObject: Data) throws -> Data {
        var attestationReader = CBORReader(data: attestationObject)
        let authenticatorData = try attestationReader.authenticatorData()
        guard attestationReader.isAtEnd else {
            throw AuthwellError.storage("The passkey attestation object has trailing data")
        }

        // WebAuthn authenticator data begins with rpIdHash (32), flags (1),
        // signCount (4), followed by attested credential data when AT is set.
        guard authenticatorData.count >= 55, authenticatorData[32] & 0x40 != 0 else {
            throw AuthwellError.storage("The passkey attestation has no public key")
        }
        let credentialIDLength = (Int(authenticatorData[53]) << 8)
            | Int(authenticatorData[54])
        let publicKeyOffset = 55 + credentialIDLength
        guard publicKeyOffset < authenticatorData.count else {
            throw AuthwellError.storage("The passkey attestation is truncated")
        }

        var keyReader = CBORReader(data: Data(authenticatorData[publicKeyOffset...]))
        let encodedKey = try keyReader.encodedItem(expectedMajorType: 5)
        guard !encodedKey.isEmpty else {
            throw AuthwellError.storage("The passkey public key is empty")
        }
        return encodedKey
    }

    private static func cborText(_ value: String) -> Data {
        let bytes = Data(value.utf8)
        return cborHeader(major: 3, length: bytes.count) + bytes
    }

    private static func cborBytes(_ value: Data) -> Data {
        cborHeader(major: 2, length: value.count) + value
    }

    private static func cborHeader(major: UInt8, length: Int) -> Data {
        let base = major << 5
        if length < 24 { return Data([base | UInt8(length)]) }
        if length < 256 { return Data([base | 24, UInt8(length)]) }
        if length < 65_536 {
            return Data([base | 25, UInt8((length >> 8) & 0xFF), UInt8(length & 0xFF)])
        }
        return Data([
            base | 26,
            UInt8((length >> 24) & 0xFF),
            UInt8((length >> 16) & 0xFF),
            UInt8((length >> 8) & 0xFF),
            UInt8(length & 0xFF),
        ])
    }
}

private struct CBORReader {
    private let bytes: [UInt8]
    private(set) var offset = 0

    init(data: Data) {
        bytes = Array(data)
    }

    var isAtEnd: Bool { offset == bytes.count }

    mutating func authenticatorData() throws -> Data {
        let entryCount = try collectionCount(expectedMajorType: 5)
        var remaining = entryCount
        while remaining == nil || remaining! > 0 {
            if remaining == nil, try consumeBreakIfPresent() { break }
            let key = try textString()
            if key == "authData" {
                let value = try byteString()
                if let count = remaining { remaining = count - 1 }
                while remaining == nil || remaining! > 0 {
                    if remaining == nil, try consumeBreakIfPresent() { break }
                    try skipItem(depth: 0)
                    try skipItem(depth: 0)
                    if let count = remaining { remaining = count - 1 }
                }
                return value
            }
            try skipItem(depth: 0)
            if let count = remaining { remaining = count - 1 }
        }
        throw AuthwellError.storage("The passkey attestation has no authenticator data")
    }

    mutating func encodedItem(expectedMajorType: UInt8) throws -> Data {
        let start = offset
        let header = try peekHeader()
        guard header.majorType == expectedMajorType else {
            throw AuthwellError.storage("The passkey public key has an invalid CBOR type")
        }
        try skipItem(depth: 0)
        return Data(bytes[start..<offset])
    }

    private mutating func textString() throws -> String {
        let length = try definiteLength(expectedMajorType: 3)
        let data = try readBytes(count: length)
        guard let result = String(data: data, encoding: .utf8) else {
            throw AuthwellError.storage("The passkey attestation contains invalid text")
        }
        return result
    }

    private mutating func byteString() throws -> Data {
        let header = try readHeader()
        guard header.majorType == 2 else {
            throw AuthwellError.storage("The passkey authenticator data is not a byte string")
        }
        if let length = header.length {
            return try readBytes(count: length)
        }

        var result = Data()
        while !(try consumeBreakIfPresent()) {
            result.append(try readBytes(count: definiteLength(expectedMajorType: 2)))
        }
        return result
    }

    private mutating func skipItem(depth: Int) throws {
        guard depth < 64 else {
            throw AuthwellError.storage("The passkey attestation is too deeply nested")
        }
        let header = try readHeader()
        switch header.majorType {
        case 0, 1, 7:
            guard header.length != nil else {
                throw AuthwellError.storage("The passkey attestation contains an unexpected break")
            }
        case 2, 3:
            if let length = header.length {
                _ = try readBytes(count: length)
            } else {
                while !(try consumeBreakIfPresent()) {
                    let chunk = try readHeader()
                    guard chunk.majorType == header.majorType, let length = chunk.length else {
                        throw AuthwellError.storage("The passkey attestation has an invalid CBOR string")
                    }
                    _ = try readBytes(count: length)
                }
            }
        case 4:
            try skipCollectionItems(header.length, multiplier: 1, depth: depth)
        case 5:
            try skipCollectionItems(header.length, multiplier: 2, depth: depth)
        case 6:
            guard header.length != nil else {
                throw AuthwellError.storage("The passkey attestation has an invalid CBOR tag")
            }
            try skipItem(depth: depth + 1)
        default:
            throw AuthwellError.storage("The passkey attestation has an invalid CBOR type")
        }
    }

    private mutating func skipCollectionItems(
        _ count: Int?,
        multiplier: Int,
        depth: Int
    ) throws {
        if let count {
            guard count <= Int.max / multiplier else {
                throw AuthwellError.storage("The passkey attestation is too large")
            }
            for _ in 0..<(count * multiplier) {
                try skipItem(depth: depth + 1)
            }
            return
        }
        while !(try consumeBreakIfPresent()) {
            for _ in 0..<multiplier {
                try skipItem(depth: depth + 1)
            }
        }
    }

    private mutating func collectionCount(expectedMajorType: UInt8) throws -> Int? {
        let header = try readHeader()
        guard header.majorType == expectedMajorType else {
            throw AuthwellError.storage("The passkey attestation has an invalid CBOR container")
        }
        return header.length
    }

    private mutating func definiteLength(expectedMajorType: UInt8) throws -> Int {
        let header = try readHeader()
        guard header.majorType == expectedMajorType, let length = header.length else {
            throw AuthwellError.storage("The passkey attestation has an invalid CBOR value")
        }
        return length
    }

    private mutating func consumeBreakIfPresent() throws -> Bool {
        guard offset < bytes.count else {
            throw AuthwellError.storage("The passkey attestation is truncated")
        }
        guard bytes[offset] == 0xFF else { return false }
        offset += 1
        return true
    }

    private func peekHeader() throws -> (majorType: UInt8, length: Int?) {
        var copy = self
        return try copy.readHeader()
    }

    private mutating func readHeader() throws -> (majorType: UInt8, length: Int?) {
        let initial = try readByte()
        let majorType = initial >> 5
        let additional = initial & 0x1F
        if additional == 31 { return (majorType, nil) }

        let value: UInt64
        switch additional {
        case 0...23: value = UInt64(additional)
        case 24: value = UInt64(try readByte())
        case 25: value = try readUnsignedInteger(byteCount: 2)
        case 26: value = try readUnsignedInteger(byteCount: 4)
        case 27: value = try readUnsignedInteger(byteCount: 8)
        default:
            throw AuthwellError.storage("The passkey attestation has an invalid CBOR header")
        }
        guard value <= UInt64(Int.max) else {
            throw AuthwellError.storage("The passkey attestation is too large")
        }
        return (majorType, Int(value))
    }

    private mutating func readUnsignedInteger(byteCount: Int) throws -> UInt64 {
        var value: UInt64 = 0
        for _ in 0..<byteCount {
            value = (value << 8) | UInt64(try readByte())
        }
        return value
    }

    private mutating func readByte() throws -> UInt8 {
        guard offset < bytes.count else {
            throw AuthwellError.storage("The passkey attestation is truncated")
        }
        defer { offset += 1 }
        return bytes[offset]
    }

    private mutating func readBytes(count: Int) throws -> Data {
        guard count >= 0, count <= bytes.count - offset else {
            throw AuthwellError.storage("The passkey attestation is truncated")
        }
        defer { offset += count }
        return Data(bytes[offset..<(offset + count)])
    }
}
