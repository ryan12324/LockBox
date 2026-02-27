package dev.lockbox.app.credentialprovider

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * PasskeyMetadataEntity — Room entity for passkey metadata.
 *
 * Stores unencrypted passkey metadata so the CredentialProviderService
 * can query available passkeys without needing vault decryption.
 * Private keys are stored in Android Keystore, not in Room.
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
    val createdAt: String // ISO 8601 timestamp
)
