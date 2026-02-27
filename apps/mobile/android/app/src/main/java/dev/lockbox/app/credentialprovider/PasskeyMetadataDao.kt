package dev.lockbox.app.credentialprovider

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

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

    @Query("SELECT * FROM passkey_metadata")
    suspend fun getAll(): List<PasskeyMetadataEntity>

    @Query("SELECT * FROM passkey_metadata WHERE rpId = :rpId")
    suspend fun getByRpId(rpId: String): List<PasskeyMetadataEntity>

    @Query("SELECT * FROM passkey_metadata WHERE credentialId = :credentialId")
    suspend fun getByCredentialId(credentialId: String): PasskeyMetadataEntity?

    @Query("DELETE FROM passkey_metadata WHERE credentialId = :credentialId")
    suspend fun deleteByCredentialId(credentialId: String)

    @Query("DELETE FROM passkey_metadata")
    suspend fun deleteAll()
}
