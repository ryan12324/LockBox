package dev.lockbox.app.biometric

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * BiometricPlugin — Capacitor plugin bridge for BiometricPrompt + Android Keystore.
 *
 * Security model:
 * 1. A symmetric AES-256-GCM key is generated in Android Keystore
 * 2. The key requires biometric authentication to use (setUserAuthenticationRequired)
 * 3. User key is encrypted with this Keystore key and stored in SharedPreferences
 * 4. To unlock, BiometricPrompt authenticates → Keystore key becomes usable → decrypt user key
 *
 * Uses BiometricPrompt (NOT deprecated FingerprintManager).
 */
@CapacitorPlugin(name = "Biometric")
class BiometricPlugin : Plugin() {

    companion object {
        private const val KEYSTORE_ALIAS = "lockbox_biometric_key"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val PREFS_NAME = "lockbox_biometric_prefs"
        private const val PREF_ENCRYPTED_USER_KEY = "encrypted_user_key"
        private const val PREF_IV = "biometric_iv"
        private const val PREF_SCOPE = "account_scope"
        private const val GCM_TAG_LENGTH = 128
        private const val VAULT_KEY_BYTES = 64
        private const val TAG = "AuthwellBiometric"
    }

    /**
     * Check if device supports biometric authentication.
     */
    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val biometricManager = BiometricManager.from(context)
        val canAuthenticate = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        )

        val result = JSObject()
        result.put("available", canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS)

        val biometryType = when {
            canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS -> "none"
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> {
                // On Android 11+, we can't easily distinguish biometry type
                // Default to fingerprint as most common
                "fingerprint"
            }
            else -> "fingerprint"
        }
        result.put("biometryType", biometryType)
        call.resolve(result)
    }

    /**
     * Check if biometric unlock has been enrolled for this app.
     */
    @PluginMethod
    fun isEnrolled(call: PluginCall) {
        val requestedScope = requireScope(call) ?: return
        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        val savedScope = prefs.getString(PREF_SCOPE, null)
        val hasEnvelope = prefs.contains(PREF_ENCRYPTED_USER_KEY) && prefs.contains(PREF_IV)
        val hasKey = try {
            getBiometricKey() != null
        } catch (_: Exception) {
            false
        }
        if (hasEnvelope && !hasKey) runCatching { clearEnrollment() }

        val result = JSObject()
        result.put("enrolled", hasEnvelope && hasKey && savedScope == requestedScope)
        result.put(
            "replacementRequired",
            hasEnvelope && hasKey && savedScope != requestedScope
        )
        call.resolve(result)
    }

    /**
     * Enroll biometric unlock — encrypts user key with a Keystore-backed biometric key.
     * Triggers BiometricPrompt for initial enrollment.
     */
    @PluginMethod
    fun enrollBiometric(call: PluginCall) {
        val scope = requireScope(call) ?: return
        val userKeyBase64 = call.getString("userKey") ?: run {
            call.reject("userKey is required")
            return
        }
        val userKeyBytes = decodeVaultKey(userKeyBase64) ?: run {
            call.reject("userKey must be canonical Base64 for a 64-byte vault key")
            return
        }

        try {
            clearEnrollment()
            // Generate a new biometric-bound key in Android Keystore
            generateBiometricKey()

            // Get the key and create a cipher for encryption
            val secretKey = getBiometricKey() ?: run {
                userKeyBytes.fill(0)
                call.reject("Failed to generate biometric key")
                return
            }

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)

            showEnrollmentPrompt(call, scope, userKeyBytes, cipher)
        } catch (e: Exception) {
            userKeyBytes.fill(0)
            runCatching { clearEnrollment() }
            Log.e(TAG, "Enrollment setup failed", e)
            call.reject("Enrollment setup failed: ${failureDetail(e)}", e)
        }
    }

    /**
     * Authenticate with biometrics — decrypts and returns the user key.
     */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        val scope = requireScope(call) ?: return
        val reason = call.getString("reason")?.take(200) ?: "Unlock Authwell"

        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        val encryptedKeyBase64 = prefs.getString(PREF_ENCRYPTED_USER_KEY, null) ?: run {
            resolveFailure(call, "credentialUnavailable")
            return
        }
        val ivBase64 = prefs.getString(PREF_IV, null) ?: run {
            runCatching { clearEnrollment() }
            resolveFailure(call, "enrollmentInvalid")
            return
        }
        if (prefs.getString(PREF_SCOPE, null) != scope) {
            resolveFailure(call, "accountMismatch")
            return
        }

        try {
            val secretKey = getBiometricKey() ?: run {
                clearEnrollment()
                resolveFailure(call, "credentialUnavailable")
                return
            }

            val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
            if (iv.size != 12) throw IllegalStateException("Invalid biometric IV")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_LENGTH, iv))

            showAuthenticationPrompt(call, scope, reason, encryptedKeyBase64, cipher)
        } catch (_: KeyPermanentlyInvalidatedException) {
            runCatching { clearEnrollment() }
            resolveFailure(call, "biometricsChanged")
        } catch (_: Exception) {
            runCatching { clearEnrollment() }
            resolveFailure(call, "enrollmentInvalid")
        }
    }

    /**
     * Remove biometric enrollment — deletes key from Android Keystore.
     */
    @PluginMethod
    fun unenroll(call: PluginCall) {
        try {
            clearEnrollment()
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to unenroll: ${e.message}")
        }
    }

    /**
     * AndroidX attaches BiometricPrompt to the FragmentActivity immediately,
     * so construction and authenticate() must both run on the fragment host's
     * main thread. Capacitor plugin methods may arrive on its task executor.
     */
    private fun showEnrollmentPrompt(
        call: PluginCall,
        scope: String,
        userKeyBytes: ByteArray,
        cipher: Cipher
    ) {
        val fragmentActivity = activity as? FragmentActivity ?: run {
            userKeyBytes.fill(0)
            runCatching { clearEnrollment() }
            call.reject("Activity not available")
            return
        }

        bridge.executeOnMainThread {
            if (fragmentActivity.isFinishing || fragmentActivity.isDestroyed) {
                userKeyBytes.fill(0)
                runCatching { clearEnrollment() }
                call.reject("Activity not available")
                return@executeOnMainThread
            }

            try {
                val biometricPrompt = BiometricPrompt(
                    fragmentActivity,
                    ContextCompat.getMainExecutor(fragmentActivity),
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            try {
                                val cryptoCipher = result.cryptoObject?.cipher
                                    ?: throw SecurityException("Biometric-bound cipher was not returned")
                                cryptoCipher.updateAAD(scope.toByteArray(Charsets.UTF_8))
                                val encryptedBytes = cryptoCipher.doFinal(userKeyBytes)
                                val iv = cryptoCipher.iv

                                val prefs = context.getSharedPreferences(
                                    PREFS_NAME,
                                    android.content.Context.MODE_PRIVATE
                                )
                                val stored = prefs.edit()
                                    .putString(
                                        PREF_ENCRYPTED_USER_KEY,
                                        Base64.encodeToString(encryptedBytes, Base64.NO_WRAP)
                                    )
                                    .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                                    .putString(PREF_SCOPE, scope)
                                    .commit()
                                if (!stored) {
                                    throw IllegalStateException("Could not persist biometric envelope")
                                }

                                call.resolve()
                            } catch (error: Exception) {
                                runCatching { clearEnrollment() }
                                Log.e(TAG, "Biometric envelope encryption failed", error)
                                call.reject("Encryption failed: ${failureDetail(error)}", error)
                            } finally {
                                userKeyBytes.fill(0)
                            }
                        }

                        override fun onAuthenticationError(
                            errorCode: Int,
                            errString: CharSequence
                        ) {
                            userKeyBytes.fill(0)
                            runCatching { clearEnrollment() }
                            call.reject("Biometric enrollment failed: $errString")
                        }

                        override fun onAuthenticationFailed() {
                            // Authentication attempt failed, but more attempts may follow.
                        }
                    }
                )
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Enable Biometric Unlock")
                    .setSubtitle("Authenticate to enable biometric unlock for Authwell")
                    .setNegativeButtonText("Cancel")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                biometricPrompt.authenticate(
                    promptInfo,
                    BiometricPrompt.CryptoObject(cipher)
                )
            } catch (error: Exception) {
                userKeyBytes.fill(0)
                runCatching { clearEnrollment() }
                Log.e(TAG, "Biometric prompt setup failed", error)
                call.reject("Enrollment setup failed: ${failureDetail(error)}", error)
            }
        }
    }

    private fun showAuthenticationPrompt(
        call: PluginCall,
        scope: String,
        reason: String,
        encryptedKeyBase64: String,
        cipher: Cipher
    ) {
        val fragmentActivity = activity as? FragmentActivity ?: run {
            call.reject("Activity not available")
            return
        }

        bridge.executeOnMainThread {
            if (fragmentActivity.isFinishing || fragmentActivity.isDestroyed) {
                call.reject("Activity not available")
                return@executeOnMainThread
            }

            try {
                val biometricPrompt = BiometricPrompt(
                    fragmentActivity,
                    ContextCompat.getMainExecutor(fragmentActivity),
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            try {
                                val cryptoCipher = result.cryptoObject?.cipher
                                    ?: throw SecurityException("Biometric-bound cipher was not returned")
                                cryptoCipher.updateAAD(scope.toByteArray(Charsets.UTF_8))
                                val encryptedBytes = Base64.decode(encryptedKeyBase64, Base64.NO_WRAP)
                                val decryptedBytes = cryptoCipher.doFinal(encryptedBytes)
                                if (decryptedBytes.size != VAULT_KEY_BYTES) {
                                    decryptedBytes.fill(0)
                                    throw SecurityException("Invalid vault key length")
                                }
                                val userKeyBase64 = Base64.encodeToString(
                                    decryptedBytes,
                                    Base64.NO_WRAP
                                )
                                decryptedBytes.fill(0)

                                val resultObj = JSObject()
                                resultObj.put("success", true)
                                resultObj.put("userKey", userKeyBase64)
                                call.resolve(resultObj)
                            } catch (error: Exception) {
                                Log.e(TAG, "Biometric envelope decryption failed", error)
                                runCatching { clearEnrollment() }
                                resolveFailure(call, "enrollmentInvalid")
                            }
                        }

                        override fun onAuthenticationError(
                            errorCode: Int,
                            errString: CharSequence
                        ) {
                            resolveFailure(call, "cancelled")
                        }

                        override fun onAuthenticationFailed() {
                            // Authentication attempt failed, but more attempts may follow.
                        }
                    }
                )
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Authwell")
                    .setSubtitle(reason)
                    .setNegativeButtonText("Cancel")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                biometricPrompt.authenticate(
                    promptInfo,
                    BiometricPrompt.CryptoObject(cipher)
                )
            } catch (error: Exception) {
                Log.e(TAG, "Biometric unlock prompt setup failed", error)
                runCatching { clearEnrollment() }
                resolveFailure(call, "enrollmentInvalid")
            }
        }
    }

    /**
     * Generate a new AES-256-GCM key in Android Keystore with biometric binding.
     */
    private fun generateBiometricKey() {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )

        val parameterSpec = KeyGenParameterSpec.Builder(
            KEYSTORE_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    setUserAuthenticationParameters(
                        0, // Require authentication for every use
                        KeyProperties.AUTH_BIOMETRIC_STRONG
                    )
                }
            }
            .build()

        keyGenerator.init(parameterSpec)
        keyGenerator.generateKey()
    }

    /**
     * Retrieve the biometric-bound key from Android Keystore.
     */
    private fun getBiometricKey(): SecretKey? {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        return keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey
    }

    private fun requireScope(call: PluginCall): String? {
        val scope = call.getString("scope")
        if (scope.isNullOrBlank() || scope.length > 2_048 || scope.indexOf('\u0000') >= 0) {
            call.reject("scope is required")
            return null
        }
        return scope
    }

    private fun decodeVaultKey(encoded: String): ByteArray? {
        return try {
            val decoded = Base64.decode(encoded, Base64.NO_WRAP)
            val valid =
                decoded.size == VAULT_KEY_BYTES
                && Base64.encodeToString(decoded, Base64.NO_WRAP) == encoded
            if (valid) decoded else {
                decoded.fill(0)
                null
            }
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun resolveFailure(call: PluginCall, reason: String) {
        val result = JSObject()
        result.put("success", false)
        result.put("fallbackReason", reason)
        call.resolve(result)
    }

    private fun failureDetail(error: Exception): String =
        error.message?.takeIf(String::isNotBlank) ?: error.javaClass.simpleName

    private fun clearEnrollment() {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        if (keyStore.containsAlias(KEYSTORE_ALIAS)) keyStore.deleteEntry(KEYSTORE_ALIAS)

        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        val cleared = prefs.edit()
            .remove(PREF_ENCRYPTED_USER_KEY)
            .remove(PREF_IV)
            .remove(PREF_SCOPE)
            .commit()
        check(cleared) { "Could not clear biometric enrollment" }
    }
}
