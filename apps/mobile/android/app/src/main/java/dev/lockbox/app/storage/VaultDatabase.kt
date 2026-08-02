package dev.lockbox.app.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import dev.lockbox.app.credentialprovider.PasskeyMetadataDao
import dev.lockbox.app.credentialprovider.PasskeyMetadataEntity
import dev.lockbox.app.autofill.AutofillCredentialDao
import dev.lockbox.app.autofill.AutofillCredentialEntity
import dev.lockbox.app.autofill.PendingAutofillSaveDao
import dev.lockbox.app.autofill.PendingAutofillSaveEntity

/**
 * VaultDatabase — Room database for encrypted vault item storage.
 *
 * This database is shared between the Capacitor WebView process and
 * the AutofillService process via enableMultiInstanceInvalidation().
 *
 * SECURITY: Secret vault payloads are stored only as encrypted blobs. Room also
 * keeps the minimum non-secret metadata Android needs to present Autofill and
 * passkey choices, including a bounded display username.
 */
@Database(
    entities = [
        VaultItemEntity::class,
        PasskeyMetadataEntity::class,
        AutofillCredentialEntity::class,
        PendingAutofillSaveEntity::class
    ],
    version = 9,
    exportSchema = true
)
abstract class VaultDatabase : RoomDatabase() {

    abstract fun vaultItemDao(): VaultItemDao
    abstract fun passkeyMetadataDao(): PasskeyMetadataDao
    abstract fun autofillCredentialDao(): AutofillCredentialDao
    abstract fun pendingAutofillSaveDao(): PendingAutofillSaveDao

    companion object {
        private const val DATABASE_NAME = "lockbox_vault.db"

        /** Remove the obsolete standalone IV column; encryptedData already contains it. */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS vault_items_new (
                        id TEXT NOT NULL PRIMARY KEY,
                        encryptedData TEXT NOT NULL,
                        type TEXT NOT NULL,
                        revisionDate TEXT NOT NULL,
                        syncStatus TEXT NOT NULL,
                        folderId TEXT,
                        tags TEXT,
                        favorite INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT INTO vault_items_new (
                        id, encryptedData, type, revisionDate, syncStatus, folderId, tags, favorite
                    )
                    SELECT id, encryptedData, type, revisionDate, syncStatus, folderId, tags, favorite
                    FROM vault_items
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE vault_items")
                db.execSQL("ALTER TABLE vault_items_new RENAME TO vault_items")
            }
        }

        /** Add local metadata for Android's passkey credential provider. */
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS passkey_metadata (
                        credentialId TEXT NOT NULL PRIMARY KEY,
                        rpId TEXT NOT NULL,
                        rpName TEXT NOT NULL,
                        userName TEXT NOT NULL,
                        userDisplayName TEXT NOT NULL,
                        userId TEXT NOT NULL,
                        keystoreAlias TEXT NOT NULL,
                        createdAt TEXT NOT NULL
                    )
                    """.trimIndent()
                )
            }
        }

        /** Add the biometric-gated, device-local login index used by AutofillService. */
        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS autofill_credentials (
                        id TEXT NOT NULL PRIMARY KEY,
                        domainHashes TEXT NOT NULL,
                        encryptedData TEXT NOT NULL,
                        updatedAt TEXT NOT NULL
                    )
                    """.trimIndent()
                )
            }
        }

        /** Track the server revision that an offline edit was based on. */
        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE vault_items ADD COLUMN baseRevisionDate TEXT")
                db.execSQL("UPDATE vault_items SET baseRevisionDate = revisionDate")
            }
        }

        /** Add biometric-gated encrypted material for passkeys synced from the vault. */
        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE passkey_metadata ADD COLUMN encryptedPrivateKey TEXT")
                db.execSQL(
                    "ALTER TABLE passkey_metadata ADD COLUMN source TEXT NOT NULL DEFAULT 'local'"
                )
            }
        }

        /** Bind passkeys to an account and support durable, idempotent vault export. */
        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE passkey_metadata ADD COLUMN publicKey TEXT NOT NULL DEFAULT ''"
                )
                db.execSQL(
                    "ALTER TABLE passkey_metadata ADD COLUMN vaultItemId TEXT NOT NULL DEFAULT ''"
                )
                db.execSQL(
                    "ALTER TABLE passkey_metadata ADD COLUMN accountId TEXT NOT NULL DEFAULT ''"
                )
            }
        }

        /** Add the biometric-gated outbox used by Android's AutoFill save flow. */
        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS pending_autofill_saves (
                        id TEXT NOT NULL PRIMARY KEY,
                        accountId TEXT NOT NULL,
                        domainHashes TEXT NOT NULL,
                        encryptedData TEXT NOT NULL,
                        autofillEncryptedData TEXT NOT NULL,
                        createdAt TEXT NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """CREATE INDEX IF NOT EXISTS index_pending_autofill_saves_accountId
                       ON pending_autofill_saves (accountId)""".trimIndent()
                )
            }
        }

        /** Add safe display metadata so matching AutoFill accounts are distinguishable. */
        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE autofill_credentials " +
                        "ADD COLUMN displayUsername TEXT NOT NULL DEFAULT ''"
                )
            }
        }

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
                .addMigrations(
                    MIGRATION_1_2,
                    MIGRATION_2_3,
                    MIGRATION_3_4,
                    MIGRATION_4_5,
                    MIGRATION_5_6,
                    MIGRATION_6_7,
                    MIGRATION_7_8,
                    MIGRATION_8_9
                )
                .build()
        }
    }
}
