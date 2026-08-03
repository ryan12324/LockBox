package dev.lockbox.app.autofill

import android.content.Context
import android.content.pm.ApplicationInfo
import org.json.JSONObject

/** Loads optional test hooks that exist in debug APKs but are absent from release APKs. */
internal object AutofillDebugHooks {
    private const val PROVIDER_CLASS =
        "dev.lockbox.app.autofill.AutofillE2eHooks"

    data class Payload(val name: String, val username: String, val password: String)

    fun payloadFor(context: Context, credentialId: String): Payload? {
        if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0) return null
        val encoded = runCatching {
            Class.forName(PROVIDER_CLASS)
                .getMethod("payloadFor", Context::class.java, String::class.java)
                .invoke(null, context, credentialId) as? String
        }.getOrNull() ?: return null
        val payload = JSONObject(encoded)
        return Payload(
            name = payload.getString("name"),
            username = payload.getString("username"),
            password = payload.getString("password")
        )
    }
}
