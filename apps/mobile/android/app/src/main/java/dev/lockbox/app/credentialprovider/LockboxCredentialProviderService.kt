package dev.lockbox.app.credentialprovider

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.PasswordCredentialEntry
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import androidx.credentials.provider.PublicKeyCredentialEntry
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import dev.lockbox.app.R
import dev.lockbox.app.autofill.AutofillDiagnostics
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

/** Android 14+ password and passkey provider backed by biometric-gated indexes. */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class LockboxCredentialProviderService : CredentialProviderService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        serviceScope.launch {
            try {
                val database = VaultDatabase.getInstance(applicationContext)
                val response = BeginGetCredentialResponse.Builder()
                var passwordMatchCount = 0
                var handledPasswordRequest = false

                for (option in request.beginGetCredentialOptions) {
                    if (cancellationSignal.isCanceled) return@launch
                    when (option) {
                        is BeginGetPasswordOption -> {
                            handledPasswordRequest = true
                            val callingAppInfo = request.callingAppInfo ?: continue
                            val targetHashes = credentialTargetHashes(
                                applicationContext,
                                callingAppInfo
                            )
                            val credentials = database.autofillCredentialDao()
                                .getAll()
                                .filter { it.matchesAnyDomainHash(targetHashes) }
                            passwordMatchCount += credentials.size
                            credentials.forEach { credential ->
                                response.addCredentialEntry(
                                    PasswordCredentialEntry.Builder(
                                        applicationContext,
                                        "Authwell credential",
                                        buildPasswordPendingIntent(credential.id),
                                        option
                                    )
                                        .setDisplayName("Unlock to fill")
                                        .setIcon(Icon.createWithResource(
                                            applicationContext,
                                            R.mipmap.ic_launcher
                                        ))
                                        .setAutoSelectAllowed(false)
                                        .build()
                                )
                            }
                        }

                        is BeginGetPublicKeyCredentialOption -> {
                            val rpId = extractRpId(option.requestJson) ?: continue
                            val accountId = PasskeyAccountState.get(applicationContext) ?: continue
                            database.passkeyMetadataDao()
                                .getByRpIdAndAccount(rpId, accountId)
                                .forEach { passkey ->
                                    response.addCredentialEntry(
                                        PublicKeyCredentialEntry.Builder(
                                            applicationContext,
                                            passkey.userName,
                                            buildPasskeyPendingIntent(passkey.credentialId),
                                            option
                                        )
                                            .setDisplayName(passkey.rpName)
                                            .setIcon(Icon.createWithResource(
                                                applicationContext,
                                                R.mipmap.ic_launcher
                                            ))
                                            .setAutoSelectAllowed(false)
                                            .build()
                                    )
                                }
                        }
                    }
                }

                if (handledPasswordRequest) {
                    AutofillDiagnostics.recordRequest(applicationContext, passwordMatchCount)
                }
                callback.onResult(response.build())
            } catch (error: Exception) {
                AutofillDiagnostics.recordFailure(
                    applicationContext,
                    "Credential Manager could not read the encrypted index"
                )
                callback.onError(GetCredentialUnknownException(error.message))
            }
        }
    }

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        serviceScope.launch {
            try {
                val response = BeginCreateCredentialResponse.Builder()
                if (
                    request is BeginCreatePublicKeyCredentialRequest &&
                    PasskeyAccountState.get(applicationContext) != null
                ) {
                    val count = VaultDatabase.getInstance(applicationContext)
                        .passkeyMetadataDao()
                        .getAll()
                        .size
                    response.addCreateEntry(
                        CreateEntry.Builder("Authwell", buildCreatePasskeyPendingIntent())
                            .setDescription("Save passkey to your encrypted Authwell vault")
                            .setIcon(Icon.createWithResource(
                                applicationContext,
                                R.mipmap.ic_launcher
                            ))
                            .setPublicKeyCredentialCount(count)
                            .build()
                    )
                }
                callback.onResult(response.build())
            } catch (error: Exception) {
                callback.onError(CreateCredentialUnknownException(error.message))
            }
        }
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>
    ) {
        callback.onResult(null)
    }

    private fun buildPasswordPendingIntent(credentialId: String): PendingIntent {
        val requestCode = nextRequestCode.incrementAndGet()
        val intent = Intent(applicationContext, GetPasswordActivity::class.java).apply {
            putExtra(GetPasswordActivity.EXTRA_CREDENTIAL_ID, credentialId)
            data = credentialUri("password", credentialId, requestCode)
        }
        return pendingIntent(requestCode, intent)
    }

    private fun buildPasskeyPendingIntent(credentialId: String): PendingIntent {
        val requestCode = nextRequestCode.incrementAndGet()
        val intent = Intent(applicationContext, GetPasskeyActivity::class.java).apply {
            putExtra(GetPasskeyActivity.EXTRA_CREDENTIAL_ID, credentialId)
            data = credentialUri("passkey", credentialId, requestCode)
        }
        return pendingIntent(requestCode, intent)
    }

    private fun buildCreatePasskeyPendingIntent(): PendingIntent {
        val requestCode = nextRequestCode.incrementAndGet()
        val intent = Intent(applicationContext, CreatePasskeyActivity::class.java).apply {
            data = credentialUri("create-passkey", null, requestCode)
        }
        return pendingIntent(requestCode, intent)
    }

    private fun pendingIntent(requestCode: Int, intent: Intent): PendingIntent =
        PendingIntent.getActivity(
            applicationContext,
            requestCode,
            intent,
            PendingIntent.FLAG_MUTABLE or
                PendingIntent.FLAG_ONE_SHOT or
                PendingIntent.FLAG_CANCEL_CURRENT
        )

    private fun credentialUri(kind: String, id: String?, requestCode: Int): Uri {
        val builder = Uri.Builder()
            .scheme("authwell")
            .authority("credential")
            .appendPath(kind)
        if (id != null) builder.appendPath(id)
        return builder.appendPath(requestCode.toString()).build()
    }

    private fun extractRpId(requestJson: String): String? = try {
        JSONObject(requestJson).optString("rpId").takeIf(::isValidRpId)
    } catch (_: Exception) {
        null
    }

    companion object {
        private val nextRequestCode = AtomicInteger(1_000)
    }
}
