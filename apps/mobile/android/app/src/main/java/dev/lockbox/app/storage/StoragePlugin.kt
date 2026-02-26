package dev.lockbox.app.storage

import android.content.Context
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray

/**
 * Room Entity for encrypted vault items.
 *
 * SECURITY: encryptedData is an opaque Base64 blob — never decrypted in native code.
 * syncStatus tracks offline-first operation state.
 */
@Entity(tableName = "vault_items")
data class VaultItemEntity(
    @PrimaryKey val id: String,
    val encryptedData: String,
    val type: String,
    val revisionDate: String,
    val syncStatus: String, // 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
    val folderId: String? = null,
    val tags: String? = null, // JSON array string
    val favorite: Boolean = false
)

/**
 * StoragePlugin — Capacitor plugin bridge for Room DB encrypted storage.
 *
 * All vault data is stored as encrypted blobs. This plugin provides CRUD
 * operations and sync status management for offline-first operation.
 */
@CapacitorPlugin(name = "Storage")
class StoragePlugin : Plugin() {

    companion object {
        private const val PREFS_NAME = "lockbox_storage_prefs"
        private const val PREF_LAST_SYNC = "last_sync_timestamp"
    }

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Store or update an encrypted vault item.
     */
    @PluginMethod
    fun upsertItem(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id is required")
        val encryptedData = call.getString("encryptedData") ?: return call.reject("encryptedData is required")
        val type = call.getString("type") ?: return call.reject("type is required")
        val revisionDate = call.getString("revisionDate") ?: return call.reject("revisionDate is required")
        val syncStatus = call.getString("syncStatus") ?: return call.reject("syncStatus is required")
        val folderId = call.getString("folderId")
        val tags = call.getArray("tags")?.toString()
        val favorite = call.getBoolean("favorite", false) ?: false

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val entity = VaultItemEntity(
                    id = id,
                    encryptedData = encryptedData,
                    type = type,
                    revisionDate = revisionDate,
                    syncStatus = syncStatus,
                    folderId = folderId,
                    tags = tags,
                    favorite = favorite
                )
                db.vaultItemDao().upsert(entity)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to upsert item: ${e.message}")
            }
        }
    }

    /**
     * Get a single encrypted vault item by ID.
     */
    @PluginMethod
    fun getItem(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id is required")

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val entity = db.vaultItemDao().getById(id)

                val result = JSObject()
                if (entity != null) {
                    result.put("item", entityToJSObject(entity))
                } else {
                    result.put("item", JSObject.NULL)
                }
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to get item: ${e.message}")
            }
        }
    }

    /**
     * List all encrypted vault items.
     */
    @PluginMethod
    fun listItems(call: PluginCall) {
        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val entities = db.vaultItemDao().getAll()

                val items = JSArray()
                for (entity in entities) {
                    items.put(entityToJSObject(entity))
                }

                val result = JSObject()
                result.put("items", items)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to list items: ${e.message}")
            }
        }
    }

    /**
     * List items with pending sync operations.
     */
    @PluginMethod
    fun getPendingItems(call: PluginCall) {
        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val entities = db.vaultItemDao().getPending()

                val items = JSArray()
                for (entity in entities) {
                    items.put(entityToJSObject(entity))
                }

                val result = JSObject()
                result.put("items", items)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to get pending items: ${e.message}")
            }
        }
    }

    /**
     * Delete an item from local storage.
     */
    @PluginMethod
    fun deleteItem(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id is required")

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                db.vaultItemDao().deleteById(id)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to delete item: ${e.message}")
            }
        }
    }

    /**
     * Update an item's sync status.
     */
    @PluginMethod
    fun updateSyncStatus(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id is required")
        val syncStatus = call.getString("syncStatus") ?: return call.reject("syncStatus is required")

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                db.vaultItemDao().updateSyncStatus(id, syncStatus)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to update sync status: ${e.message}")
            }
        }
    }

    /**
     * Batch upsert items (used during full sync).
     */
    @PluginMethod
    fun batchUpsert(call: PluginCall) {
        val itemsArray = call.getArray("items") ?: return call.reject("items array is required")

        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                val entities = mutableListOf<VaultItemEntity>()

                for (i in 0 until itemsArray.length()) {
                    val obj = itemsArray.getJSONObject(i)
                    entities.add(
                        VaultItemEntity(
                            id = obj.getString("id"),
                            encryptedData = obj.getString("encryptedData"),
                            type = obj.getString("type"),
                            revisionDate = obj.getString("revisionDate"),
                            syncStatus = obj.getString("syncStatus"),
                            folderId = obj.optString("folderId", null),
                            tags = obj.optString("tags", null),
                            favorite = obj.optBoolean("favorite", false)
                        )
                    )
                }

                db.vaultItemDao().batchUpsert(entities)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to batch upsert: ${e.message}")
            }
        }
    }

    /**
     * Store the last successful sync timestamp.
     */
    @PluginMethod
    fun setLastSyncTimestamp(call: PluginCall) {
        val timestamp = call.getString("timestamp") ?: return call.reject("timestamp is required")

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(PREF_LAST_SYNC, timestamp).apply()
        call.resolve()
    }

    /**
     * Get the last successful sync timestamp.
     */
    @PluginMethod
    fun getLastSyncTimestamp(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val timestamp = prefs.getString(PREF_LAST_SYNC, null)

        val result = JSObject()
        if (timestamp != null) {
            result.put("timestamp", timestamp)
        } else {
            result.put("timestamp", JSObject.NULL)
        }
        call.resolve(result)
    }

    /**
     * Clear all stored data (used on logout).
     */
    @PluginMethod
    fun clearAll(call: PluginCall) {
        pluginScope.launch {
            try {
                val db = VaultDatabase.getInstance(context)
                db.vaultItemDao().deleteAll()

                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().clear().apply()

                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to clear data: ${e.message}")
            }
        }
    }

    /**
     * Convert a VaultItemEntity to a JSObject for Capacitor bridge response.
     */
    private fun entityToJSObject(entity: VaultItemEntity): JSObject {
        val obj = JSObject()
        obj.put("id", entity.id)
        obj.put("encryptedData", entity.encryptedData)
        obj.put("type", entity.type)
        obj.put("revisionDate", entity.revisionDate)
        obj.put("syncStatus", entity.syncStatus)
        obj.put("folderId", entity.folderId ?: JSObject.NULL)
        obj.put("favorite", entity.favorite)

        // Parse tags from JSON string back to array
        if (entity.tags != null) {
            try {
                val tagsArray = JSONArray(entity.tags)
                obj.put("tags", tagsArray)
            } catch (e: Exception) {
                obj.put("tags", JSArray())
            }
        } else {
            obj.put("tags", JSArray())
        }

        return obj
    }
}
