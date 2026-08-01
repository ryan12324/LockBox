package dev.lockbox.app.credentialprovider

import android.content.ComponentName
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import dev.lockbox.app.autofill.AutofillCrypto
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.security.KeyStore

/**
 * CredentialManagerPlugin — Capacitor plugin bridge for passkey management.
 *
 * Bridges the TypeScript layer (credential-manager.ts) to the native
 * Android Credential Manager implementation. Provides:
 * - Availability check (API 34+ required)
 * - Passkey creation (delegates to Android Credential Manager)
 * - Passkey authentication (delegates to Android Credential Manager)
 * - Stored passkey listing (queries Room DB)
 * - Passkey deletion (removes from Room + Keystore)
 *
 * Note: createPasskey and authenticate are handled by the system
 * Credential Manager flow (CredentialProviderService + Activities).
 * This plugin handles the CRUD operations on stored passkey metadata
 * and the availability check.
 */
@CapacitorPlugin(name = "CredentialManager")
class CredentialManagerPlugin : Plugin() {

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    /**
     * Check if Android Credential Manager is available.
     * Requires Android 14 (API 34) or higher.
     */
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        call.resolve(result)
    }

    /** Check whether Lockbox is enabled as an Android Credential Provider. */
    @PluginMethod
    fun isProviderEnabled(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.resolve(JSObject().put("available", false).put("enabled", false))
            return
        }
        val enabled = try {
            val manager = context.getSystemService(android.credentials.CredentialManager::class.java)
            manager.isEnabledCredentialProviderService(
                ComponentName(context, LockboxCredentialProviderService::class.java)
            )
        } catch (_: Exception) {
            false
        }
        call.resolve(JSObject().put("available", true).put("enabled", enabled))
    }

    /** Open Android's provider picker using the Credential Manager API. */
    @PluginMethod
    fun requestEnableProvider(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("Credential Manager requires Android 14+")
            return
        }
        try {
            androidx.credentials.CredentialManager.create(context)
                .createSettingsPendingIntent()
                .send()
            call.resolve()
        } catch (error: Exception) {
            call.reject("Failed to open passkey provider settings", error)
        }
    }

    /**
     * Create a passkey — triggers the system Credential Manager create flow.
     *
     * On Android 14+, this launches the system credential creation dialog.
     * The actual key generation happens in CreatePasskeyActivity via the
     * LockboxCredentialProviderService flow.
     *
     * For now, this method uses the Android CredentialManager API to
     * initiate the creation flow programmatically.
     */
    @PluginMethod
    fun createPasskey(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("Credential Manager requires Android 14+")
            return
        }

        val rpId = call.getString("rpId") ?: run {
            call.reject("rpId is required")
            return
        }
        val rpName = call.getString("rpName") ?: rpId
        val userName = call.getString("userName") ?: run {
            call.reject("userName is required")
            return
        }
        val userDisplayName = call.getString("userDisplayName") ?: userName
        val userId = call.getString("userId") ?: run {
            call.reject("userId is required")
            return
        }
        val challenge = call.getString("challenge") ?: run {
            call.reject("challenge is required")
            return
        }

        pluginScope.launch {
            try {
                val credentialManager = androidx.credentials.CredentialManager.create(context)

                // Build the WebAuthn create request JSON
                val requestJson = org.json.JSONObject().apply {
                    put("rp", org.json.JSONObject().apply {
                        put("id", rpId)
                        put("name", rpName)
                    })
                    put("user", org.json.JSONObject().apply {
                        put("id", userId)
                        put("name", userName)
                        put("displayName", userDisplayName)
                    })
                    put("challenge", challenge)
                    put("pubKeyCredParams", org.json.JSONArray().apply {
                        put(org.json.JSONObject().apply {
                            put("type", "public-key")
                            put("alg", -7) // ES256
                        })
                    })
                    put("authenticatorSelection", org.json.JSONObject().apply {
                        put("authenticatorAttachment", "platform")
                        put("residentKey", "required")
                        put("userVerification", "preferred")
                    })
                    put("attestation", call.getString("attestation") ?: "none")
                    put("timeout", call.getInt("timeout", 60000))
                }.toString()

                val createRequest = androidx.credentials.CreatePublicKeyCredentialRequest(requestJson)

                val result = credentialManager.createCredential(
                    activity,
                    createRequest
                )

                // Parse the registration response
                val responseJson = org.json.JSONObject(
                    (result as androidx.credentials.CreatePublicKeyCredentialResponse)
                        .registrationResponseJson
                )

                val response = responseJson.getJSONObject("response")
                val resultObj = JSObject()
                resultObj.put("credentialId", responseJson.getString("id"))
                resultObj.put("attestationObject", response.getString("attestationObject"))
                resultObj.put("clientDataJSON", response.getString("clientDataJSON"))

                // Extract public key from attestation if available
                if (response.has("publicKey")) {
                    resultObj.put("publicKey", response.getString("publicKey"))
                }

                call.resolve(resultObj)
            } catch (e: Exception) {
                call.reject("Passkey creation failed: ${e.message}")
            }
        }
    }

    /**
     * Authenticate with a passkey — triggers the system Credential Manager get flow.
     */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("Credential Manager requires Android 14+")
            return
        }

        val rpId = call.getString("rpId") ?: run {
            call.reject("rpId is required")
            return
        }
        val challenge = call.getString("challenge") ?: run {
            call.reject("challenge is required")
            return
        }

        pluginScope.launch {
            try {
                val credentialManager = androidx.credentials.CredentialManager.create(context)

                val requestJson = org.json.JSONObject().apply {
                    put("rpId", rpId)
                    put("challenge", challenge)
                    put("userVerification", call.getString("userVerification") ?: "preferred")
                    put("timeout", call.getInt("timeout", 60000))

                    val allowCredentials = call.getArray("allowCredentials")
                    if (allowCredentials != null && allowCredentials.length() > 0) {
                        val credArray = org.json.JSONArray()
                        for (i in 0 until allowCredentials.length()) {
                            credArray.put(org.json.JSONObject().apply {
                                put("type", "public-key")
                                put("id", allowCredentials.getString(i))
                            })
                        }
                        put("allowCredentials", credArray)
                    }
                }.toString()

                val getRequest = androidx.credentials.GetCredentialRequest.Builder()
                    .addCredentialOption(
                        androidx.credentials.GetPublicKeyCredentialOption(requestJson)
                    )
                    .build()

                val result = credentialManager.getCredential(
                    activity,
                    getRequest
                )

                val credential = result.credential as? androidx.credentials.PublicKeyCredential
                    ?: throw IllegalStateException("Unexpected credential type")

                val responseJson = org.json.JSONObject(credential.authenticationResponseJson)
                val response = responseJson.getJSONObject("response")

                val resultObj = JSObject()
                resultObj.put("credentialId", responseJson.getString("id"))
                resultObj.put("authenticatorData", response.getString("authenticatorData"))
                resultObj.put("signature", response.getString("signature"))
                resultObj.put("clientDataJSON", response.getString("clientDataJSON"))
                if (response.has("userHandle")) {
                    resultObj.put("userHandle", response.getString("userHandle"))
                }

                call.resolve(resultObj)
            } catch (e: androidx.credentials.exceptions.NoCredentialException) {
                call.reject("No passkey is available for this account")
            } catch (e: Exception) {
                call.reject("Passkey authentication failed: ${e.message}")
            }
        }
    }

    /**
     * Get stored passkeys, optionally filtered by rpId.
     * Queries Room DB for passkey metadata.
     */
    @PluginMethod
    fun getStoredPasskeys(call: PluginCall) {
        val rpId = call.getString("rpId")

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val accountId = PasskeyAccountState.get(context)
                val passkeys = if (accountId == null) {
                    emptyList()
                } else if (rpId != null) {
                    db.passkeyMetadataDao().getByRpIdAndAccount(rpId, accountId)
                } else {
                    db.passkeyMetadataDao().getBySourceAndAccount(
                        PasskeyMetadataEntity.SOURCE_PENDING,
                        accountId
                    ) + db.passkeyMetadataDao().getBySourceAndAccount(
                        PasskeyMetadataEntity.SOURCE_SYNCED,
                        accountId
                    )
                }

                val passkeyArray = JSArray()
                for (passkey in passkeys) {
                    val obj = JSObject()
                    obj.put("credentialId", passkey.credentialId)
                    obj.put("rpId", passkey.rpId)
                    obj.put("userName", passkey.userName)
                    passkeyArray.put(obj)
                }

                val result = JSObject()
                result.put("passkeys", passkeyArray)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to get stored passkeys: ${e.message}")
            }
        }
    }

    /** List only metadata for device-created passkeys awaiting vault upload. */
    @PluginMethod
    fun getPendingPasskeys(call: PluginCall) {
        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                    ?: return@launch call.resolve(JSObject().put("passkeys", JSArray()))
                val passkeys = VaultDatabase.getInstance(context)
                    .passkeyMetadataDao()
                    .getBySourceAndAccount(PasskeyMetadataEntity.SOURCE_PENDING, accountId)
                val result = JSArray()
                for (passkey in passkeys) {
                    result.put(
                        JSObject()
                            .put("credentialId", passkey.credentialId)
                            .put("vaultItemId", passkey.vaultItemId)
                            .put("rpId", passkey.rpId)
                            .put("userName", passkey.userName)
                    )
                }
                call.resolve(JSObject().put("passkeys", result))
            } catch (error: Exception) {
                call.reject("Failed to list pending passkeys", error)
            }
        }
    }

    /**
     * Export one pending private key after BIOMETRIC_STRONG authorization.
     * Plaintext exists only in this callback and the unlocked Capacitor process.
     */
    @PluginMethod
    fun exportPendingPasskey(call: PluginCall) {
        val credentialId = call.getString("credentialId") ?: return call.reject("credentialId is required")
        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                    ?: throw SecurityException("Unlock Authwell before syncing passkeys")
                val metadata = VaultDatabase.getInstance(context)
                    .passkeyMetadataDao()
                    .getByCredentialIdAndAccount(credentialId, accountId)
                    ?: throw IllegalArgumentException("Pending passkey not found")
                require(metadata.source == PasskeyMetadataEntity.SOURCE_PENDING) {
                    "Passkey is not awaiting sync"
                }
                require(
                    metadata.encryptedPrivateKey != null &&
                        metadata.publicKey.isNotBlank() &&
                        metadata.vaultItemId.isNotBlank()
                ) { "Pending passkey is incomplete" }

                val deviceKey = AutofillCrypto.getPrivateKey()
                    ?: throw IllegalStateException("Biometric passkey protection is unavailable")
                val decryptCipher = AutofillCrypto.createUnwrapCipher(deviceKey)
                withContext(Dispatchers.Main) {
                    showExportPrompt(call, metadata, decryptCipher)
                }
            } catch (error: Exception) {
                call.reject(error.message ?: "Failed to prepare passkey sync", error)
            }
        }
    }

    private fun showExportPrompt(
        call: PluginCall,
        metadata: PasskeyMetadataEntity,
        decryptCipher: javax.crypto.Cipher
    ) {
        val fragmentActivity = activity as? FragmentActivity
            ?: return call.reject("Passkey sync requires an active Authwell window")
        val prompt = BiometricPrompt(
            fragmentActivity,
            ContextCompat.getMainExecutor(fragmentActivity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    pluginScope.launch {
                        try {
                            val authenticatedCipher = result.cryptoObject?.cipher
                                ?: throw SecurityException("Biometric key was not authorized")
                            val envelope = AutofillCrypto.parseEnvelope(metadata.encryptedPrivateKey!!)
                            val payload = JSONObject(
                                AutofillCrypto.decryptPayload(envelope, authenticatedCipher)
                            )
                            val exported = JSObject()
                                .put("vaultItemId", metadata.vaultItemId)
                                .put("credentialId", metadata.credentialId)
                                .put("rpId", metadata.rpId)
                                .put("rpName", metadata.rpName)
                                .put("userId", metadata.userId)
                                .put("userName", metadata.userName)
                                .put("userDisplayName", metadata.userDisplayName)
                                .put("publicKey", metadata.publicKey)
                                .put("privateKey", payload.getString("privateKey"))
                                .put("createdAt", metadata.createdAt)
                            call.resolve(exported)
                        } catch (error: Exception) {
                            call.reject("Failed to decrypt the pending passkey", error)
                        }
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.reject("Passkey sync was cancelled")
                }
            }
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Sync passkey to Authwell")
            .setSubtitle("${metadata.userName} · ${metadata.rpName}")
            .setNegativeButtonText("Not now")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(decryptCipher))
    }

    /** Mark the durable outbox row complete only after encrypted vault upload. */
    @PluginMethod
    fun markPasskeySynced(call: PluginCall) {
        val credentialId = call.getString("credentialId") ?: return call.reject("credentialId is required")
        val vaultItemId = call.getString("vaultItemId") ?: return call.reject("vaultItemId is required")
        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                    ?: throw SecurityException("No active Authwell account")
                val updated = VaultDatabase.getInstance(context)
                    .passkeyMetadataDao()
                    .updateSource(
                        credentialId,
                        vaultItemId,
                        accountId,
                        PasskeyMetadataEntity.SOURCE_SYNCED
                    )
                require(updated == 1) { "Pending passkey no longer exists" }
                call.resolve()
            } catch (error: Exception) {
                call.reject("Failed to acknowledge passkey sync", error)
            }
        }
    }

    /**
     * Delete a stored passkey — removes from Room DB and Android Keystore.
     */
    @PluginMethod
    fun deletePasskey(call: PluginCall) {
        val credentialId = call.getString("credentialId") ?: run {
            call.reject("credentialId is required")
            return
        }

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val accountId = PasskeyAccountState.get(context)
                    ?: throw SecurityException("No active Authwell account")
                val metadata = db.passkeyMetadataDao()
                    .getByCredentialIdAndAccount(credentialId, accountId)
                    ?: throw IllegalArgumentException("Passkey not found")

                // Delete private key from Keystore
                try {
                    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
                    keyStore.load(null)
                    if (keyStore.containsAlias(metadata.keystoreAlias)) {
                        keyStore.deleteEntry(metadata.keystoreAlias)
                    }
                } catch (_: Exception) {
                    // Best-effort keystore cleanup — don't fail the whole operation
                }

                // Delete metadata from Room
                db.passkeyMetadataDao().deleteByCredentialId(credentialId)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to delete passkey: ${e.message}")
            }
        }
    }
}
