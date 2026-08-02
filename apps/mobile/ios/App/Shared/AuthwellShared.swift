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

enum AuthwellAppGroup {
    static let identifier = "group.dev.lockbox.app"
    static let accountKey = "authwell.activeAccountId"
    static let indexSaltKey = "authwell.autofillIndexSalt"
    static let publicEncryptionKey = "authwell.publicEncryptionKey"
    static let biometricEnrolledKey = "authwell.biometricEnrolled"

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

struct AutofillRecord: Codable {
    let id: String
    let domainHashes: [String]
    let encryptedData: String
    let updatedAt: String
    let serviceIdentifiers: [String]
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
