package dev.lockbox.app.autofill

import java.net.URI

/** Parse website and native-app locators into the identifier hashed by the local autofill index. */
internal object AutofillIdentifier {
    private val androidPackage = Regex("^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$")

    fun extract(value: String): String? {
        val input = value.trim()
        if (input.isEmpty()) return null

        val parsed = try {
            URI(if (input.contains("://")) input else "https://$input")
        } catch (_: Exception) {
            return null
        }
        val scheme = parsed.scheme?.lowercase() ?: return null
        val host = parsed.host ?: return null
        if (parsed.rawUserInfo != null) return null

        return when {
            scheme == "https" -> AutofillCrypto.normalizeIdentifier(host)
            scheme == "http" && isLoopback(host) -> AutofillCrypto.normalizeIdentifier(host)
            scheme == "androidapp" && isCanonicalAndroidApp(parsed, host) ->
                AutofillCrypto.normalizeIdentifier(host)
            else -> null
        }
    }

    private fun isCanonicalAndroidApp(uri: URI, packageName: String): Boolean {
        return androidPackage.matches(packageName) &&
            uri.port == -1 &&
            uri.rawQuery == null &&
            uri.rawFragment == null &&
            (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")
    }

    private fun isLoopback(host: String): Boolean {
        val normalized = host.lowercase().trim('[', ']')
        return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1"
    }
}
