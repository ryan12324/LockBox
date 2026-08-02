package dev.lockbox.app.autofill

import android.content.Context

/** Non-sensitive health signals shown by the in-app AutoFill setup flow. */
internal object AutofillDiagnostics {
    private const val PREFS_NAME = "authwell_autofill_health"
    private const val INDEXED_COUNT = "indexed_count"
    private const val INDEXED_AT = "indexed_at"
    private const val LAST_REQUEST_AT = "last_request_at"
    private const val LAST_MATCH_COUNT = "last_match_count"
    private const val LAST_ERROR = "last_error"

    data class Snapshot(
        val indexedCredentials: Int,
        val indexedAt: Long?,
        val lastRequestAt: Long?,
        val lastMatchCount: Int?,
        val lastError: String?
    )

    fun recordIndex(context: Context, count: Int) {
        preferences(context).edit()
            .putInt(INDEXED_COUNT, count)
            .putLong(INDEXED_AT, System.currentTimeMillis())
            .remove(LAST_ERROR)
            .apply()
    }

    fun recordRequest(context: Context, matchCount: Int) {
        preferences(context).edit()
            .putLong(LAST_REQUEST_AT, System.currentTimeMillis())
            .putInt(LAST_MATCH_COUNT, matchCount)
            .remove(LAST_ERROR)
            .apply()
    }

    fun recordFailure(context: Context, message: String) {
        preferences(context).edit()
            .putLong(LAST_REQUEST_AT, System.currentTimeMillis())
            .putString(LAST_ERROR, message.take(160))
            .apply()
    }

    fun clearIndex(context: Context) {
        preferences(context).edit()
            .putInt(INDEXED_COUNT, 0)
            .remove(INDEXED_AT)
            .remove(LAST_ERROR)
            .apply()
    }

    fun snapshot(context: Context): Snapshot {
        val prefs = preferences(context)
        return Snapshot(
            indexedCredentials = prefs.getInt(INDEXED_COUNT, 0),
            indexedAt = prefs.optionalLong(INDEXED_AT),
            lastRequestAt = prefs.optionalLong(LAST_REQUEST_AT),
            lastMatchCount = if (prefs.contains(LAST_MATCH_COUNT)) {
                prefs.getInt(LAST_MATCH_COUNT, 0)
            } else {
                null
            },
            lastError = prefs.getString(LAST_ERROR, null)
        )
    }

    private fun preferences(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun android.content.SharedPreferences.optionalLong(key: String): Long? =
        if (contains(key)) getLong(key, 0L) else null
}
