package dev.lockbox.app.autofill

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.view.autofill.AutofillManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.biometric.BiometricManager
import androidx.room.withTransaction
import dev.lockbox.app.credentialprovider.PasskeyMetadataEntity
import dev.lockbox.app.credentialprovider.PasskeyAccountState
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
        resolveStatus(call)
    }

    @PluginMethod
    fun requestEnable(call: PluginCall) {
        try {
            val intent = android.content.Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            startActivityForResult(call, intent, "autofillSettingsResult")
        } catch (error: Exception) {
            call.reject("Failed to open autofill settings", error)
        }
    }

    @PluginMethod
    fun requestBiometricEnrollment(call: PluginCall) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent(Settings.ACTION_BIOMETRIC_ENROLL).apply {
                    putExtra(
                        Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED,
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                    )
                }
            } else {
                Intent(Settings.ACTION_FINGERPRINT_ENROLL)
            }
            startActivityForResult(call, intent, "biometricEnrollmentResult")
        } catch (error: Exception) {
            call.reject("Failed to open biometric settings", error)
        }
    }

    @ActivityCallback
    fun autofillSettingsResult(call: PluginCall, result: ActivityResult) {
        resolveStatus(call, selected = result.resultCode == Activity.RESULT_OK)
    }

    @ActivityCallback
    fun biometricEnrollmentResult(call: PluginCall, result: ActivityResult) {
        resolveStatus(call)
    }

    /** Replace the complete local index after a successful vault decryption. */
    @PluginMethod
    fun replaceCredentialIndex(call: PluginCall) {
        val credentials = call.getArray("credentials") ?: return call.reject("credentials is required")
        val accountId = call.getString("accountId")?.takeIf { it.isNotBlank() && it.length <= 100 }
            ?: return call.reject("accountId is required")
        val saveAuthorization = call.getString("saveAuthorization")
            ?.let(::decodeSaveAuthorization)
            ?: return call.reject("saveAuthorization is required")
        if (credentials.length() > MAX_CREDENTIALS) {
            call.reject("Too many credentials")
            return
        }

        pluginScope.launch {
            try {
                val publicKey = AutofillCrypto.ensureKeyPair(context).public
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

                val database = VaultDatabase.getInstance(context)
                val indexedCount = database.withTransaction {
                    val pending = database.pendingAutofillSaveDao().getByAccount(accountId)
                    val vaultIds = entities.mapTo(mutableSetOf()) { it.id }
                    val pendingIndex = pending
                        .filterNot { it.id in vaultIds }
                        .map {
                            AutofillCredentialEntity(
                                id = it.id,
                                domainHashes = it.domainHashes,
                                encryptedData = it.autofillEncryptedData,
                                updatedAt = it.createdAt
                            )
                        }
                    val combined = entities + pendingIndex
                    database.autofillCredentialDao().replaceAll(combined)
                    combined.size
                }
                PasskeyAccountState.set(context, accountId)
                PendingSaveAuthorization.configure(context, accountId, saveAuthorization)
                AutofillDiagnostics.recordIndex(context, indexedCount)
                call.resolve(JSObject().put("indexed", indexedCount))
            } catch (error: Exception) {
                rejectIndexFailure(call, error, "autofill")
            } finally {
                saveAuthorization.fill(0)
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
                val publicKey = AutofillCrypto.ensureKeyPair(context).public
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
                rejectIndexFailure(call, error, "passkey")
            }
        }
    }

    @PluginMethod
    fun clearCredentialIndex(call: PluginCall) {
        pluginScope.launch {
            try {
                val database = VaultDatabase.getInstance(context)
                database.autofillCredentialDao().deleteAll()
                database.pendingAutofillSaveDao().deleteAll()
                database.passkeyMetadataDao().deleteBySource(PasskeyMetadataEntity.SOURCE_SYNCED)
                PasskeyAccountState.clear(context)
                PendingSaveAuthorization.clear(context)
                AutofillDiagnostics.clearIndex(context)
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

    /** List encrypted Android AutoFill saves waiting for an unlocked vault import. */
    @PluginMethod
    fun getPendingCredentialSaves(call: PluginCall) {
        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                    ?: return@launch call.resolve(JSObject().put("saves", JSONArray()))
                val pending = VaultDatabase.getInstance(context)
                    .pendingAutofillSaveDao()
                    .getByAccount(accountId)
                val result = JSONArray()
                pending.forEach { save ->
                    result.put(
                        JSObject()
                            .put("id", save.id)
                            .put("createdAt", save.createdAt)
                    )
                }
                call.resolve(JSObject().put("saves", result))
            } catch (error: Exception) {
                call.reject("Failed to list saved Android logins", error)
            }
        }
    }

    /** Decrypt one accepted Android save only for a caller proving an unlocked vault. */
    @PluginMethod
    fun exportPendingCredentialSave(call: PluginCall) {
        val id = call.getString("id")?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]{1,100}$")) }
            ?: return call.reject("Valid id is required")
        val authorization = call.getString("authorization")
            ?.let(::decodeSaveAuthorization)
            ?: return call.reject("authorization is required")
        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                    ?: throw SecurityException("Unlock Authwell before importing saved logins")
                require(PendingSaveAuthorization.verify(context, accountId, authorization)) {
                    "Unlock Authwell before importing saved logins"
                }
                val pending = VaultDatabase.getInstance(context)
                    .pendingAutofillSaveDao()
                    .getByIdAndAccount(id, accountId)
                    ?: throw IllegalArgumentException("Saved login no longer exists")
                val payload = JSONObject(PendingSaveCrypto.decrypt(context, pending.encryptedData))
                val name = payload.requireBoundedString("name", 1, 500)
                val username = payload.optString("username", "")
                val password = payload.requireBoundedString("password", 1, 100_000)
                val uri = payload.requireBoundedString("uri", 1, 2_048)
                require(username.length <= 10_000 && AutofillIdentifier.extract(uri) != null) {
                    "Saved login is invalid"
                }
                call.resolve(
                    JSObject()
                        .put("id", pending.id)
                        .put("name", name)
                        .put("username", username)
                        .put("password", password)
                        .put("uri", uri)
                        .put("createdAt", pending.createdAt)
                )
            } catch (error: Exception) {
                call.reject(error.message ?: "Failed to prepare the saved login", error)
            } finally {
                authorization.fill(0)
            }
        }
    }

    /** Remove an outbox row only after its encrypted vault write succeeds. */
    @PluginMethod
    fun markCredentialSaveSynced(call: PluginCall) {
        val id = call.getString("id")?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]{1,100}$")) }
            ?: return call.reject("Valid id is required")
        val authorization = call.getString("authorization")
            ?.let(::decodeSaveAuthorization)
            ?: return call.reject("authorization is required")
        pluginScope.launch {
            try {
                val accountId = PasskeyAccountState.get(context)
                    ?: throw SecurityException("No active Authwell account")
                require(PendingSaveAuthorization.verify(context, accountId, authorization)) {
                    "Unlock Authwell before acknowledging saved logins"
                }
                val deleted = VaultDatabase.getInstance(context)
                    .pendingAutofillSaveDao()
                    .deleteByIdAndAccount(id, accountId)
                require(deleted == 1) { "Saved login no longer exists" }
                call.resolve()
            } catch (error: Exception) {
                call.reject("Failed to acknowledge the saved login", error)
            } finally {
                authorization.fill(0)
            }
        }
    }

    private fun decodeSaveAuthorization(value: String): ByteArray? {
        if (!value.matches(Regex("^[A-Za-z0-9_-]{43}$"))) return null
        return try {
            val decoded = Base64.decode(
                value,
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
            )
            val canonical = Base64.encodeToString(
                decoded,
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
            )
            decoded.takeIf { it.size == 32 && canonical == value }
        } catch (_: IllegalArgumentException) {
            null
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

    private fun resolveStatus(call: PluginCall, selected: Boolean? = null) {
        val manager = context.getSystemService(AutofillManager::class.java)
        val supported = manager?.isAutofillSupported == true
        val enabled = supported && manager?.hasEnabledAutofillServices() == true
        val health = AutofillDiagnostics.snapshot(context)
        call.resolve(
            JSObject()
                .put("supported", supported)
                .put("enabled", enabled)
                .put("biometricsReady", AutofillCrypto.isStrongBiometricReady(context))
                .put("selected", selected)
                .put("indexedCredentials", health.indexedCredentials)
                .put("indexedAt", health.indexedAt)
                .put("lastRequestAt", health.lastRequestAt)
                .put("lastMatchCount", health.lastMatchCount)
                .put("lastError", health.lastError)
        )
    }

    private fun rejectIndexFailure(call: PluginCall, error: Exception, indexName: String) {
        val message = if (error is StrongBiometricUnavailableException) {
            error.message ?: "Strong biometric enrollment is required"
        } else {
            "Failed to update $indexName index"
        }
        AutofillDiagnostics.recordFailure(context, message)
        call.reject(message, error)
    }
}
