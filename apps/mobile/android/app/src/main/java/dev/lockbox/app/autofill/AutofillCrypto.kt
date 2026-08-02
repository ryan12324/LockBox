package dev.lockbox.app.autofill

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import org.json.JSONObject
import java.security.GeneralSecurityException
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

object AutofillCrypto {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "lockbox_autofill_rsa_v1"
    private const val PREFS_NAME = "lockbox_autofill_index"
    private const val PREF_INDEX_SALT = "index_salt"
    private const val RSA_TRANSFORMATION = "RSA/ECB/OAEPWithSHA-256AndMGF1Padding"
    private const val AES_TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_LENGTH = 128

    data class Envelope(
        val wrappedKey: ByteArray,
        val iv: ByteArray,
        val ciphertext: ByteArray
    )

    fun isStrongBiometricReady(context: Context): Boolean =
        BiometricManager.from(context).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS

    @Synchronized
    fun ensureKeyPair(context: Context): KeyPair {
        if (!isStrongBiometricReady(context)) {
            throw StrongBiometricUnavailableException()
        }
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingPrivate = keyStore.getKey(KEY_ALIAS, null) as? PrivateKey
        val existingPublic = keyStore.getCertificate(KEY_ALIAS)?.publicKey
        if (existingPrivate != null && existingPublic != null) {
            return KeyPair(existingPublic, existingPrivate)
        }

        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setKeySize(2048)
            .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION")
                    setUserAuthenticationValidityDurationSeconds(-1)
                }
            }
            .build()
        generator.initialize(spec)
        return generator.generateKeyPair()
    }

    fun getPrivateKey(): PrivateKey? {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return keyStore.getKey(KEY_ALIAS, null) as? PrivateKey
    }

    fun encrypt(publicKey: PublicKey, plaintext: String): String {
        val aesGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES)
        aesGenerator.init(256)
        val aesKey = aesGenerator.generateKey()

        val aesCipher = Cipher.getInstance(AES_TRANSFORMATION)
        aesCipher.init(Cipher.ENCRYPT_MODE, aesKey)
        val ciphertext = aesCipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        val rsaCipher = Cipher.getInstance(RSA_TRANSFORMATION)
        rsaCipher.init(Cipher.ENCRYPT_MODE, publicKey)
        val wrappedKey = rsaCipher.doFinal(aesKey.encoded)

        return JSONObject()
            .put("wrappedKey", encode(wrappedKey))
            .put("iv", encode(aesCipher.iv))
            .put("ciphertext", encode(ciphertext))
            .toString()
    }

    fun parseEnvelope(encoded: String): Envelope {
        val json = JSONObject(encoded)
        return Envelope(
            wrappedKey = decode(json.getString("wrappedKey")),
            iv = decode(json.getString("iv")),
            ciphertext = decode(json.getString("ciphertext"))
        )
    }

    fun createUnwrapCipher(privateKey: PrivateKey): Cipher {
        return Cipher.getInstance(RSA_TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, privateKey)
        }
    }

    fun decryptPayload(envelope: Envelope, authenticatedCipher: Cipher): String {
        val rawAesKey = authenticatedCipher.doFinal(envelope.wrappedKey)
        val aesKey = javax.crypto.spec.SecretKeySpec(rawAesKey, KeyProperties.KEY_ALGORITHM_AES)
        val aesCipher = Cipher.getInstance(AES_TRANSFORMATION)
        aesCipher.init(
            Cipher.DECRYPT_MODE,
            aesKey,
            GCMParameterSpec(GCM_TAG_LENGTH, envelope.iv)
        )
        return aesCipher.doFinal(envelope.ciphertext).toString(Charsets.UTF_8)
    }

    fun hashIdentifier(context: Context, identifier: String): String {
        val normalized = normalizeIdentifier(identifier)
        require(normalized.isNotEmpty()) { "Invalid autofill identifier" }
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(getOrCreateIndexSalt(context))
        digest.update(normalized.toByteArray(Charsets.UTF_8))
        return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }

    fun normalizeIdentifier(identifier: String): String {
        return identifier.trim().lowercase().removePrefix("www.").trimEnd('.')
    }

    @SuppressLint("ApplySharedPref")
    private fun getOrCreateIndexSalt(context: Context): ByteArray {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = prefs.getString(PREF_INDEX_SALT, null)
        if (existing != null) return decode(existing)

        val salt = ByteArray(32)
        java.security.SecureRandom().nextBytes(salt)
        // The salt must be durable before returning it. An asynchronous write can
        // create a different identifier index if the process dies immediately.
        check(prefs.edit().putString(PREF_INDEX_SALT, encode(salt)).commit()) {
            "Could not persist the autofill index salt"
        }
        return salt
    }

    private fun encode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray =
        Base64.decode(value, Base64.NO_WRAP)
}

internal class StrongBiometricUnavailableException : GeneralSecurityException(
    "Set up fingerprint or face unlock in Android Settings, then refresh the encrypted index."
)
