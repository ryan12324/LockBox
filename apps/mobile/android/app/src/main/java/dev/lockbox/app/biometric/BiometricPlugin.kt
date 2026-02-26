package dev.lockbox.app.biometric

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
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
        private const val GCM_TAG_LENGTH = 128
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
        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        val enrolled = prefs.contains(PREF_ENCRYPTED_USER_KEY)

        val result = JSObject()
        result.put("enrolled", enrolled)
        call.resolve(result)
    }

    /**
     * Enroll biometric unlock — encrypts user key with a Keystore-backed biometric key.
     * Triggers BiometricPrompt for initial enrollment.
     */
    @PluginMethod
    fun enrollBiometric(call: PluginCall) {
        val userKeyBase64 = call.getString("userKey") ?: run {
            call.reject("userKey is required")
            return
        }

        try {
            // Generate a new biometric-bound key in Android Keystore
            generateBiometricKey()

            // Get the key and create a cipher for encryption
            val secretKey = getBiometricKey() ?: run {
                call.reject("Failed to generate biometric key")
                return
            }

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)

            // Show BiometricPrompt to authorize key usage
            val fragmentActivity = activity as? FragmentActivity ?: run {
                call.reject("Activity not available")
                return
            }

            val executor = ContextCompat.getMainExecutor(context)
            val biometricPrompt = BiometricPrompt(
                fragmentActivity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        try {
                            val cryptoCipher = result.cryptoObject?.cipher ?: cipher
                            val userKeyBytes = Base64.decode(userKeyBase64, Base64.NO_WRAP)
                            val encryptedBytes = cryptoCipher.doFinal(userKeyBytes)
                            val iv = cryptoCipher.iv

                            // Store encrypted user key and IV in SharedPreferences
                            val prefs = context.getSharedPreferences(
                                PREFS_NAME,
                                android.content.Context.MODE_PRIVATE
                            )
                            prefs.edit()
                                .putString(PREF_ENCRYPTED_USER_KEY, Base64.encodeToString(encryptedBytes, Base64.NO_WRAP))
                                .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                                .apply()

                            call.resolve()
                        } catch (e: Exception) {
                            call.reject("Encryption failed: ${e.message}")
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        call.reject("Biometric enrollment failed: $errString")
                    }

                    override fun onAuthenticationFailed() {
                        // Authentication attempt failed, but more attempts may follow
                    }
                }
            )

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Enable Biometric Unlock")
                .setSubtitle("Authenticate to enable biometric unlock for Lockbox")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            biometricPrompt.authenticate(
                promptInfo,
                BiometricPrompt.CryptoObject(cipher)
            )
        } catch (e: Exception) {
            call.reject("Enrollment setup failed: ${e.message}")
        }
    }

    /**
     * Authenticate with biometrics — decrypts and returns the user key.
     */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        val reason = call.getString("reason") ?: "Unlock Lockbox"

        val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
        val encryptedKeyBase64 = prefs.getString(PREF_ENCRYPTED_USER_KEY, null) ?: run {
            val result = JSObject()
            result.put("success", false)
            call.resolve(result)
            return
        }
        val ivBase64 = prefs.getString(PREF_IV, null) ?: run {
            val result = JSObject()
            result.put("success", false)
            call.resolve(result)
            return
        }

        try {
            val secretKey = getBiometricKey() ?: run {
                val result = JSObject()
                result.put("success", false)
                call.resolve(result)
                return
            }

            val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_LENGTH, iv))

            val fragmentActivity = activity as? FragmentActivity ?: run {
                call.reject("Activity not available")
                return
            }

            val executor = ContextCompat.getMainExecutor(context)
            val biometricPrompt = BiometricPrompt(
                fragmentActivity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        try {
                            val cryptoCipher = result.cryptoObject?.cipher ?: cipher
                            val encryptedBytes = Base64.decode(encryptedKeyBase64, Base64.NO_WRAP)
                            val decryptedBytes = cryptoCipher.doFinal(encryptedBytes)
                            val userKeyBase64 = Base64.encodeToString(decryptedBytes, Base64.NO_WRAP)

                            val resultObj = JSObject()
                            resultObj.put("success", true)
                            resultObj.put("userKey", userKeyBase64)
                            call.resolve(resultObj)
                        } catch (e: Exception) {
                            val resultObj = JSObject()
                            resultObj.put("success", false)
                            call.resolve(resultObj)
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        val resultObj = JSObject()
                        resultObj.put("success", false)
                        call.resolve(resultObj)
                    }

                    override fun onAuthenticationFailed() {
                        // Authentication attempt failed, but more attempts may follow
                    }
                }
            )

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Lockbox")
                .setSubtitle(reason)
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            biometricPrompt.authenticate(
                promptInfo,
                BiometricPrompt.CryptoObject(cipher)
            )
        } catch (e: Exception) {
            val resultObj = JSObject()
            resultObj.put("success", false)
            call.resolve(resultObj)
        }
    }

    /**
     * Remove biometric enrollment — deletes key from Android Keystore.
     */
    @PluginMethod
    fun unenroll(call: PluginCall) {
        try {
            // Delete key from Keystore
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
                keyStore.deleteEntry(KEYSTORE_ALIAS)
            }

            // Clear encrypted user key from SharedPreferences
            val prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
            prefs.edit()
                .remove(PREF_ENCRYPTED_USER_KEY)
                .remove(PREF_IV)
                .apply()

            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to unenroll: ${e.message}")
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
}
