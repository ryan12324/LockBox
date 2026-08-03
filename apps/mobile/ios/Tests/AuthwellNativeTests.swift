import CryptoKit
import Foundation

private enum TestFailure: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): return message
        }
    }
}

@main
private enum AuthwellNativeTests {
    static func main() throws {
        try testBase64URLRoundTrip()
        try testRelyingPartyValidation()
        try testIOSAutofillDomainMatching()
        try testAutofillUsernamePresentation()
        try testLegacyAutofillRecordCompatibility()
        try testNativePasswordGeneration()
        try testTotpGenerationAndValidation()
        try testAndroidPrivateKeyCompatibility()
        try testPasskeyEncodingRoundTrip()
        try testMalformedAttestationsAreRejected()
        print("Authwell native contract tests passed")
    }

    private static func testBase64URLRoundTrip() throws {
        let data = Data([0xFB, 0xFF, 0x00, 0x10, 0x80])
        let encoded = data.base64URLEncodedString
        try require(encoded == "-_8AEIA", "Base64URL output is not canonical")
        try require(Data(base64URLEncoded: encoded) == data, "Base64URL did not round-trip")
    }

    private static func testRelyingPartyValidation() throws {
        let valid = try InputValidation.relyingParty(["rpId": "login.example.com"])
        try require(valid == "login.example.com", "A valid relying party was changed")
        try requireThrows("A relying party with an empty label was accepted") {
            _ = try InputValidation.relyingParty(["rpId": "login..example.com"])
        }
        try requireThrows("An uppercase relying party was accepted") {
            _ = try InputValidation.relyingParty(["rpId": "Login.example.com"])
        }
    }

    private static func testIOSAutofillDomainMatching() throws {
        try require(
            DomainIdentifier.normalize("https://www.Example.com/sign-in") == "example.com",
            "A website AutoFill domain was not normalized"
        )
        try require(
            DomainIdentifier.normalize("androidapp://com.example.app") == nil,
            "An Android package target was published as an iOS domain identity"
        )
        try require(
            DomainIdentifier.normalize("iosapp://com.example.app") == nil,
            "An unsupported iOS bundle target was published as a domain identity"
        )
    }

    private static func testAutofillUsernamePresentation() throws {
        try require(
            AutofillPresentation.credentialLabel(" person\n@example.com ")
                == "person @example.com",
            "The iOS credential label did not show a normalized username"
        )
        try require(
            AutofillPresentation.authenticationReason("person@example.com")
                == "Use person@example.com with Authwell",
            "The iOS authentication reason did not identify the selected username"
        )
        try require(
            AutofillPresentation.credentialLabel(" \n ") == "Authwell credential",
            "The iOS credential label did not preserve the empty-username fallback"
        )
        try require(
            AutofillPresentation.username(String(repeating: "x", count: 250)).count == 200,
            "The iOS display username was not bounded"
        )
    }

    private static func testLegacyAutofillRecordCompatibility() throws {
        let legacyJSON = Data(
            """
            {
              "id": "legacy-login",
              "domainHashes": ["hash"],
              "encryptedData": "ciphertext",
              "updatedAt": "2026-08-03T00:00:00Z",
              "serviceIdentifiers": ["example.com"]
            }
            """.utf8
        )
        let record = try JSONDecoder().decode(AutofillRecord.self, from: legacyJSON)
        try require(
            record.displayUsername.isEmpty,
            "A legacy iOS AutoFill record could not fall back without a display username"
        )
    }

    private static func testNativePasswordGeneration() throws {
        let choices = NativePasswordGenerator.choices(rules: [
            "allowed: upper, lower, digits; required: upper; required: lower; required: digit; required: [!@#]; minlength: 16; maxlength: 24; max-consecutive: 2;",
            nil,
        ])
        try require(choices.count == 1, "An incompatible alphanumeric choice was offered")
        guard let password = choices.first?.value else {
            throw TestFailure.failed("The iOS provider did not generate a strong password")
        }
        try require((16...24).contains(password.count), "The generated password ignored length rules")
        try require(password.contains(where: \Character.isUppercase), "The password has no uppercase letter")
        try require(password.contains(where: \Character.isLowercase), "The password has no lowercase letter")
        try require(password.contains(where: \Character.isNumber), "The password has no digit")
        try require(password.contains(where: { "!@#".contains($0) }), "The password has no required symbol")

        let alphanumeric = NativePasswordGenerator.choices(rules: [
            "allowed: upper, lower, digits; minlength: 12; maxlength: 12;"
        ])
        try require(alphanumeric.count == 1, "A symbol password ignored an alphanumeric-only rule")
        try require(
            alphanumeric[0].kind == .alphanumeric && alphanumeric[0].value.count == 12,
            "The compatible iOS password choice is invalid"
        )
    }

    private static func testTotpGenerationAndValidation() throws {
        let configuration = try NativeTotpConfiguration.parse(
            "otpauth://totp/RFC:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=SHA1&digits=8&period=30"
        )
        let code = try configuration.code(at: Date(timeIntervalSince1970: 59))
        try require(
            code == "94287082",
            "The native iOS TOTP generator failed the RFC 6238 vector"
        )
        try requireThrows("A short authenticator key was accepted") {
            _ = try NativeTotpConfiguration.parse("ABCDEF")
        }
        try requireThrows("An HOTP setup link was accepted for AutoFill") {
            _ = try NativeTotpConfiguration.parse(
                "otpauth://hotp/Example:alice?secret=JBSWY3DPEHPK3PXP&counter=1"
            )
        }
        try requireThrows("An unsupported authenticator algorithm was accepted") {
            _ = try NativeTotpConfiguration.parse(
                "otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&algorithm=MD5"
            )
        }
        try requireThrows("Duplicate authenticator parameters were accepted") {
            _ = try NativeTotpConfiguration.parse(
                "otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&secret=JBSWY3DPEHPK3PXP"
            )
        }
    }

    private static func testAndroidPrivateKeyCompatibility() throws {
        // A named-curve PKCS#8 P-256 key, matching the format returned by
        // java.security.PrivateKey.getEncoded() on Android.
        let androidPKCS8 = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg9qcNbQM3e72yOGIGlcjOnoFpQmvHnLHVGEyRUH6-79qhRANCAATre9wKZ_C_f-fH1zLj3LteWxaboP79WnN4TW3S-HAU1V1IOyM5Wp5Z00D4bzHe3YxY2NjCxf5EPUJ2Q2LvSaZq"
        guard let androidKeyData = Data(base64URLEncoded: androidPKCS8) else {
            throw TestFailure.failed("The Android PKCS#8 fixture is malformed")
        }

        let importedKey = try P256.Signing.PrivateKey(
            derRepresentation: androidKeyData
        )
        let signature = try importedKey.signature(for: Data("authwell".utf8))
        try require(
            importedKey.publicKey.isValidSignature(
                signature,
                for: Data("authwell".utf8)
            ),
            "An Android-created passkey could not sign on iOS"
        )

        let iosKey = P256.Signing.PrivateKey()
        let iosPKCS8 = iosKey.derRepresentation
        try require(
            iosPKCS8.count == 138
                && iosPKCS8.starts(with: [0x30, 0x81, 0x87, 0x02, 0x01, 0x00]),
            "An iOS-created passkey is not exported as Android-compatible PKCS#8"
        )
        let roundTrippedKey = try P256.Signing.PrivateKey(
            derRepresentation: iosPKCS8
        )
        try require(
            roundTrippedKey.publicKey.x963Representation
                == iosKey.publicKey.x963Representation,
            "The iOS PKCS#8 key did not round-trip"
        )
    }

    private static func testPasskeyEncodingRoundTrip() throws {
        let privateKey = P256.Signing.PrivateKey()
        let credentialID = Data(0..<32)
        let expectedKey = try PasskeyEncoding.cosePublicKey(privateKey.publicKey)
        let authenticatorData = PasskeyEncoding.registrationAuthenticatorData(
            relyingParty: "login.example.com",
            credentialID: credentialID,
            coseKey: expectedKey
        )
        let attestation = PasskeyEncoding.attestationObject(
            authenticatorData: authenticatorData
        )
        let extractedKey = try PasskeyEncoding.cosePublicKey(
            fromAttestationObject: attestation
        )
        try require(extractedKey == expectedKey, "The COSE public key did not round-trip")

        let assertion = PasskeyEncoding.assertionAuthenticatorData(
            relyingParty: "login.example.com",
            isSynced: true
        )
        try require(assertion.count == 37, "Assertion authenticator data has the wrong size")
        try require(assertion[32] == 0x1D, "Synced passkey flags are incorrect")
    }

    private static func testMalformedAttestationsAreRejected() throws {
        try requireThrows("An empty CBOR map was accepted as an attestation") {
            _ = try PasskeyEncoding.cosePublicKey(fromAttestationObject: Data([0xA0]))
        }

        let privateKey = P256.Signing.PrivateKey()
        let expectedKey = try PasskeyEncoding.cosePublicKey(privateKey.publicKey)
        var authenticatorData = PasskeyEncoding.registrationAuthenticatorData(
            relyingParty: "login.example.com",
            credentialID: Data(0..<32),
            coseKey: expectedKey
        )
        var trailing = PasskeyEncoding.attestationObject(
            authenticatorData: authenticatorData
        )
        trailing.append(0x00)
        try requireThrows("Trailing attestation data was accepted") {
            _ = try PasskeyEncoding.cosePublicKey(fromAttestationObject: trailing)
        }

        authenticatorData[32] &= ~0x40
        let missingAttestedData = PasskeyEncoding.attestationObject(
            authenticatorData: authenticatorData
        )
        try requireThrows("Authenticator data without the AT flag was accepted") {
            _ = try PasskeyEncoding.cosePublicKey(
                fromAttestationObject: missingAttestedData
            )
        }
    }

    private static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) throws {
        guard condition() else { throw TestFailure.failed(message) }
    }

    private static func requireThrows(
        _ message: String,
        operation: () throws -> Void
    ) throws {
        do {
            try operation()
        } catch {
            return
        }
        throw TestFailure.failed(message)
    }
}
