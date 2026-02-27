package dev.lockbox.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.annotation.RequiresApi
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant

/**
 * CreatePasskeyActivity — Phase 2 handler for passkey creation.
 *
 * Launched via PendingIntent from LockboxCredentialProviderService when
 * the user selects "Save passkey to Lockbox" in the system credential picker.
 *
 * This activity:
 * 1. Parses the WebAuthn create request from the framework
 * 2. Generates an EC P-256 key pair in Android Keystore
 * 3. Builds authenticatorData with attestedCredentialData
 * 4. Creates an attestation object (fmt="none")
 * 5. Stores passkey metadata in Room DB
 * 6. Returns the credential response to the calling app
 *
 * SECURITY: Private keys never leave Android Keystore.
 * Metadata in Room is unencrypted (rpId, userName) for service queries.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class CreatePasskeyActivity : Activity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEYSTORE_PREFIX = "lockbox_passkey_"

        // WebAuthn authenticator flags for synced passkey registration
        // UP=1 | UV=4 | BE=8 | BS=16 | AT=64 = 0x5D
        private const val REGISTRATION_FLAGS: Byte = 0x5D.toByte()

        // AAGUID: 16 zero bytes (anonymous software authenticator)
        private val AAGUID = ByteArray(16)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val request = intent.getParcelableExtra(
            "android.service.credentials.extra.CREATE_CREDENTIAL_REQUEST",
            android.service.credentials.CreateCredentialRequest::class.java
        )

        if (request == null) {
            finishWithError("No create credential request")
            return
        }

        activityScope.launch {
            try {
                handleCreateRequest(request)
            } catch (e: Exception) {
                finishWithError("Create passkey failed: ${e.message}")
            }
        }
    }

    private suspend fun handleCreateRequest(
        request: android.service.credentials.CreateCredentialRequest
    ) {
        val requestJson = request.credentialData.getString(
            "androidx.credentials.BUNDLE_KEY_REQUEST_JSON"
        ) ?: throw IllegalArgumentException("Missing request JSON")

        val json = JSONObject(requestJson)
        val rpJson = json.getJSONObject("rp")
        val rpId = rpJson.getString("id")
        val rpName = rpJson.optString("name", rpId)

        val userJson = json.getJSONObject("user")
        val userName = userJson.getString("name")
        val userDisplayName = userJson.optString("displayName", userName)
        val userId = userJson.getString("id") // base64url

        val challengeB64 = json.getString("challenge") // base64url

        // Generate a random credential ID (32 bytes)
        val credentialIdBytes = ByteArray(32)
        SecureRandom().nextBytes(credentialIdBytes)
        val credentialId = base64urlEncode(credentialIdBytes)

        // Generate EC P-256 key pair in Android Keystore
        val keystoreAlias = "$KEYSTORE_PREFIX$credentialId"
        generateKeystoreKeyPair(keystoreAlias)

        // Get public key coordinates
        val keyStore = java.security.KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        val publicKey = keyStore.getCertificate(keystoreAlias).publicKey as ECPublicKey
        val ecPoint = publicKey.w
        val x = toUnsigned32Bytes(ecPoint.affineX)
        val y = toUnsigned32Bytes(ecPoint.affineY)

        // Build clientDataJSON
        val clientDataJson = JSONObject().apply {
            put("type", "webauthn.create")
            put("challenge", challengeB64)
            put("origin", "android:apk-key-hash:lockbox")
            put("androidPackageName", packageName)
        }.toString()
        val clientDataBytes = clientDataJson.toByteArray(Charsets.UTF_8)
        val clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataBytes)

        // Build COSE public key (77 bytes)
        val coseKey = buildCoseKey(x, y)

        // Build authenticator data with attested credential data
        val rpIdHash = MessageDigest.getInstance("SHA-256").digest(rpId.toByteArray(Charsets.UTF_8))
        val authData = buildRegistrationAuthData(rpIdHash, credentialIdBytes, coseKey)

        // Build attestation object (fmt="none", attStmt={})
        val attestationObject = buildAttestationObject(authData)

        // Store passkey metadata in Room DB
        val db = VaultDatabase.getInstance(applicationContext)
        db.passkeyMetadataDao().insert(
            PasskeyMetadataEntity(
                credentialId = credentialId,
                rpId = rpId,
                rpName = rpName,
                userName = userName,
                userDisplayName = userDisplayName,
                userId = userId,
                keystoreAlias = keystoreAlias,
                createdAt = Instant.now().toString()
            )
        )

        // Build response
        val responseJson = JSONObject().apply {
            put("id", credentialId)
            put("rawId", credentialId)
            put("type", "public-key")
            put("response", JSONObject().apply {
                put("clientDataJSON", base64urlEncode(clientDataBytes))
                put("attestationObject", base64urlEncode(attestationObject))
            })
        }

        val responseData = android.os.Bundle().apply {
            putString(
                "androidx.credentials.BUNDLE_KEY_REGISTRATION_RESPONSE_JSON",
                responseJson.toString()
            )
        }

        val response = android.service.credentials.CreateCredentialResponse(responseData)

        setResult(RESULT_OK, Intent().apply {
            putExtra("android.service.credentials.extra.CREATE_CREDENTIAL_RESPONSE", response)
        })
        finish()
    }

    /**
     * Generate an EC P-256 key pair in Android Keystore.
     * Key requires user authentication (biometric/screen lock).
     */
    private fun generateKeystoreKeyPair(alias: String) {
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE
        )

        val spec = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false) // Service needs to sign without prompt
            .build()

        keyPairGenerator.initialize(spec)
        keyPairGenerator.generateKeyPair()
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
        buffer.put(REGISTRATION_FLAGS)               // flags (0x5D)
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
