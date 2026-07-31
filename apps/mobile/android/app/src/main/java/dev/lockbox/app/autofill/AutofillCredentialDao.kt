package dev.lockbox.app.autofill

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface AutofillCredentialDao {
    @Query("SELECT * FROM autofill_credentials")
    suspend fun getAll(): List<AutofillCredentialEntity>

    @Query("SELECT * FROM autofill_credentials WHERE id = :id")
    suspend fun getById(id: String): AutofillCredentialEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<AutofillCredentialEntity>)

    @Query("DELETE FROM autofill_credentials")
    suspend fun deleteAll()

    @Transaction
    suspend fun replaceAll(items: List<AutofillCredentialEntity>) {
        deleteAll()
        if (items.isNotEmpty()) insertAll(items)
    }
}
