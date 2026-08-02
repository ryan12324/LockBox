package dev.lockbox.app.credentialprovider

import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.credentials.provider.CallingAppInfo
import dev.lockbox.app.R
import dev.lockbox.app.autofill.AutofillCredentialEntity
import dev.lockbox.app.autofill.AutofillCrypto
import dev.lockbox.app.autofill.AutofillIdentifier
import org.json.JSONArray

/** Resolve the trusted website or package identifiers a password request may use. */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
internal fun credentialTargetIdentifiers(
    context: Context,
    callingAppInfo: CallingAppInfo
): Set<String> {
    val identifiers = linkedSetOf<String>()
    AutofillIdentifier.extract(callingAppInfo.packageName)?.let(identifiers::add)

    if (callingAppInfo.isOriginPopulated()) {
        val allowlist = context.resources.openRawResource(
            R.raw.gpm_passkeys_privileged_apps
        ).bufferedReader().use { it.readText() }
        val origin = callingAppInfo.getOrigin(allowlist)
            ?: throw SecurityException("Privileged caller did not provide an origin")
        AutofillIdentifier.extract(origin)?.let(identifiers::add)
    }
    return identifiers
}

internal fun AutofillCredentialEntity.matchesAnyDomainHash(hashes: Set<String>): Boolean {
    val stored = JSONArray(domainHashes)
    return (0 until stored.length()).any { stored.optString(it) in hashes }
}

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
internal fun credentialTargetHashes(
    context: Context,
    callingAppInfo: CallingAppInfo
): Set<String> = credentialTargetIdentifiers(context, callingAppInfo).mapTo(linkedSetOf()) {
    AutofillCrypto.hashIdentifier(context, it)
}
