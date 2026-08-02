package dev.lockbox.app.credentialprovider

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPasswordOption
import androidx.credentials.PasswordCredential
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
import androidx.fragment.app.FragmentActivity
import dev.lockbox.app.autofill.AutofillCredentialEntity
import dev.lockbox.app.autofill.AutofillCrypto
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Biometrically decrypts one indexed login and returns it to Credential Manager. */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class GetPasswordActivity : FragmentActivity() {
    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        val credentialId = intent.getStringExtra(EXTRA_CREDENTIAL_ID)
        val request = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
        if (credentialId == null || request == null) {
            finishWithError("The password request was incomplete")
            return
        }

        activityScope.launch {
            try {
                val credential = prepareCredential(credentialId, request)
                val privateKey = AutofillCrypto.getPrivateKey()
                    ?: throw IllegalStateException("Unlock Authwell once to prepare AutoFill")
                val envelope = AutofillCrypto.parseEnvelope(credential.encryptedData)
                val cipher = AutofillCrypto.createUnwrapCipher(privateKey)
                withContext(Dispatchers.Main) {
                    authenticate(credential, request, envelope, cipher)
                }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) {
                    finishWithError(error.message ?: "Password request failed")
                }
            }
        }
    }

    override fun onDestroy() {
        activityScope.cancel()
        super.onDestroy()
    }

    private suspend fun prepareCredential(
        credentialId: String,
        request: ProviderGetCredentialRequest
    ): AutofillCredentialEntity {
        require(request.credentialOptions.any { it is GetPasswordOption }) {
            "Missing password credential option"
        }
        val credential = VaultDatabase.getInstance(applicationContext)
            .autofillCredentialDao()
            .getById(credentialId)
            ?: throw IllegalStateException("Password credential not found")
        val targetHashes = credentialTargetHashes(applicationContext, request.callingAppInfo)
        require(targetHashes.isNotEmpty() && credential.matchesAnyDomainHash(targetHashes)) {
            "Password credential does not match the requesting app"
        }
        return credential
    }

    private fun authenticate(
        credential: AutofillCredentialEntity,
        request: ProviderGetCredentialRequest,
        envelope: AutofillCrypto.Envelope,
        cipher: javax.crypto.Cipher
    ) {
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        val authenticatedCipher = result.cryptoObject?.cipher
                            ?: return finishWithError("Biometric key was not authorized")
                        val payload = JSONObject(
                            AutofillCrypto.decryptPayload(envelope, authenticatedCipher)
                        )
                        val username = payload.optString("username", "")
                        val password = payload.getString("password")
                        val allowedIds = request.credentialOptions
                            .filterIsInstance<GetPasswordOption>()
                            .flatMap { it.allowedUserIds }
                            .toSet()
                        require(allowedIds.isEmpty() || username in allowedIds) {
                            "Password credential is not allowed by this request"
                        }
                        finishWithResponse(PasswordCredential(username, password))
                    } catch (error: Exception) {
                        finishWithError(error.message ?: "Password decryption failed")
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    setResult(Activity.RESULT_CANCELED)
                    finish()
                }
            }
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Fill from Authwell")
            .setSubtitle("Authenticate to use this password")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }

    private fun finishWithResponse(credential: PasswordCredential) {
        val resultIntent = Intent()
        PendingIntentHandler.setGetCredentialResponse(
            resultIntent,
            GetCredentialResponse(credential)
        )
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }

    private fun finishWithError(message: String) {
        setResult(Activity.RESULT_CANCELED, Intent().putExtra("error", message))
        finish()
    }

    companion object {
        const val EXTRA_CREDENTIAL_ID = "credential_id"
    }
}
