package dev.lockbox.app.autofill

import android.content.ComponentName
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import dev.lockbox.app.credentialprovider.PasskeyMetadataEntity
import dev.lockbox.app.credentialprovider.PasskeyAccountState
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import android.util.Base64

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
                        val identifier = AutofillIdentifier.extract(uris.optString(uriIndex)) ?: continue
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

    /**
     * Replace passkeys imported from the encrypted Lockbox vault.
     *
     * The WebView can call this only after decrypting the vault. Native code
     * immediately hybrid-encrypts each PKCS#8 private key to the same
     * biometric-bound Keystore key used by Android Autofill. Device-created
     * passkeys are kept separately and are not removed by this refresh.
     */
    @PluginMethod
    fun replacePasskeyIndex(call: PluginCall) {
        val passkeys = call.getArray("passkeys") ?: return call.reject("passkeys is required")
        val accountId = call.getString("accountId")?.takeIf { it.isNotBlank() && it.length <= 100 }
            ?: return call.reject("accountId is required")
        if (passkeys.length() > MAX_PASSKEYS) {
            call.reject("Too many passkeys")
            return
        }

        pluginScope.launch {
            try {
                val publicKey = AutofillCrypto.ensureKeyPair().public
                val entities = mutableListOf<PasskeyMetadataEntity>()

                for (index in 0 until passkeys.length()) {
                    val passkey = passkeys.optJSONObject(index)
                        ?: throw IllegalArgumentException("Invalid passkey entry")
                    val credentialId = passkey.requireCanonicalBase64url("credentialId", 16, 1024)
                    val vaultItemId = passkey.requireVaultItemId("id")
                    val rpId = passkey.requireRpId("rpId")
                    val rpName = passkey.requireBoundedString("rpName", 1, 500)
                    val userName = passkey.requireBoundedString("userName", 1, 10_000)
                    val userDisplayName = passkey.optString("userDisplayName", userName)
                    if (userDisplayName.length > 10_000) {
                        throw IllegalArgumentException("Invalid userDisplayName")
                    }
                    val userId = passkey.requireCanonicalBase64url("userId", 1, 1024)
                    val privateKey = passkey.requireCanonicalBase64url("privateKey", 64, 4096)
                    val cosePublicKey = passkey.requireCanonicalBase64url("publicKey", 64, 1024)
                    val createdAt = passkey.requireBoundedString("createdAt", 1, 100)

                    val protectedKey = AutofillCrypto.encrypt(
                        publicKey,
                        JSONObject().put("privateKey", privateKey).toString()
                    )
                    entities.add(
                        PasskeyMetadataEntity(
                            credentialId = credentialId,
                            rpId = rpId,
                            rpName = rpName,
                            userName = userName,
                            userDisplayName = userDisplayName,
                            userId = userId,
                            keystoreAlias = "",
                            createdAt = createdAt,
                            encryptedPrivateKey = protectedKey,
                            publicKey = cosePublicKey,
                            vaultItemId = vaultItemId,
                            accountId = accountId,
                            source = PasskeyMetadataEntity.SOURCE_SYNCED
                        )
                    )
                }

                val passkeyDao = VaultDatabase.getInstance(context).passkeyMetadataDao()
                // Existing non-exportable keys predate account binding. Claim
                // them on the first successful unlock so upgrades keep working.
                passkeyDao.adoptLegacyLocal(accountId)
                passkeyDao.replaceSynced(entities)
                PasskeyAccountState.set(context, accountId)
                call.resolve(JSObject().put("indexed", entities.size))
            } catch (error: Exception) {
                call.reject("Failed to update passkey index", error)
            }
        }
    }

    @PluginMethod
    fun clearCredentialIndex(call: PluginCall) {
        pluginScope.launch {
            try {
                val database = VaultDatabase.getInstance(context)
                database.autofillCredentialDao().deleteAll()
                database.passkeyMetadataDao().deleteBySource(PasskeyMetadataEntity.SOURCE_SYNCED)
                PasskeyAccountState.clear(context)
                call.resolve()
            } catch (error: Exception) {
                call.reject("Failed to clear autofill index", error)
            }
        }
    }

    @PluginMethod
    fun getPasskeysForUri(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("URI is required")
        val domain = AutofillIdentifier.extract(uri) ?: return call.reject("Invalid URI")

        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                val passkeys = if (accountId == null) {
                    emptyList()
                } else {
                    VaultDatabase.getInstance(context)
                        .passkeyMetadataDao()
                        .getByRpIdAndAccount(domain, accountId)
                }
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

    private fun JSONObject.requireBoundedString(key: String, min: Int, max: Int): String {
        val value = optString(key, "")
        if (value.length !in min..max) throw IllegalArgumentException("Invalid $key")
        return value
    }

    private fun JSONObject.requireCanonicalBase64url(
        key: String,
        minBytes: Int,
        maxBytes: Int
    ): String {
        val value = optString(key, "")
        if (!value.matches(Regex("^[A-Za-z0-9_-]+$"))) {
            throw IllegalArgumentException("Invalid $key")
        }
        val decoded = try {
            Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        } catch (_: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid $key")
        }
        if (decoded.size !in minBytes..maxBytes) {
            throw IllegalArgumentException("Invalid $key")
        }
        val canonical = Base64.encodeToString(
            decoded,
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
        )
        if (canonical != value) throw IllegalArgumentException("Invalid $key")
        return value
    }

    private fun JSONObject.requireRpId(key: String): String {
        val value = optString(key, "")
        if (value.isEmpty() || value.length > 253 || value.endsWith('.') || value != value.lowercase()) {
            throw IllegalArgumentException("Invalid $key")
        }
        val label = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
        if (!value.split('.').all(label::matches)) throw IllegalArgumentException("Invalid $key")
        return value
    }

    private fun JSONObject.requireVaultItemId(key: String): String {
        val value = optString(key, "")
        if (!value.matches(Regex("^[A-Za-z0-9_-]{1,100}$"))) {
            throw IllegalArgumentException("Invalid $key")
        }
        return value
    }

    companion object {
        private const val MAX_CREDENTIALS = 5_000
        private const val MAX_URIS_PER_CREDENTIAL = 50
        private const val MAX_PASSKEYS = 5_000
    }
}
