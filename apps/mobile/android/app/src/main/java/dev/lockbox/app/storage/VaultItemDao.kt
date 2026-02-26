package dev.lockbox.app.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

/**
 * VaultItemDao — Room Data Access Object for encrypted vault items.
 *
 * All data is stored as encrypted blobs — Room never sees plaintext.
 * The syncStatus field enables offline-first operation.
 */
@Dao
interface VaultItemDao {

    /**
     * Insert or replace a vault item.
     * Used for both new items and updates from server sync.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: VaultItemEntity)

    /**
     * Batch insert/replace multiple vault items.
     * Used during full sync to efficiently store all server items.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun batchUpsert(items: List<VaultItemEntity>)

    /**
     * Get a single vault item by ID.
     */
    @Query("SELECT * FROM vault_items WHERE id = :id")
    suspend fun getById(id: String): VaultItemEntity?

    /**
     * Get all vault items.
     */
    @Query("SELECT * FROM vault_items ORDER BY revisionDate DESC")
    suspend fun getAll(): List<VaultItemEntity>

    /**
     * Get vault items by type and sync status.
     * Used by AutofillService to find login credentials.
     */
    @Query("SELECT * FROM vault_items WHERE type = :type AND syncStatus = :syncStatus")
    suspend fun getByTypeAndStatus(type: String, syncStatus: String): List<VaultItemEntity>

    /**
     * Get all items with pending sync operations.
     * Returns items that need to be pushed to the server.
     */
    @Query("SELECT * FROM vault_items WHERE syncStatus != 'synced'")
    suspend fun getPending(): List<VaultItemEntity>

    /**
     * Update the sync status of a specific item.
     */
    @Query("UPDATE vault_items SET syncStatus = :syncStatus WHERE id = :id")
    suspend fun updateSyncStatus(id: String, syncStatus: String)

    /**
     * Delete a vault item by ID.
     */
    @Query("DELETE FROM vault_items WHERE id = :id")
    suspend fun deleteById(id: String)

    /**
     * Delete all vault items (used on logout/clear).
     */
    @Query("DELETE FROM vault_items")
    suspend fun deleteAll()

    /**
     * Count all vault items.
     */
    @Query("SELECT COUNT(*) FROM vault_items")
    suspend fun count(): Int

    /**
     * Count items with pending sync operations.
     */
    @Query("SELECT COUNT(*) FROM vault_items WHERE syncStatus != 'synced'")
    suspend fun countPending(): Int
}
