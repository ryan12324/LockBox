package dev.lockbox.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Base64
import androidx.annotation.RequiresApi
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature

/**
 * GetPasskeyActivity — Phase 2 handler for passkey authentication.
 *
 * Launched via PendingIntent from LockboxCredentialProviderService when
 * the user selects a passkey in the system credential picker.
 *
 * This activity:
 * 1. Looks up passkey metadata from Room DB
 * 2. Builds authenticator data (rpIdHash + flags + counter)
 * 3. Signs (authData + clientDataHash) with the Keystore private key
 * 4. Returns the assertion response to the calling app
 *
 * SECURITY: Private keys are accessed via Android Keystore.
 * Signature.getInstance("SHA256withECDSA") returns DER natively — no conversion needed.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GetPasskeyActivity : Activity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        const val EXTRA_CREDENTIAL_ID = "credential_id"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"

        // WebAuthn authenticator flags for synced passkey assertion
        // UP=1 | UV=4 | BE=8 | BS=16 = 0x1D
        private const val ASSERTION_FLAGS: Byte = 0x1D.toByte()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val credentialId = intent.getStringExtra(EXTRA_CREDENTIAL_ID)
        if (credentialId == null) {
            finishWithError("No credential ID provided")
            return
        }

        val request = intent.getParcelableExtra(
            "android.service.credentials.extra.GET_CREDENTIAL_REQUEST",
            android.service.credentials.GetCredentialRequest::class.java
        )

        if (request == null) {
            finishWithError("No get credential request")
            return
        }

        activityScope.launch {
            try {
                handleGetRequest(credentialId, request)
            } catch (e: Exception) {
                finishWithError("Get passkey failed: ${e.message}")
            }
        }
    }

    private suspend fun handleGetRequest(
        credentialId: String,
        request: android.service.credentials.GetCredentialRequest
    ) {
        // Look up passkey metadata
        val db = VaultDatabase.getInstance(applicationContext)
        val metadata = db.passkeyMetadataDao().getByCredentialId(credentialId)
            ?: throw IllegalStateException("Passkey not found: $credentialId")

        // Extract challenge from request
        val challengeB64 = extractChallenge(request)
            ?: throw IllegalArgumentException("Missing challenge in request")

        // Build clientDataJSON
        val clientDataJson = JSONObject().apply {
            put("type", "webauthn.get")
            put("challenge", challengeB64)
            put("origin", "android:apk-key-hash:lockbox")
            put("androidPackageName", packageName)
        }.toString()
        val clientDataBytes = clientDataJson.toByteArray(Charsets.UTF_8)
        val clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataBytes)

        // Build authenticator data for assertion
        val rpIdHash = MessageDigest.getInstance("SHA-256")
            .digest(metadata.rpId.toByteArray(Charsets.UTF_8))
        val authData = buildAssertionAuthData(rpIdHash)

        // Sign (authData || clientDataHash) with Keystore private key
        val signedData = authData + clientDataHash
        val signature = signWithKeystore(metadata.keystoreAlias, signedData)

        // Build response
        val responseJson = JSONObject().apply {
            put("id", credentialId)
            put("rawId", credentialId)
            put("type", "public-key")
            put("response", JSONObject().apply {
                put("clientDataJSON", base64urlEncode(clientDataBytes))
                put("authenticatorData", base64urlEncode(authData))
                put("signature", base64urlEncode(signature))
                put("userHandle", metadata.userId)
            })
        }

        val responseData = android.os.Bundle().apply {
            putString(
                "androidx.credentials.BUNDLE_KEY_AUTHENTICATION_RESPONSE_JSON",
                responseJson.toString()
            )
        }

        val response = android.service.credentials.GetCredentialResponse(responseData)

        setResult(RESULT_OK, Intent().apply {
            putExtra("android.service.credentials.extra.GET_CREDENTIAL_RESPONSE", response)
        })
        finish()
    }

    /**
     * Build authenticator data for assertion (no attested credential data).
     *
     * Layout: rpIdHash(32) | flags(1) | counter(4)
     */
    private fun buildAssertionAuthData(rpIdHash: ByteArray): ByteArray {
        val buffer = ByteBuffer.allocate(37) // 32 + 1 + 4
        buffer.put(rpIdHash)          // rpIdHash (32)
        buffer.put(ASSERTION_FLAGS)    // flags (0x1D)
        buffer.putInt(0)              // counter (0 — stateless for synced passkeys)
        return buffer.array()
    }

    /**
     * Sign data using the EC private key stored in Android Keystore.
     * SHA256withECDSA returns DER-encoded signature natively.
     */
    private fun signWithKeystore(keystoreAlias: String, data: ByteArray): ByteArray {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)

        val privateKey = keyStore.getKey(keystoreAlias, null)
            ?: throw IllegalStateException("Private key not found for alias: $keystoreAlias")

        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(privateKey as java.security.PrivateKey)
        signature.update(data)
        return signature.sign()
    }

    /**
     * Extract challenge from the get credential request bundle.
     */
    private fun extractChallenge(
        request: android.service.credentials.GetCredentialRequest
    ): String? {
        for (option in request.getCredentialOptions) {
            val requestJson = option.credentialData.getString(
                "androidx.credentials.BUNDLE_KEY_REQUEST_JSON"
            ) ?: continue
            return try {
                JSONObject(requestJson).getString("challenge")
            } catch (e: Exception) {
                null
            }
        }
        return null
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
