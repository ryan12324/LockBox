package dev.lockbox.app.credentialprovider

import android.annotation.SuppressLint
import android.content.Context

/**
 * Small durable account binding shared by the Capacitor and provider processes.
 * It contains only the opaque Lockbox user ID, never a token or encryption key.
 */
object PasskeyAccountState {
    private const val PREFS_NAME = "lockbox_passkey_provider"
    private const val ACTIVE_ACCOUNT_ID = "active_account_id"

    fun get(context: Context): String? = context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(ACTIVE_ACCOUNT_ID, null)
        ?.takeIf { it.isNotBlank() }

    @SuppressLint("ApplySharedPref")
    fun set(context: Context, accountId: String) {
        require(accountId.isNotBlank() && accountId.length <= 100) { "Invalid account ID" }
        check(
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(ACTIVE_ACCOUNT_ID, accountId)
                .commit()
        ) { "Could not persist passkey account state" }
    }

    @SuppressLint("ApplySharedPref")
    fun clear(context: Context) {
        check(
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(ACTIVE_ACCOUNT_ID)
                .commit()
        ) { "Could not clear passkey account state" }
    }
}
