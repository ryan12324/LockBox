package dev.lockbox.app.autofill

import android.content.ComponentName
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import dev.lockbox.app.storage.VaultDatabase
import dev.lockbox.app.storage.VaultItemEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * AutofillPlugin — Capacitor plugin bridge for autofill management.
 *
 * Exposes methods to:
 * - Check if LockboxAutofillService is enabled
 * - Request the user to enable it via Settings
 * - Query/save/remove credentials accessible to the autofill service
 */
@CapacitorPlugin(name = "Autofill")
class AutofillPlugin : Plugin() {

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Check if LockboxAutofillService is the active autofill provider.
     */
    @PluginMethod
    fun isEnabled(call: PluginCall) {
        val autofillManager = context.getSystemService(AutofillManager::class.java)
        val enabled = autofillManager?.hasEnabledAutofillServices() ?: false

        val result = JSObject()
        result.put("enabled", enabled)
        call.resolve(result)
    }

    /**
     * Open Android Settings to let user enable LockboxAutofillService.
     */
    @PluginMethod
    fun requestEnable(call: PluginCall) {
        try {
            val intent = android.content.Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                data = android.net.Uri.parse(
                    "package:${context.packageName}"
                )
            }
            activity.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to open autofill settings: ${e.message}")
        }
    }

    /**
     * Find matching credentials for a website URI.
     * Queries the Room database for login items.
     */
    @PluginMethod
    fun getCredentialsForUri(call: PluginCall) {
        val uri = call.getString("uri") ?: run {
            call.reject("URI is required")
            return
        }

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val items = db.vaultItemDao().getByTypeAndStatus("login", "synced")

                val credentials = com.getcapacitor.JSArray()
                for (item in items) {
                    val credential = JSObject()
                    credential.put("id", item.id)
                    credential.put("username", "") // Encrypted — client must decrypt
                    credential.put("uri", uri)
                    credentials.put(credential)
                }

                val result = JSObject()
                result.put("credentials", credentials)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to get credentials: ${e.message}")
            }
        }
    }

    /**
     * Store a credential for autofill use (encrypted blob only).
     */
    @PluginMethod
    fun saveCredential(call: PluginCall) {
        val id = call.getString("id") ?: run {
            call.reject("ID is required")
            return
        }
        val encryptedData = call.getString("encryptedData") ?: run {
            call.reject("encryptedData is required")
            return
        }
        val uri = call.getString("uri") ?: ""

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val entity = VaultItemEntity(
                    id = id,
                    encryptedData = encryptedData,
                    type = "login",
                    revisionDate = java.time.Instant.now().toString(),
                    syncStatus = "synced",
                    folderId = null,
                    tags = null,
                    favorite = false
                )
                db.vaultItemDao().upsert(entity)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to save credential: ${e.message}")
            }
        }
    }

    /**
     * Remove a credential from the autofill-accessible store.
     */
    @PluginMethod
    fun removeCredential(call: PluginCall) {
        val id = call.getString("id") ?: run {
            call.reject("ID is required")
            return
        }

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                db.vaultItemDao().deleteById(id)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to remove credential: ${e.message}")
            }
        }
    }
}
