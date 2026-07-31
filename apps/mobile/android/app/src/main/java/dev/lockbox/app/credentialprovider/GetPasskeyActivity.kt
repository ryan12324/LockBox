package dev.lockbox.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Base64
import androidx.annotation.RequiresApi
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
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
 * Returns passkey assertions selected through Android's credential-provider UI.
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

        // The system picker supplies user presence. Do not claim biometric user
        // verification or backup eligibility when neither occurred.
        private const val ASSERTION_FLAGS: Byte = 0x01
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val credentialId = intent.getStringExtra(EXTRA_CREDENTIAL_ID)
        if (credentialId == null) {
            finishWithError("No credential ID provided")
            return
        }

        val request = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
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
        request: ProviderGetCredentialRequest
    ) {
        // Look up passkey metadata
        val db = VaultDatabase.getInstance(applicationContext)
        val metadata = db.passkeyMetadataDao().getByCredentialId(credentialId)
            ?: throw IllegalStateException("Passkey not found: $credentialId")

        val option = request.credentialOptions
            .filterIsInstance<GetPublicKeyCredentialOption>()
            .firstOrNull()
            ?: throw IllegalArgumentException("Missing public-key credential option")
        val requestJson = JSONObject(option.requestJson)
        val challengeB64 = requestJson.getString("challenge")
        decodeCanonicalBase64url(challengeB64, 16, 1024)
        val requestedRpId = requestJson.optString("rpId", metadata.rpId)
        require(isValidRpId(requestedRpId)) { "Invalid relying-party ID" }
        require(requestedRpId == metadata.rpId) { "Passkey does not match the requested RP ID" }
        require(requestJson.optString("userVerification", "preferred") != "required") {
            "This provider cannot satisfy required user verification"
        }
        val allowedCredentials = requestJson.optJSONArray("allowCredentials")
        if (allowedCredentials != null && allowedCredentials.length() > 0) {
            val isAllowed = (0 until allowedCredentials.length()).any { index ->
                val allowed = allowedCredentials.optJSONObject(index)
                allowed?.optString("type") == "public-key" &&
                    allowed.optString("id") == credentialId
            }
            require(isAllowed) { "Passkey is not allowed by this request" }
        }
        val origin = getCallingAppOrigin(request.callingAppInfo)

        // Build clientDataJSON
        val clientDataJson = JSONObject().apply {
            put("type", "webauthn.get")
            put("challenge", challengeB64)
            put("origin", origin)
            put("androidPackageName", request.callingAppInfo.packageName)
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

        val credential = PublicKeyCredential(responseJson.toString())
        val response = GetCredentialResponse(credential)
        val resultIntent = Intent()
        PendingIntentHandler.setGetCredentialResponse(resultIntent, response)
        setResult(RESULT_OK, resultIntent)
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
