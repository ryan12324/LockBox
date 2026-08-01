package dev.lockbox.app.credentialprovider

import android.content.Context
import android.content.pm.Signature
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.credentials.provider.CallingAppInfo
import dev.lockbox.app.R
import org.json.JSONArray
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection

/** Verified origin information for a Credential Manager request. */
internal data class VerifiedPasskeyCaller(
    val origin: String,
    val privilegedBrowserCall: Boolean
)

/**
 * Verify the party asking Lockbox to create or use a passkey.
 *
 * Browsers must be present in the bundled Google Password Manager privileged
 * app allowlist before their delegated web origin is trusted. Native apps must
 * be authorized by the RP's Digital Asset Links document. Both paths fail
 * closed; a package name alone is never enough to use a stored passkey.
 */
@RequiresApi(Build.VERSION_CODES.P)
internal fun verifyPasskeyCaller(
    context: Context,
    rpId: String,
    callingAppInfo: CallingAppInfo
): VerifiedPasskeyCaller {
    if (callingAppInfo.isOriginPopulated()) {
        val allowlist = context.resources.openRawResource(
            R.raw.gpm_passkeys_privileged_apps
        ).bufferedReader().use { it.readText() }
        val origin = callingAppInfo.getOrigin(allowlist)
            ?: throw SecurityException("Privileged caller did not provide an origin")
        return VerifiedPasskeyCaller(origin, privilegedBrowserCall = true)
    }

    require(verifyDigitalAssetLinks(rpId, callingAppInfo)) {
        "The calling app is not linked to this relying party"
    }
    return VerifiedPasskeyCaller(
        getCallingAppOrigin(callingAppInfo),
        privilegedBrowserCall = false
    )
}

@RequiresApi(Build.VERSION_CODES.P)
private fun verifyDigitalAssetLinks(
    rpId: String,
    callingAppInfo: CallingAppInfo
): Boolean {
    if (!isValidRpId(rpId)) return false
    val connection = URL("https://$rpId/.well-known/assetlinks.json")
        .openConnection() as HttpsURLConnection
    return try {
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        if (connection.responseCode != HttpsURLConnection.HTTP_OK) return false
        val body = connection.inputStream.bufferedReader().use { reader ->
            val value = reader.readText()
            if (value.length > MAX_ASSET_LINKS_SIZE) return false
            value
        }
        val statements = JSONArray(body)
        val packageName = callingAppInfo.packageName
        val callerFingerprints = currentSignatures(callingAppInfo)
            .map(::sha256Fingerprint)
            .toSet()
        if (callerFingerprints.isEmpty()) return false

        (0 until statements.length()).any { index ->
            val statement = statements.optJSONObject(index) ?: return@any false
            val relations = statement.optJSONArray("relation") ?: return@any false
            val permitsCredentials = (0 until relations.length()).any { relationIndex ->
                relations.optString(relationIndex) == "delegate_permission/common.get_login_creds"
            }
            if (!permitsCredentials) return@any false

            val target = statement.optJSONObject("target") ?: return@any false
            if (target.optString("namespace") != "android_app") return@any false
            if (target.optString("package_name") != packageName) return@any false
            val fingerprints = target.optJSONArray("sha256_cert_fingerprints") ?: return@any false
            val allowed = (0 until fingerprints.length())
                .map { fingerprintIndex -> fingerprints.optString(fingerprintIndex).uppercase() }
                .toSet()
            callerFingerprints.all(allowed::contains)
        }
    } catch (_: Exception) {
        false
    } finally {
        connection.disconnect()
    }
}

@RequiresApi(Build.VERSION_CODES.P)
private fun currentSignatures(callingAppInfo: CallingAppInfo): Array<Signature> {
    val signingInfo = callingAppInfo.signingInfo
    return if (signingInfo.hasMultipleSigners()) {
        signingInfo.apkContentsSigners
    } else {
        signingInfo.apkContentsSigners.takeIf { it.isNotEmpty() }
            ?: signingInfo.signingCertificateHistory
    }
}

private fun sha256Fingerprint(signature: Signature): String =
    MessageDigest.getInstance("SHA-256")
        .digest(signature.toByteArray())
        .joinToString(":") { byte -> "%02X".format(byte.toInt() and 0xff) }

private const val MAX_ASSET_LINKS_SIZE = 256 * 1024
