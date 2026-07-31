package dev.lockbox.app.credentialprovider

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import android.service.credentials.BeginCreateCredentialRequest
import android.service.credentials.BeginCreateCredentialResponse
import android.service.credentials.BeginGetCredentialRequest
import android.service.credentials.BeginGetCredentialResponse
import android.service.credentials.ClearCredentialStateRequest
import android.service.credentials.CreateEntry
import android.service.credentials.CredentialEntry
import android.service.credentials.CredentialProviderService
import androidx.annotation.RequiresApi
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

/**
 * LockboxCredentialProviderService — Android 14+ Credential Provider integration.
 *
 * Registers Lockbox as a system-level passkey provider. Other apps can request
 * passkeys stored in Lockbox through the Android credential picker.
 *
 * Two-phase flow:
 * Phase 1 (this service): Queries Room DB for matching passkeys, returns
 *   PendingIntents wrapped in credential entries for the system picker.
 * Phase 2 (activities): When user taps an entry, the PendingIntent fires
 *   CreatePasskeyActivity or GetPasskeyActivity for actual crypto operations.
 *
 * SECURITY: This service only reads unencrypted passkey metadata (rpId, userName).
 * Private keys remain in Android Keystore. No vault decryption occurs here.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class LockboxCredentialProviderService : CredentialProviderService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        private const val PUBLIC_KEY_TYPE = "public-key"
        private val nextRequestCode = AtomicInteger(1000)
    }

    override fun onBeginGetCredential(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, android.credentials.GetCredentialException>
    ) {
        serviceScope.launch {
            try {
                val db = VaultDatabase.getInstance(applicationContext)
                val responseBuilder = BeginGetCredentialResponse.Builder()
                for (option in request.beginGetCredentialOptions) {
                    if (option.type != PUBLIC_KEY_TYPE) continue

                    val rpId = extractRpId(option.candidateQueryData)
                    // Do not enumerate account metadata when the caller did not
                    // provide a valid relying-party ID.
                    if (rpId == null) continue
                    val passkeys = db.passkeyMetadataDao().getByRpId(rpId)

                    for (passkey in passkeys) {
                        val pendingIntent = buildGetPendingIntent(passkey.credentialId)
                        val slice = PasskeySliceHelper.buildCredentialSlice(
                            applicationContext,
                            passkey.userName,
                            passkey.rpName,
                            pendingIntent
                        )
                        responseBuilder.addCredentialEntry(
                            CredentialEntry(option, slice)
                        )
                    }
                }

                callback.onResult(responseBuilder.build())
            } catch (e: Exception) {
                callback.onError(
                    android.credentials.GetCredentialException(
                        android.credentials.GetCredentialException.TYPE_UNKNOWN,
                        e.message
                    )
                )
            }
        }
    }

    override fun onBeginCreateCredential(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, android.credentials.CreateCredentialException>
    ) {
        serviceScope.launch {
            try {
                val responseBuilder = BeginCreateCredentialResponse.Builder()

                if (request.type == PUBLIC_KEY_TYPE) {
                    val pendingIntent = buildCreatePendingIntent()
                    val slice = PasskeySliceHelper.buildCreateSlice(
                        applicationContext,
                        "Lockbox",
                        pendingIntent
                    )
                    responseBuilder.addCreateEntry(CreateEntry(slice))
                }

                callback.onResult(responseBuilder.build())
            } catch (e: Exception) {
                callback.onError(
                    android.credentials.CreateCredentialException(
                        android.credentials.CreateCredentialException.TYPE_UNKNOWN,
                        e.message
                    )
                )
            }
        }
    }

    override fun onClearCredentialState(
        request: ClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, android.credentials.ClearCredentialStateException>
    ) {
        // This callback clears provider sign-in/session state. Lockbox does not
        // cache any provider session, so there is nothing to clear. Stored
        // passkeys must only be removed through the explicit delete operation.
        callback.onResult(null)
    }

    private fun buildGetPendingIntent(credentialId: String): PendingIntent {
        val requestCode = nextRequestCode.incrementAndGet()
        val intent = Intent(applicationContext, GetPasskeyActivity::class.java).apply {
            putExtra(GetPasskeyActivity.EXTRA_CREDENTIAL_ID, credentialId)
            data = Uri.Builder()
                .scheme("lockbox")
                .authority("credential")
                .appendPath("get")
                .appendPath(credentialId)
                .appendPath(requestCode.toString())
                .build()
        }
        return PendingIntent.getActivity(
            applicationContext,
            requestCode,
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_CANCEL_CURRENT
        )
    }

    private fun buildCreatePendingIntent(): PendingIntent {
        val requestCode = nextRequestCode.incrementAndGet()
        val intent = Intent(applicationContext, CreatePasskeyActivity::class.java).apply {
            data = Uri.Builder()
                .scheme("lockbox")
                .authority("credential")
                .appendPath("create")
                .appendPath(requestCode.toString())
                .build()
        }
        return PendingIntent.getActivity(
            applicationContext,
            requestCode,
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_CANCEL_CURRENT
        )
    }

    /**
     * Extract rpId from the candidate query data bundle.
     * The framework puts the request JSON under a well-known key.
     */
    private fun extractRpId(bundle: android.os.Bundle): String? {
        return try {
            val requestJson = bundle.getString(
                "androidx.credentials.BUNDLE_KEY_REQUEST_JSON"
            ) ?: return null
            val json = JSONObject(requestJson)
            json.optString("rpId").takeIf(::isValidRpId)
        } catch (e: Exception) {
            null
        }
    }
}
