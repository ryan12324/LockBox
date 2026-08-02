import Foundation
import LocalAuthentication
import Security

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
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
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

enum BiometricVault {
    private static let service = "dev.lockbox.app.biometric-unlock"
    private static let account = "user-key"

    static func store(userKey: Data, context: LAContext) throws {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .biometryCurrentSet,
            &accessError
        ) else {
            throw (accessError?.takeRetainedValue() as Error?)
                ?? AuthwellError.unavailable("Biometric key protection is unavailable")
        }
        let identity: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrAccessGroup: accessGroup,
        ]
        SecItemDelete(identity as CFDictionary)
        var query = identity
        query[kSecValueData] = userKey
        query[kSecAttrAccessControl] = access
        query[kSecUseAuthenticationContext] = context
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw AuthwellError.storage("Could not store the biometric unlock key (\(status))")
        }
        try AuthwellAppGroup.sharedDefaults().set(
            true,
            forKey: AuthwellAppGroup.biometricEnrolledKey
        )
    }

    static func load(context: LAContext) throws -> Data {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
            kSecUseAuthenticationContext: context,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            throw AuthwellError.authentication("Biometric authentication was not completed")
        }
        return data
    }

    static func remove() throws {
        let accessGroup = try AuthwellAppGroup.keychainAccessGroup()
        let status = SecItemDelete([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecAttrAccessGroup: accessGroup,
        ] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthwellError.storage("Could not remove biometric unlock")
        }
        try AuthwellAppGroup.sharedDefaults().set(
            false,
            forKey: AuthwellAppGroup.biometricEnrolledKey
        )
    }
}
