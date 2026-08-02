package dev.lockbox.app.autofill

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Durable outbox entry created after the user accepts Android's AutoFill save UI.
 *
 * Usernames, passwords, and target identifiers exist only in two device-bound
 * envelopes: [encryptedData] for vault import and [autofillEncryptedData] for
 * biometric-gated filling. The account ID prevents a pending save from being
 * imported into a different signed-in vault.
 */
@Entity(
    tableName = "pending_autofill_saves",
    indices = [Index(value = ["accountId"])]
)
data class PendingAutofillSaveEntity(
    @PrimaryKey val id: String,
    val accountId: String,
    val domainHashes: String,
    val encryptedData: String,
    val autofillEncryptedData: String,
    val createdAt: String
)
