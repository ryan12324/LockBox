package dev.lockbox.app.credentialprovider

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

/**
 * PasskeyMetadataDao — Room DAO for passkey metadata queries.
 *
 * Used by both the CredentialProviderService (to list available passkeys)
 * and the CredentialManagerPlugin (for CRUD operations).
 */
@Dao
interface PasskeyMetadataDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(metadata: PasskeyMetadataEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(metadata: List<PasskeyMetadataEntity>)

    @Query("SELECT * FROM passkey_metadata")
    suspend fun getAll(): List<PasskeyMetadataEntity>

    @Query("SELECT * FROM passkey_metadata WHERE rpId = :rpId")
    suspend fun getByRpId(rpId: String): List<PasskeyMetadataEntity>

    @Query("SELECT * FROM passkey_metadata WHERE rpId = :rpId AND accountId = :accountId")
    suspend fun getByRpIdAndAccount(rpId: String, accountId: String): List<PasskeyMetadataEntity>

    @Query("SELECT * FROM passkey_metadata WHERE credentialId = :credentialId")
    suspend fun getByCredentialId(credentialId: String): PasskeyMetadataEntity?

    @Query("SELECT * FROM passkey_metadata WHERE credentialId = :credentialId AND accountId = :accountId")
    suspend fun getByCredentialIdAndAccount(
        credentialId: String,
        accountId: String
    ): PasskeyMetadataEntity?

    @Query("SELECT * FROM passkey_metadata WHERE source = :source AND accountId = :accountId")
    suspend fun getBySourceAndAccount(
        source: String,
        accountId: String
    ): List<PasskeyMetadataEntity>

    @Query("DELETE FROM passkey_metadata WHERE credentialId = :credentialId")
    suspend fun deleteByCredentialId(credentialId: String)

    @Query("DELETE FROM passkey_metadata")
    suspend fun deleteAll()

    @Query("DELETE FROM passkey_metadata WHERE source = :source")
    suspend fun deleteBySource(source: String)

    @Query(
        """UPDATE passkey_metadata
            SET source = :source
            WHERE credentialId = :credentialId
              AND vaultItemId = :vaultItemId
              AND accountId = :accountId"""
    )
    suspend fun updateSource(
        credentialId: String,
        vaultItemId: String,
        accountId: String,
        source: String
    ): Int

    @Query(
        """UPDATE passkey_metadata
            SET accountId = :accountId
            WHERE accountId = '' AND source = 'local'"""
    )
    suspend fun adoptLegacyLocal(accountId: String): Int

    @Transaction
    suspend fun replaceSynced(metadata: List<PasskeyMetadataEntity>) {
        deleteBySource(PasskeyMetadataEntity.SOURCE_SYNCED)
        insertAll(metadata)
    }
}
