package dev.lockbox.app.autofill

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PendingAutofillSaveDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(save: PendingAutofillSaveEntity)

    @Query(
        """SELECT * FROM pending_autofill_saves
            WHERE accountId = :accountId
            ORDER BY createdAt ASC"""
    )
    suspend fun getByAccount(accountId: String): List<PendingAutofillSaveEntity>

    @Query(
        """SELECT * FROM pending_autofill_saves
            WHERE id = :id AND accountId = :accountId"""
    )
    suspend fun getByIdAndAccount(id: String, accountId: String): PendingAutofillSaveEntity?

    @Query("DELETE FROM pending_autofill_saves WHERE id = :id AND accountId = :accountId")
    suspend fun deleteByIdAndAccount(id: String, accountId: String): Int

    @Query("DELETE FROM pending_autofill_saves")
    suspend fun deleteAll()

    @Query(
        """DELETE FROM pending_autofill_saves
            WHERE accountId = :accountId
              AND id IN (
                SELECT id FROM pending_autofill_saves
                WHERE accountId = :accountId
                ORDER BY createdAt DESC
                LIMIT -1 OFFSET :keep
              )"""
    )
    suspend fun keepNewest(accountId: String, keep: Int)
}
