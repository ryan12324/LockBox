package dev.lockbox.app.autofill

import android.content.ComponentName
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * Capacitor bridge for maintaining Android's device-local autofill index.
 *
 * The WebView supplies already-decrypted login fields only while the vault is
 * unlocked. Native code immediately hybrid-encrypts those fields to a
 * biometric-bound Keystore key; Room stores only ciphertext and salted domain
 * hashes. AutofillService never receives the web vault encryption key.
 */
@CapacitorPlugin(name = "Autofill")
class AutofillPlugin : Plugin() {

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @PluginMethod
    fun isEnabled(call: PluginCall) {
        val configured = Settings.Secure.getString(
            context.contentResolver,
            "autofill_service"
        )
        val expected = ComponentName(context, LockboxAutofillService::class.java)
        val enabled = configured
            ?.split(':')
            ?.mapNotNull(ComponentName::unflattenFromString)
            ?.any { it == expected } == true
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun requestEnable(call: PluginCall) {
        try {
            val intent = android.content.Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            activity.startActivity(intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Failed to open autofill settings", error)
        }
    }

    /** Replace the complete local index after a successful vault decryption. */
    @PluginMethod
    fun replaceCredentialIndex(call: PluginCall) {
        val credentials = call.getArray("credentials") ?: return call.reject("credentials is required")
        if (credentials.length() > MAX_CREDENTIALS) {
            call.reject("Too many credentials")
            return
        }

        pluginScope.launch {
            try {
                val publicKey = AutofillCrypto.ensureKeyPair().public
                val entities = mutableListOf<AutofillCredentialEntity>()

                for (index in 0 until credentials.length()) {
                    val credential = credentials.optJSONObject(index)
                        ?: throw IllegalArgumentException("Invalid credential entry")
                    val id = credential.requireBoundedString("id", 1, 100)
                    val name = credential.requireBoundedString("name", 1, 500)
                    val username = credential.optString("username", "")
                    val password = credential.optString("password", "")
                    if (username.length > 10_000 || password.length > 100_000) {
                        throw IllegalArgumentException("Credential field is too large")
                    }
                    if (password.isEmpty()) continue

                    val uris = credential.optJSONArray("uris") ?: JSONArray()
                    val hashes = linkedSetOf<String>()
                    for (uriIndex in 0 until minOf(uris.length(), MAX_URIS_PER_CREDENTIAL)) {
                        val identifier = extractIdentifier(uris.optString(uriIndex)) ?: continue
                        hashes.add(AutofillCrypto.hashIdentifier(context, identifier))
                    }
                    if (hashes.isEmpty()) continue

                    val plaintext = JSONObject()
                        .put("name", name)
                        .put("username", username)
                        .put("password", password)
                        .toString()
                    entities.add(
                        AutofillCredentialEntity(
                            id = id,
                            domainHashes = JSONArray(hashes.toList()).toString(),
                            encryptedData = AutofillCrypto.encrypt(publicKey, plaintext),
                            updatedAt = java.time.Instant.now().toString()
                        )
                    )
                }

                VaultDatabase.getInstance(context).autofillCredentialDao().replaceAll(entities)
                call.resolve(JSObject().put("indexed", entities.size))
            } catch (error: Exception) {
                call.reject("Failed to update autofill index", error)
            }
        }
    }

    @PluginMethod
    fun clearCredentialIndex(call: PluginCall) {
        pluginScope.launch {
            try {
                VaultDatabase.getInstance(context).autofillCredentialDao().deleteAll()
                call.resolve()
            } catch (error: Exception) {
                call.reject("Failed to clear autofill index", error)
            }
        }
    }

    @PluginMethod
    fun getPasskeysForUri(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("URI is required")
        val domain = extractIdentifier(uri) ?: return call.reject("Invalid URI")

        pluginScope.launch {
            try {
                val passkeys = VaultDatabase.getInstance(context)
                    .passkeyMetadataDao()
                    .getByRpId(domain)
                val result = org.json.JSONArray()
                for (passkey in passkeys) {
                    result.put(
                        JSObject()
                            .put("credentialId", passkey.credentialId)
                            .put("rpId", passkey.rpId)
                            .put("rpName", passkey.rpName)
                            .put("userName", passkey.userName)
                            .put("userDisplayName", passkey.userDisplayName)
                    )
                }
                call.resolve(JSObject().put("passkeys", result))
            } catch (error: Exception) {
                call.reject("Failed to get passkeys", error)
            }
        }
    }

    private fun extractIdentifier(value: String): String? {
        if (value.isBlank()) return null
        val parsed = Uri.parse(if (value.contains("://")) value else "https://$value")
        val scheme = parsed.scheme?.lowercase() ?: return null
        val host = parsed.host ?: return null
        if (scheme == "https") return AutofillCrypto.normalizeIdentifier(host)
        if (scheme == "http" && isLoopback(host)) return AutofillCrypto.normalizeIdentifier(host)
        if (scheme == "androidapp") return AutofillCrypto.normalizeIdentifier(host)
        return null
    }

    private fun isLoopback(host: String): Boolean {
        val normalized = host.lowercase().trim('[', ']')
        return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1"
    }

    private fun JSONObject.requireBoundedString(key: String, min: Int, max: Int): String {
        val value = optString(key, "")
        if (value.length !in min..max) throw IllegalArgumentException("Invalid $key")
        return value
    }

    companion object {
        private const val MAX_CREDENTIALS = 5_000
        private const val MAX_URIS_PER_CREDENTIAL = 50
    }
}
