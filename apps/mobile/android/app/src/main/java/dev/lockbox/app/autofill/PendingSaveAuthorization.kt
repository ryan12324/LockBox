package dev.lockbox.app.autofill

import android.content.Context
import android.util.Base64
import java.security.MessageDigest

/** Account-scoped verifier for a proof derived from the in-memory vault key. */
internal object PendingSaveAuthorization {
    private const val PREFS_NAME = "authwell_pending_save_authorization"
    private const val PREF_ACCOUNT_ID = "account_id"
    private const val PREF_PROOF_HASH = "proof_hash"

    fun configure(context: Context, accountId: String, proof: ByteArray) {
        require(proof.size == 32) { "Invalid pending-save authorization" }
        val stored = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_ACCOUNT_ID, accountId)
            .putString(PREF_PROOF_HASH, encode(MessageDigest.getInstance("SHA-256").digest(proof)))
            .commit()
        check(stored) { "Could not persist pending-save authorization" }
    }

    fun verify(context: Context, accountId: String, proof: ByteArray): Boolean {
        if (proof.size != 32) return false
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getString(PREF_ACCOUNT_ID, null) != accountId) return false
        val expected = prefs.getString(PREF_PROOF_HASH, null)?.let(::decode) ?: return false
        val actual = MessageDigest.getInstance("SHA-256").digest(proof)
        return MessageDigest.isEqual(expected, actual)
    }

    fun clear(context: Context) {
        val cleared = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        check(cleared) { "Could not clear pending-save authorization" }
    }

    private fun encode(value: ByteArray): String =
        Base64.encodeToString(value, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray? = try {
        Base64.decode(value, Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
        null
    }
}
