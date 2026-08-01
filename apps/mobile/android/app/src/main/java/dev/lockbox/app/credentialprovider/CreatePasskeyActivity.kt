package dev.lockbox.app.credentialprovider

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.provider.PendingIntentHandler
import androidx.fragment.app.FragmentActivity
import dev.lockbox.app.autofill.AutofillCrypto
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import java.util.UUID

/**
 * Creates passkeys selected through Android's credential-provider UI.
 *
 * Launched via PendingIntent from LockboxCredentialProviderService when
 * the user selects "Save passkey to Lockbox" in the system credential picker.
 *
 * This activity:
 * 1. Parses the WebAuthn create request from the framework
 * 2. Requires strong biometric verification and generates an exportable EC P-256 key
 * 3. Builds authenticatorData with attestedCredentialData
 * 4. Creates an attestation object (fmt="none")
 * 5. Stores passkey metadata in Room DB
 * 6. Returns the credential response to the calling app
 *
 * SECURITY: The PKCS#8 private key is immediately hybrid-encrypted to a
 * biometric-bound Android Keystore key. Room never receives plaintext key
 * material, and vault export requires a fresh biometric authorization.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class CreatePasskeyActivity : FragmentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        // UP=1 | UV=4 | BE=8 | AT=64. The credential is backup-eligible and
        // every registration is gated by BIOMETRIC_STRONG.
        private const val REGISTRATION_FLAGS: Byte = 0x4D

        // AAGUID: 16 zero bytes (anonymous software authenticator)
        private val AAGUID = ByteArray(16)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        val providerRequest = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
        val request = providerRequest?.callingRequest as? CreatePublicKeyCredentialRequest
        if (providerRequest == null || request == null) {
            finishWithError("No create credential request")
            return
        }

        val accountId = PasskeyAccountState.get(applicationContext)
        if (accountId == null) {
            finishWithError("Unlock Authwell before saving a passkey")
            return
        }

        authenticateAndCreate(request, providerRequest.callingAppInfo, accountId)
    }

    override fun onDestroy() {
        activityScope.cancel()
        super.onDestroy()
    }

    private fun authenticateAndCreate(
        request: CreatePublicKeyCredentialRequest,
        callingAppInfo: androidx.credentials.provider.CallingAppInfo,
        accountId: String
    ) {
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    activityScope.launch {
                        try {
                            handleCreateRequest(request, callingAppInfo, accountId)
                        } catch (error: Exception) {
                            withContext(Dispatchers.Main) {
                                finishWithError("Create passkey failed: ${error.message}")
                            }
                        }
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    setResult(RESULT_CANCELED)
                    finish()
                }
            }
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Save passkey to Authwell")
            .setSubtitle("Verify that it's you")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(promptInfo)
    }

    private suspend fun handleCreateRequest(
        request: CreatePublicKeyCredentialRequest,
        callingAppInfo: androidx.credentials.provider.CallingAppInfo,
        accountId: String
    ) {
        val json = JSONObject(request.requestJson)
        val rpJson = json.getJSONObject("rp")
        val rpId = rpJson.getString("id")
        require(isValidRpId(rpId)) { "Invalid relying-party ID" }
        val rpName = rpJson.optString("name", rpId)

        val userJson = json.getJSONObject("user")
        val userName = userJson.getString("name")
        val userDisplayName = userJson.optString("displayName", userName)
        val userId = userJson.getString("id") // base64url
        decodeCanonicalBase64url(userId, 1, 64)

        val challengeB64 = json.getString("challenge") // base64url
        decodeCanonicalBase64url(challengeB64, 16, 1024)

        val supportedAlgorithm = json.getJSONArray("pubKeyCredParams").let { params ->
            (0 until params.length()).any { index ->
                val parameter = params.optJSONObject(index)
                parameter?.optString("type") == "public-key" && parameter.optInt("alg") == -7
            }
        }
        require(supportedAlgorithm) { "No supported public-key algorithm" }

        val db = VaultDatabase.getInstance(applicationContext)
        val excludedCredentials = json.optJSONArray("excludeCredentials")
        if (excludedCredentials != null && excludedCredentials.length() > 0) {
            val excludedIds = (0 until excludedCredentials.length()).mapNotNull { index ->
                excludedCredentials.optJSONObject(index)?.optString("id")?.takeIf { it.isNotBlank() }
            }.toSet()
            require(
                db.passkeyMetadataDao()
                    .getByRpIdAndAccount(rpId, accountId)
                    .none { it.credentialId in excludedIds }
            ) {
                "A matching excluded credential already exists"
            }
        }

        val verifiedCaller = verifyPasskeyCaller(applicationContext, rpId, callingAppInfo)

        // Generate a random credential ID (32 bytes)
        val credentialIdBytes = ByteArray(32)
        SecureRandom().nextBytes(credentialIdBytes)
        val credentialId = base64urlEncode(credentialIdBytes)

        // Generate an exportable EC key only in memory. It is encrypted before
        // persistence so the same credential can later sync to other devices.
        val keyPair = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"), SecureRandom())
        }.generateKeyPair()
        val publicKey = keyPair.public as ECPublicKey
        val ecPoint = publicKey.w
        val x = toUnsigned32Bytes(ecPoint.affineX)
        val y = toUnsigned32Bytes(ecPoint.affineY)

        // Privileged browsers supply the client-data hash after Lockbox verifies
        // their delegated origin. Credential Manager carries the original client
        // data back to the browser, so providers omit a conflicting reconstruction.
        val clientDataBytes = if (verifiedCaller.privilegedBrowserCall) {
            require(request.clientDataHash != null) { "Browser request did not provide client data" }
            null
        } else {
            JSONObject().apply {
                put("type", "webauthn.create")
                put("challenge", challengeB64)
                put("origin", verifiedCaller.origin)
                put("androidPackageName", callingAppInfo.packageName)
            }.toString().toByteArray(Charsets.UTF_8)
        }

        // Build COSE public key (77 bytes)
        val coseKey = buildCoseKey(x, y)
        val protectedPrivateKey = AutofillCrypto.encrypt(
            AutofillCrypto.ensureKeyPair().public,
            JSONObject()
                .put("privateKey", base64urlEncode(keyPair.private.encoded))
                .toString()
        )
        val vaultItemId = UUID.randomUUID().toString()

        // Build authenticator data with attested credential data
        val rpIdHash = MessageDigest.getInstance("SHA-256").digest(rpId.toByteArray(Charsets.UTF_8))
        val authData = buildRegistrationAuthData(rpIdHash, credentialIdBytes, coseKey)

        // Build attestation object (fmt="none", attStmt={})
        val attestationObject = buildAttestationObject(authData)

        // Store passkey metadata in Room DB
        db.passkeyMetadataDao().insert(
            PasskeyMetadataEntity(
                credentialId = credentialId,
                rpId = rpId,
                rpName = rpName,
                userName = userName,
                userDisplayName = userDisplayName,
                userId = userId,
                keystoreAlias = "",
                createdAt = Instant.now().toString(),
                encryptedPrivateKey = protectedPrivateKey,
                publicKey = base64urlEncode(coseKey),
                vaultItemId = vaultItemId,
                accountId = accountId,
                source = PasskeyMetadataEntity.SOURCE_PENDING
            )
        )

        // Build response
        val responseJson = JSONObject().apply {
            put("id", credentialId)
            put("rawId", credentialId)
            put("type", "public-key")
            put("response", JSONObject().apply {
                if (clientDataBytes != null) {
                    put("clientDataJSON", base64urlEncode(clientDataBytes))
                }
                put("attestationObject", base64urlEncode(attestationObject))
            })
        }

        val response = CreatePublicKeyCredentialResponse(responseJson.toString())
        val resultIntent = Intent()
        PendingIntentHandler.setCreateCredentialResponse(resultIntent, response)
        setResult(RESULT_OK, resultIntent)
        finish()
    }

    /**
     * Build COSE Key encoding for EC P-256 public key (77 bytes).
     *
     * CBOR map: {1: 2, 3: -7, -1: 1, -2: x, -3: y}
     * Hex: A5 01 02 03 26 20 01 21 58 20 <x32> 22 58 20 <y32>
     */
    private fun buildCoseKey(x: ByteArray, y: ByteArray): ByteArray {
        val header = byteArrayOf(
            0xA5.toByte(), // map(5)
            0x01, 0x02,    // 1: 2 (kty: EC2)
            0x03, 0x26.toByte(), // 3: -7 (alg: ES256)
            0x20.toByte(), 0x01, // -1: 1 (crv: P-256)
            0x21, 0x58, 0x20     // -2: bytes(32)
        )
        val yHeader = byteArrayOf(0x22, 0x58, 0x20) // -3: bytes(32)

        return header + x + yHeader + y
    }

    /**
     * Build authenticator data for registration (with attested credential data).
     *
     * Layout: rpIdHash(32) | flags(1) | counter(4) | aaguid(16) | credIdLen(2) | credId | pubKey
     */
    private fun buildRegistrationAuthData(
        rpIdHash: ByteArray,
        credentialId: ByteArray,
        coseKey: ByteArray
    ): ByteArray {
        val buffer = ByteBuffer.allocate(
            32 + 1 + 4 + 16 + 2 + credentialId.size + coseKey.size
        )
        buffer.put(rpIdHash)                        // rpIdHash (32)
        buffer.put(REGISTRATION_FLAGS)               // flags (UP | UV | BE | AT)
        buffer.putInt(0)                             // counter (0, initial)
        buffer.put(AAGUID)                           // aaguid (16 zeros)
        buffer.putShort(credentialId.size.toShort()) // credIdLen (2)
        buffer.put(credentialId)                     // credentialId
        buffer.put(coseKey)                          // COSE public key
        return buffer.array()
    }

    /**
     * Build attestation object with fmt="none" and empty attStmt.
     *
     * CBOR map: {"fmt": "none", "attStmt": {}, "authData": <bytes>}
     */
    private fun buildAttestationObject(authData: ByteArray): ByteArray {
        // Manual CBOR encoding for the attestation object
        val fmtKey = cborTextString("fmt")
        val fmtValue = cborTextString("none")
        val attStmtKey = cborTextString("attStmt")
        val attStmtValue = byteArrayOf(0xA0.toByte()) // empty map
        val authDataKey = cborTextString("authData")
        val authDataValue = cborByteString(authData)

        // Map with 3 entries
        return byteArrayOf(0xA3.toByte()) +
            fmtKey + fmtValue +
            attStmtKey + attStmtValue +
            authDataKey + authDataValue
    }

    /** CBOR text string encoding */
    private fun cborTextString(s: String): ByteArray {
        val bytes = s.toByteArray(Charsets.UTF_8)
        return cborMajorType(3, bytes.size) + bytes
    }

    /** CBOR byte string encoding */
    private fun cborByteString(bytes: ByteArray): ByteArray {
        return cborMajorType(2, bytes.size) + bytes
    }

    /** CBOR major type + length encoding */
    private fun cborMajorType(major: Int, length: Int): ByteArray {
        val majorShifted = (major shl 5)
        return when {
            length < 24 -> byteArrayOf((majorShifted or length).toByte())
            length < 256 -> byteArrayOf((majorShifted or 24).toByte(), length.toByte())
            length < 65536 -> byteArrayOf(
                (majorShifted or 25).toByte(),
                (length shr 8).toByte(),
                (length and 0xFF).toByte()
            )
            else -> byteArrayOf(
                (majorShifted or 26).toByte(),
                (length shr 24).toByte(),
                ((length shr 16) and 0xFF).toByte(),
                ((length shr 8) and 0xFF).toByte(),
                (length and 0xFF).toByte()
            )
        }
    }

    /**
     * Convert a BigInteger to exactly 32 unsigned bytes (zero-padded).
     */
    private fun toUnsigned32Bytes(value: java.math.BigInteger): ByteArray {
        val bytes = value.toByteArray()
        return when {
            bytes.size == 32 -> bytes
            bytes.size > 32 -> bytes.copyOfRange(bytes.size - 32, bytes.size)
            else -> ByteArray(32 - bytes.size) + bytes
        }
    }

    /** Base64url encode without padding */
    private fun base64urlEncode(data: ByteArray): String {
        return Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun finishWithError(message: String) {
        setResult(RESULT_CANCELED, Intent().apply {
            putExtra("error", message)
        })
        finish()
    }
}
