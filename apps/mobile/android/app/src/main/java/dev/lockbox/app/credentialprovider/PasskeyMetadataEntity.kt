package dev.lockbox.app.credentialprovider

import androidx.room.Entity
import androidx.room.ColumnInfo
import androidx.room.PrimaryKey

/**
 * PasskeyMetadataEntity — Room entity for passkey metadata.
 *
 * Stores unencrypted passkey metadata so the CredentialProviderService
 * can query available passkeys without needing vault decryption.
 * Private keys are either held by a legacy Android Keystore alias or
 * hybrid-encrypted to a biometric-bound Android Keystore key before Room sees
 * them. Pending device-created keys can therefore survive process death and be
 * uploaded to the user's encrypted vault after an explicit biometric unlock.
 */
@Entity(tableName = "passkey_metadata")
data class PasskeyMetadataEntity(
    @PrimaryKey val credentialId: String,
    val rpId: String,
    val rpName: String,
    val userName: String,
    val userDisplayName: String,
    val userId: String, // base64url-encoded user ID
    val keystoreAlias: String, // Android Keystore alias for the EC private key
    val createdAt: String, // ISO 8601 timestamp
    val encryptedPrivateKey: String? = null,
    @ColumnInfo(defaultValue = "''")
    val publicKey: String = "", // base64url COSE public key
    @ColumnInfo(defaultValue = "''")
    val vaultItemId: String = "", // stable UUID used for idempotent vault upload
    @ColumnInfo(defaultValue = "''")
    val accountId: String = "", // Lockbox account that owns this local record
    @ColumnInfo(defaultValue = "'local'")
    val source: String = SOURCE_LOCAL
) {
    companion object {
        const val SOURCE_LOCAL = "local"
        const val SOURCE_PENDING = "pending"
        const val SOURCE_SYNCED = "synced"
    }
}
