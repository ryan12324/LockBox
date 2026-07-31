package dev.lockbox.app.credentialprovider

import android.util.Base64
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.credentials.provider.CallingAppInfo
import java.security.MessageDigest

/** Build the WebAuthn Android origin from the caller's verified signing certificate. */
@RequiresApi(Build.VERSION_CODES.P)
internal fun getCallingAppOrigin(callingAppInfo: CallingAppInfo): String {
    val signingInfo = callingAppInfo.signingInfo
    val signatures = if (signingInfo.hasMultipleSigners()) {
        signingInfo.apkContentsSigners
    } else {
        signingInfo.signingCertificateHistory
    }
    val certificate = signatures.firstOrNull()
        ?: throw IllegalStateException("Calling application has no signing certificate")
    val digest = MessageDigest.getInstance("SHA-256").digest(certificate.toByteArray())
    val encoded = Base64.encodeToString(
        digest,
        Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
    )
    return "android:apk-key-hash:$encoded"
}

/** Accept only canonical, unpadded base64url values within WebAuthn bounds. */
internal fun decodeCanonicalBase64url(value: String, minBytes: Int, maxBytes: Int): ByteArray {
    require(value.matches(Regex("^[A-Za-z0-9_-]+$"))) { "Invalid base64url value" }
    val decoded = try {
        Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
        throw IllegalArgumentException("Invalid base64url value")
    }
    require(decoded.size in minBytes..maxBytes) { "Invalid base64url value length" }
    val canonical = Base64.encodeToString(
        decoded,
        Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
    )
    require(canonical == value) { "Non-canonical base64url value" }
    return decoded
}

/** Validate the ASCII/punycode domain form accepted for a WebAuthn RP ID. */
internal fun isValidRpId(rpId: String): Boolean {
    if (rpId.isEmpty() || rpId.length > 253 || rpId.endsWith('.') || rpId != rpId.lowercase()) {
        return false
    }
    val labelPattern = Regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
    return rpId.split('.').all { label -> labelPattern.matches(label) }
}
