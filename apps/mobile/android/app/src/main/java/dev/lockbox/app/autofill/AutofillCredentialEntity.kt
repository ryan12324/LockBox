package dev.lockbox.app.autofill

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Device-local autofill index.
 *
 * Domain identifiers are salted hashes and credential payloads are hybrid-
 * encrypted to an authentication-bound Android Keystore RSA key. A bounded,
 * single-line username is retained as device-local display metadata so people
 * can distinguish matching accounts before authenticating. Passwords, item
 * names, and raw URIs are never stored in plaintext.
 */
@Entity(tableName = "autofill_credentials")
data class AutofillCredentialEntity(
    @PrimaryKey val id: String,
    val domainHashes: String,
    @ColumnInfo(defaultValue = "''")
    val displayUsername: String,
    val encryptedData: String,
    val updatedAt: String
)
