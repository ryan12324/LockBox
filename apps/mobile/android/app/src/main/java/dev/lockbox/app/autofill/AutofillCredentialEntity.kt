package dev.lockbox.app.autofill

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Device-local autofill index.
 *
 * Domain identifiers are salted hashes and credential payloads are hybrid-
 * encrypted to an authentication-bound Android Keystore RSA key. No username,
 * password, item name, or raw URI is stored in plaintext.
 */
@Entity(tableName = "autofill_credentials")
data class AutofillCredentialEntity(
    @PrimaryKey val id: String,
    val domainHashes: String,
    val encryptedData: String,
    val updatedAt: String
)
