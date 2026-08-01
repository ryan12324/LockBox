package dev.lockbox.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
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
import java.security.KeyFactory
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec

/**
 * Returns assertions for both device-created and vault-synced passkeys.
 *
 * Synced PKCS#8 keys are encrypted in Room to a biometric-bound Android
 * Keystore key. They are decrypted only inside this activity after successful
 * strong biometric authentication and are never exposed to the provider
 * service or stored as plaintext on disk.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GetPasskeyActivity : FragmentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        val credentialId = intent.getStringExtra(EXTRA_CREDENTIAL_ID)
        val request = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
        if (credentialId == null || request == null) {
            finishWithError("The passkey request was incomplete")
            return
        }

        activityScope.launch {
            try {
                val prepared = prepareAssertion(credentialId, request)
                withContext(Dispatchers.Main) { authenticate(prepared) }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) {
                    finishWithError(error.message ?: "Passkey request failed")
                }
            }
        }
    }

    override fun onDestroy() {
        activityScope.cancel()
        super.onDestroy()
    }

    private suspend fun prepareAssertion(
        credentialId: String,
        request: ProviderGetCredentialRequest
    ): PreparedAssertion {
        val accountId = PasskeyAccountState.get(applicationContext)
            ?: throw SecurityException("Unlock Lockbox before using passkeys")
        val metadata = VaultDatabase.getInstance(applicationContext)
            .passkeyMetadataDao()
            .getByCredentialIdAndAccount(credentialId, accountId)
            ?: throw IllegalStateException("Passkey not found")

        val option = request.credentialOptions
            .filterIsInstance<GetPublicKeyCredentialOption>()
            .firstOrNull()
            ?: throw IllegalArgumentException("Missing public-key credential option")
        val requestJson = JSONObject(option.requestJson)
        val challenge = requestJson.getString("challenge")
        decodeCanonicalBase64url(challenge, 16, 1024)
        val rpId = requestJson.optString("rpId", metadata.rpId)
        require(isValidRpId(rpId)) { "Invalid relying-party ID" }
        require(rpId == metadata.rpId) { "Passkey does not match the requested relying party" }

        val allowedCredentials = requestJson.optJSONArray("allowCredentials")
        if (allowedCredentials != null && allowedCredentials.length() > 0) {
            val isAllowed = (0 until allowedCredentials.length()).any { index ->
                val allowed = allowedCredentials.optJSONObject(index)
                allowed?.optString("type") == "public-key" &&
                    allowed.optString("id") == credentialId
            }
            require(isAllowed) { "Passkey is not allowed by this request" }
        }

        val verifiedCaller = verifyPasskeyCaller(applicationContext, rpId, request.callingAppInfo)
        val clientDataBytes: ByteArray?
        val clientDataHash: ByteArray
        if (verifiedCaller.privilegedBrowserCall) {
            clientDataBytes = null
            clientDataHash = option.clientDataHash
                ?: throw SecurityException("Browser request did not provide client data")
        } else {
            clientDataBytes = JSONObject().apply {
                put("type", "webauthn.get")
                put("challenge", challenge)
                put("origin", verifiedCaller.origin)
                put("androidPackageName", request.callingAppInfo.packageName)
            }.toString().toByteArray(Charsets.UTF_8)
            clientDataHash = MessageDigest.getInstance("SHA-256").digest(clientDataBytes)
        }

        return PreparedAssertion(metadata, rpId, clientDataBytes, clientDataHash)
    }

    private fun authenticate(prepared: PreparedAssertion) {
        val encryptedKey = prepared.metadata.encryptedPrivateKey
        val decryptCipher = if (encryptedKey != null) {
            val deviceKey = AutofillCrypto.getPrivateKey()
                ?: return finishWithError("Unlock Lockbox once to prepare synced passkeys")
            try {
                AutofillCrypto.createUnwrapCipher(deviceKey)
            } catch (_: Exception) {
                return finishWithError("Synced passkeys need to be refreshed from Lockbox")
            }
        } else {
            null
        }

        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    activityScope.launch {
                        try {
                            val privateKey = if (encryptedKey != null) {
                                val authenticatedCipher = result.cryptoObject?.cipher
                                    ?: throw SecurityException("Biometric key was not authorized")
                                importSyncedPrivateKey(encryptedKey, authenticatedCipher)
                            } else {
                                getLocalPrivateKey(prepared.metadata.keystoreAlias)
                            }
                            val response = buildResponse(prepared, privateKey)
                            withContext(Dispatchers.Main) { finishWithResponse(response) }
                        } catch (error: Exception) {
                            withContext(Dispatchers.Main) {
                                finishWithError(error.message ?: "Passkey signing failed")
                            }
                        }
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    setResult(Activity.RESULT_CANCELED)
                    finish()
                }
            }
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Use Lockbox passkey")
            .setSubtitle("${prepared.metadata.userName} · ${prepared.metadata.rpName}")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        if (decryptCipher != null) {
            prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(decryptCipher))
        } else {
            prompt.authenticate(promptInfo)
        }
    }

    private fun importSyncedPrivateKey(
        encryptedPrivateKey: String,
        authenticatedCipher: javax.crypto.Cipher
    ): PrivateKey {
        val envelope = AutofillCrypto.parseEnvelope(encryptedPrivateKey)
        val payload = JSONObject(AutofillCrypto.decryptPayload(envelope, authenticatedCipher))
        val privateKeyBytes = decodeCanonicalBase64url(payload.getString("privateKey"), 64, 4096)
        return KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(privateKeyBytes))
    }

    private fun getLocalPrivateKey(alias: String): PrivateKey {
        require(alias.isNotBlank()) { "Passkey key reference is missing" }
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return keyStore.getKey(alias, null) as? PrivateKey
            ?: throw IllegalStateException("Passkey private key is unavailable")
    }

    private fun buildResponse(prepared: PreparedAssertion, privateKey: PrivateKey): PublicKeyCredential {
        val rpIdHash = MessageDigest.getInstance("SHA-256")
            .digest(prepared.rpId.toByteArray(Charsets.UTF_8))
        val authenticatorData = ByteBuffer.allocate(37).apply {
            put(rpIdHash)
            put(assertionFlags(prepared.metadata))
            putInt(0)
        }.array()
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey)
            update(authenticatorData + prepared.clientDataHash)
            sign()
        }

        val responseJson = JSONObject().apply {
            put("id", prepared.metadata.credentialId)
            put("rawId", prepared.metadata.credentialId)
            put("type", "public-key")
            put("response", JSONObject().apply {
                if (prepared.clientDataBytes != null) {
                    put("clientDataJSON", base64urlEncode(prepared.clientDataBytes))
                }
                put("authenticatorData", base64urlEncode(authenticatorData))
                put("signature", base64urlEncode(signature))
                put("userHandle", prepared.metadata.userId)
            })
        }
        return PublicKeyCredential(responseJson.toString())
    }

    private fun finishWithResponse(credential: PublicKeyCredential) {
        val resultIntent = Intent()
        PendingIntentHandler.setGetCredentialResponse(
            resultIntent,
            GetCredentialResponse(credential)
        )
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }

    private fun base64urlEncode(data: ByteArray): String = android.util.Base64.encodeToString(
        data,
        android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP
    )

    private fun finishWithError(message: String) {
        setResult(Activity.RESULT_CANCELED, Intent().putExtra("error", message))
        finish()
    }

    private fun assertionFlags(metadata: PasskeyMetadataEntity): Byte = when (metadata.source) {
        // UP | UV | BE | BS: this key has an encrypted vault backup.
        PasskeyMetadataEntity.SOURCE_SYNCED -> 0x1D
        // UP | UV | BE: the key is eligible but its vault upload is pending.
        PasskeyMetadataEntity.SOURCE_PENDING -> 0x0D
        // Legacy device-only key.
        else -> 0x05
    }

    private data class PreparedAssertion(
        val metadata: PasskeyMetadataEntity,
        val rpId: String,
        val clientDataBytes: ByteArray?,
        val clientDataHash: ByteArray
    )

    companion object {
        const val EXTRA_CREDENTIAL_ID = "credential_id"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }
}
