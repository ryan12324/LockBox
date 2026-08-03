import CryptoKit
import Foundation
import LocalAuthentication
import Security

private let authwellDeviceKeyAccessibility: CFString = {
#if targetEnvironment(simulator)
    // Simulator biometric automation has no supported passcode-enrollment API.
    // Keep the key device-only and biometric-gated while real devices retain
    // the stronger passcode-required accessibility class below.
    return kSecAttrAccessibleWhenUnlockedThisDeviceOnly
#else
    return kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
#endif
}()

enum DeviceIndexCrypto {
    private static let keyTag = Data("dev.lockbox.app.autofill-ecies-v1".utf8)
    private static let algorithm: SecKeyAlgorithm = .eciesEncryptionCofactorX963SHA256AESGCM

    static func encrypt(_ plaintext: Data) throws -> String {
        let publicKey = try encryptionPublicKey()
        guard SecKeyIsAlgorithmSupported(publicKey, .encrypt, algorithm) else {
            throw AuthwellError.unavailable("This device cannot protect the AutoFill index")
        }
        var error: Unmanaged<CFError>?
        guard let ciphertext = SecKeyCreateEncryptedData(
            publicKey,
            algorithm,
            plaintext as CFData,
            &error
        ) as Data? else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.storage("Could not encrypt the AutoFill index")
        }
        return ciphertext.base64EncodedString()
    }

    static func decrypt(_ encoded: String, context: LAContext) throws -> Data {
        guard let ciphertext = Data(base64Encoded: encoded) else {
            throw AuthwellError.storage("The protected credential is malformed")
        }
        let privateKey = try decryptionPrivateKey(context: context)
        guard SecKeyIsAlgorithmSupported(privateKey, .decrypt, algorithm) else {
            throw AuthwellError.unavailable("This device cannot unlock the AutoFill index")
        }
        var error: Unmanaged<CFError>?
        guard let plaintext = SecKeyCreateDecryptedData(
            privateKey,
            algorithm,
            ciphertext as CFData,
            &error
        ) as Data? else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.authentication("The protected credential could not be unlocked")
        }
        return plaintext
    }

    private static func encryptionPublicKey() throws -> SecKey {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        if let representation = defaults.data(forKey: AuthwellAppGroup.publicEncryptionKey),
           let publicKey = SecKeyCreateWithData(
               representation as CFData,
               [
                   kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
                   kSecAttrKeyClass: kSecAttrKeyClassPublic,
                   kSecAttrKeySizeInBits: 256,
               ] as CFDictionary,
               nil
           ) {
            return publicKey
        }
        return try createKeyPair()
    }

    private static func createKeyPair() throws -> SecKey {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            authwellDeviceKeyAccessibility,
            [.privateKeyUsage, .biometryCurrentSet],
            &accessError
        ) else {
            throw (accessError?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Biometric key protection is unavailable")
        }

        _ = SecItemDelete([
            kSecClass: kSecClassKey,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
        ] as CFDictionary)

        let privateAttributes: [CFString: Any] = [
            kSecAttrIsPermanent: true,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
            kSecAttrAccessControl: access,
        ]
        var attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecPrivateKeyAttrs: privateAttributes,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
        ]

        var error: Unmanaged<CFError>?
        var privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
#if targetEnvironment(simulator)
        if privateKey == nil {
            // The Simulator has no Secure Enclave. A Data Protection Keychain
            // key preserves the same biometric access-control contract there.
            attributes.removeValue(forKey: kSecAttrTokenID)
            error = nil
            privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
        }
#endif
        guard let privateKey, let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Could not create biometric AutoFill protection")
        }
        var representationError: Unmanaged<CFError>?
        guard let representation = SecKeyCopyExternalRepresentation(
            publicKey,
            &representationError
        ) as Data? else {
            throw (representationError?.takeRetainedValue() as Error?)
                ?? AuthwellError.storage("Could not export the AutoFill public key")
        }
        try AuthwellAppGroup.sharedDefaults().set(
            representation,
            forKey: AuthwellAppGroup.publicEncryptionKey
        )
        return publicKey
    }

    private static func decryptionPrivateKey(context: LAContext) throws -> SecKey {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let query: [CFString: Any] = [
            kSecClass: kSecClassKey,
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnRef: true,
            kSecUseAuthenticationContext: context,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let key = item as! SecKey? else {
            throw AuthwellError.authentication(
                status == errSecItemNotFound
                    ? "Unlock Authwell once to prepare AutoFill"
                    : "Biometric authentication was not completed"
            )
        }
        return key
    }
}

/// Non-exportable device-only protection for saves waiting on an unlocked vault.
/// Unlike the AutoFill index key, this key does not trigger another biometric
/// prompt: release is gated by the HMAC proof derived from the live vault key.
enum DeviceOutboxCrypto {
    private static let keyTag = Data("dev.lockbox.app.pending-outbox-ecies-v1".utf8)
    private static let algorithm: SecKeyAlgorithm = .eciesEncryptionCofactorX963SHA256AESGCM

    static func encrypt(_ plaintext: Data) throws -> String {
        let publicKey = try encryptionPublicKey()
        guard SecKeyIsAlgorithmSupported(publicKey, .encrypt, algorithm) else {
            throw AuthwellError.unavailable("This device cannot protect pending credentials")
        }
        var error: Unmanaged<CFError>?
        guard let ciphertext = SecKeyCreateEncryptedData(
            publicKey,
            algorithm,
            plaintext as CFData,
            &error
        ) as Data? else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.storage("Could not encrypt the pending credential")
        }
        return ciphertext.base64EncodedString()
    }

    /// Ensures the pending-save key is available before a generated password
    /// leaves AuthenticationServices' password chooser.
    static func prepareForEncryption() throws {
        _ = try encryptionPublicKey()
    }

    static func decrypt(_ encoded: String) throws -> Data {
        guard let ciphertext = Data(base64Encoded: encoded) else {
            throw AuthwellError.storage("The pending credential is malformed")
        }
        let privateKey = try decryptionPrivateKey()
        var error: Unmanaged<CFError>?
        guard let plaintext = SecKeyCreateDecryptedData(
            privateKey,
            algorithm,
            ciphertext as CFData,
            &error
        ) as Data? else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.authentication("The pending credential cannot be unlocked")
        }
        return plaintext
    }

    static func removeKey() throws {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let status = SecItemDelete([
            kSecClass: kSecClassKey,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
        ] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthwellError.storage("Could not remove the pending-credential key")
        }
        try AuthwellAppGroup.sharedDefaults().removeObject(
            forKey: AuthwellAppGroup.outboxPublicEncryptionKey
        )
    }

    private static func encryptionPublicKey() throws -> SecKey {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        if let representation = defaults.data(forKey: AuthwellAppGroup.outboxPublicEncryptionKey),
           let key = SecKeyCreateWithData(
               representation as CFData,
               [
                   kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
                   kSecAttrKeyClass: kSecAttrKeyClassPublic,
                   kSecAttrKeySizeInBits: 256,
               ] as CFDictionary,
               nil
           ) {
            return key
        }
        return try createKeyPair()
    }

    private static func createKeyPair() throws -> SecKey {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            authwellDeviceKeyAccessibility,
            [.privateKeyUsage],
            &accessError
        ) else {
            throw (accessError?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Device-only credential protection is unavailable")
        }
        _ = SecItemDelete([
            kSecClass: kSecClassKey,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
        ] as CFDictionary)
        let privateAttributes: [CFString: Any] = [
            kSecAttrIsPermanent: true,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
            kSecAttrAccessControl: access,
        ]
        var attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecPrivateKeyAttrs: privateAttributes,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
        ]
        var error: Unmanaged<CFError>?
        var privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
#if targetEnvironment(simulator)
        if privateKey == nil {
            attributes.removeValue(forKey: kSecAttrTokenID)
            error = nil
            privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
        }
#endif
        guard let privateKey, let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Could not create device-only credential protection")
        }
        var representationError: Unmanaged<CFError>?
        guard let representation = SecKeyCopyExternalRepresentation(
            publicKey,
            &representationError
        ) as Data? else {
            throw (representationError?.takeRetainedValue() as Error?)
                ?? AuthwellError.storage("Could not store credential protection")
        }
        try defaultsSetPublicKey(representation)
        return publicKey
    }

    private static func defaultsSetPublicKey(_ representation: Data) throws {
        try AuthwellAppGroup.sharedDefaults().set(
            representation,
            forKey: AuthwellAppGroup.outboxPublicEncryptionKey
        )
    }

    private static func decryptionPrivateKey() throws -> SecKey {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let query: [CFString: Any] = [
            kSecClass: kSecClassKey,
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnRef: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let key = item as! SecKey? else {
            throw AuthwellError.authentication("The device-only credential key is unavailable")
        }
        return key
    }
}

enum BiometricVault {
    private static let keyTag = Data("dev.lockbox.app.biometric-unlock-ecies-v2".utf8)
    private static let algorithm: SecKeyAlgorithm = .eciesEncryptionCofactorX963SHA256AESGCM
    private static let legacyService = "dev.lockbox.app.biometric-unlock"
    private static let legacyAccount = "user-key"

    struct Status {
        let enrolled: Bool
        let replacementRequired: Bool
    }

    static func status(scope: String) throws -> Status {
        let defaults = try AuthwellAppGroup.sharedDefaults()
        let hasEnvelope = defaults.data(
            forKey: AuthwellAppGroup.biometricWrappedVaultKey
        ) != nil
        let savedScope = defaults.string(forKey: AuthwellAppGroup.biometricScopeKey)
        return Status(
            enrolled: hasEnvelope && savedScope == scope,
            replacementRequired: hasEnvelope && savedScope != scope
        )
    }

    static func store(userKey: Data, scope: String, context: LAContext) throws {
        guard
            userKey.count == 64,
            !scope.isEmpty,
            scope.count <= 2_048,
            context.evaluatedPolicyDomainState != nil
        else {
            throw AuthwellError.invalidArgument("The biometric vault key is invalid")
        }
        try remove()
        let privateKey = try createPrivateKey()
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            try? remove()
            throw AuthwellError.storage("Could not create biometric vault protection")
        }
        guard SecKeyIsAlgorithmSupported(publicKey, .encrypt, algorithm) else {
            try? remove()
            throw AuthwellError.unavailable("This device cannot wrap the vault key")
        }
        var payload = Data(SHA256.hash(data: Data(scope.utf8)))
        payload.append(userKey)
        defer { payload.resetBytes(in: 0..<payload.count) }
        var encryptionError: Unmanaged<CFError>?
        guard let ciphertext = SecKeyCreateEncryptedData(
            publicKey,
            algorithm,
            payload as CFData,
            &encryptionError
        ) as Data? else {
            try? remove()
            throw (encryptionError?.takeRetainedValue() as Error?)
                ?? AuthwellError.storage("Could not wrap the biometric vault key")
        }
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.set(ciphertext, forKey: AuthwellAppGroup.biometricWrappedVaultKey)
        defaults.set(scope, forKey: AuthwellAppGroup.biometricScopeKey)
        defaults.set(true, forKey: AuthwellAppGroup.biometricEnrolledKey)
    }

    static func load(scope: String, context: LAContext) throws -> Data {
        let status = try status(scope: scope)
        guard status.enrolled else {
            throw AuthwellError.authentication(
                status.replacementRequired
                    ? "Biometric unlock belongs to another account"
                    : "Biometric unlock is not enrolled"
            )
        }
        let defaults = try AuthwellAppGroup.sharedDefaults()
        guard let ciphertext = defaults.data(
            forKey: AuthwellAppGroup.biometricWrappedVaultKey
        ) else {
            throw AuthwellError.authentication("The wrapped vault key is unavailable")
        }
        let privateKey: SecKey
        do {
            privateKey = try decryptionPrivateKey(context: context)
        } catch {
            try? remove()
            throw AuthwellError.authentication(
                "Biometric enrollment changed or the device key was removed"
            )
        }
        guard SecKeyIsAlgorithmSupported(privateKey, .decrypt, algorithm) else {
            try? remove()
            throw AuthwellError.unavailable("This device cannot unwrap the vault key")
        }
        var decryptionError: Unmanaged<CFError>?
        guard var payload = SecKeyCreateDecryptedData(
            privateKey,
            algorithm,
            ciphertext as CFData,
            &decryptionError
        ) as Data?, payload.count == 96 else {
            try? remove()
            throw (decryptionError?.takeRetainedValue() as Error?)
                ?? AuthwellError.authentication("The wrapped vault key is invalid")
        }
        defer { payload.resetBytes(in: 0..<payload.count) }
        let expectedScope = Data(SHA256.hash(data: Data(scope.utf8)))
        guard Data(payload.prefix(32)) == expectedScope else {
            try? remove()
            throw AuthwellError.authentication("The wrapped vault key belongs to another account")
        }
        return Data(payload.suffix(64))
    }

    static func remove() throws {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let keyStatus = SecItemDelete([
            kSecClass: kSecClassKey,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
        ] as CFDictionary)
        guard keyStatus == errSecSuccess || keyStatus == errSecItemNotFound else {
            throw AuthwellError.storage("Could not remove biometric device key")
        }
        // v1 stored the access-controlled vault key as the Keychain item value.
        // Remove that legacy item so v2 persists only an explicitly wrapped key.
        let legacyStatus = SecItemDelete([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: legacyService,
            kSecAttrAccount: legacyAccount,
            kSecAttrAccessGroup: accessGroup,
        ] as CFDictionary)
        guard legacyStatus == errSecSuccess || legacyStatus == errSecItemNotFound else {
            throw AuthwellError.storage("Could not remove legacy biometric vault data")
        }
        let defaults = try AuthwellAppGroup.sharedDefaults()
        defaults.removeObject(forKey: AuthwellAppGroup.biometricWrappedVaultKey)
        defaults.removeObject(forKey: AuthwellAppGroup.biometricScopeKey)
        defaults.set(false, forKey: AuthwellAppGroup.biometricEnrolledKey)
    }

    private static func createPrivateKey() throws -> SecKey {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            authwellDeviceKeyAccessibility,
            [.privateKeyUsage, .biometryCurrentSet],
            &accessError
        ) else {
            throw (accessError?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Biometric key protection is unavailable")
        }
        let privateAttributes: [CFString: Any] = [
            kSecAttrIsPermanent: true,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
            kSecAttrAccessControl: access,
        ]
        var attributes: [CFString: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecPrivateKeyAttrs: privateAttributes,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
        ]
        var error: Unmanaged<CFError>?
        var privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
#if targetEnvironment(simulator)
        if privateKey == nil {
            attributes.removeValue(forKey: kSecAttrTokenID)
            error = nil
            privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error)
        }
#endif
        guard let privateKey else {
            throw (error?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Could not create a biometric device key")
        }
        return privateKey
    }

    private static func decryptionPrivateKey(context: LAContext) throws -> SecKey {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let query: [CFString: Any] = [
            kSecClass: kSecClassKey,
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrApplicationTag: keyTag,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnRef: true,
            kSecUseAuthenticationContext: context,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let privateKey = item as! SecKey? else {
            throw AuthwellError.authentication("Biometric device key is unavailable")
        }
        return privateKey
    }
}
