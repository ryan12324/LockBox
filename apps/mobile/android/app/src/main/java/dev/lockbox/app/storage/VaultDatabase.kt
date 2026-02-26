package dev.lockbox.app.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * VaultDatabase — Room database for encrypted vault item storage.
 *
 * This database is shared between the Capacitor WebView process and
 * the AutofillService process via enableMultiInstanceInvalidation().
 *
 * SECURITY: Only encrypted blobs are stored. Room never sees plaintext vault data.
 * The encryption/decryption happens in the TypeScript layer using the user key.
 */
@Database(
    entities = [VaultItemEntity::class],
    version = 1,
    exportSchema = true
)
abstract class VaultDatabase : RoomDatabase() {

    abstract fun vaultItemDao(): VaultItemDao

    companion object {
        private const val DATABASE_NAME = "lockbox_vault.db"

        @Volatile
        private var instance: VaultDatabase? = null

        /**
         * Get singleton database instance with multi-process support.
         *
         * enableMultiInstanceInvalidation() is critical because:
         * - Main Capacitor WebView runs in the app process
         * - AutofillService runs in a SEPARATE process
         * - Both need to read/write the same database
         * - Multi-instance invalidation ensures both see changes
         */
        fun getInstance(context: Context): VaultDatabase {
            return instance ?: synchronized(this) {
                instance ?: buildDatabase(context).also { instance = it }
            }
        }

        private fun buildDatabase(context: Context): VaultDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                VaultDatabase::class.java,
                DATABASE_NAME
            )
                .enableMultiInstanceInvalidation()
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
