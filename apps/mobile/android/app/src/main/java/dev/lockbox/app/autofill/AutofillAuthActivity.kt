package dev.lockbox.app.autofill

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.service.autofill.Dataset
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import dev.lockbox.app.R
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Authenticates and returns one decrypted Dataset to Android Autofill. */
class AutofillAuthActivity : FragmentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        val credentialId = intent.getStringExtra(EXTRA_CREDENTIAL_ID) ?: return cancel()
        activityScope.launch {
            try {
                val credential = VaultDatabase.getInstance(applicationContext)
                    .autofillCredentialDao()
                    .getById(credentialId) ?: return@launch withContext(Dispatchers.Main) { cancel() }
                val privateKey = AutofillCrypto.getPrivateKey()
                    ?: return@launch withContext(Dispatchers.Main) { cancel() }
                val envelope = AutofillCrypto.parseEnvelope(credential.encryptedData)
                val cipher = AutofillCrypto.createUnwrapCipher(privateKey)
                withContext(Dispatchers.Main) { authenticate(envelope, cipher) }
            } catch (_: Exception) {
                withContext(Dispatchers.Main) { cancel() }
            }
        }
    }

    override fun onDestroy() {
        activityScope.cancel()
        super.onDestroy()
    }

    private fun authenticate(
        envelope: AutofillCrypto.Envelope,
        cipher: javax.crypto.Cipher
    ) {
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        val authenticatedCipher = result.cryptoObject?.cipher ?: return cancel()
                        val payload = JSONObject(
                            AutofillCrypto.decryptPayload(envelope, authenticatedCipher)
                        )
                        returnDataset(
                            payload.optString("name", "Authwell credential"),
                            payload.optString("username", ""),
                            payload.getString("password")
                        )
                    } catch (_: Exception) {
                        cancel()
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    cancel()
                }
            }
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Authwell")
            .setSubtitle("Authenticate to fill this credential")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }

    private fun returnDataset(name: String, username: String, password: String) {
        val presentation = RemoteViews(packageName, R.layout.autofill_item).apply {
            setTextViewText(R.id.autofill_item_label, name)
            setTextViewText(R.id.autofill_item_sublabel, username)
        }
        val dataset = Dataset.Builder(presentation).apply {
            intent.parcelableAutofillId(EXTRA_USERNAME_ID)?.let {
                setValue(it, AutofillValue.forText(username), presentation)
            }
            intent.parcelableAutofillId(EXTRA_PASSWORD_ID)?.let {
                setValue(it, AutofillValue.forText(password), presentation)
            }
        }.build()
        setResult(
            Activity.RESULT_OK,
            Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset)
        )
        finish()
    }

    private fun Intent.parcelableAutofillId(key: String): AutofillId? {
        @Suppress("DEPRECATION")
        return getParcelableExtra(key) as? AutofillId
    }

    private fun cancel() {
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    companion object {
        const val EXTRA_CREDENTIAL_ID = "credentialId"
        const val EXTRA_USERNAME_ID = "usernameAutofillId"
        const val EXTRA_PASSWORD_ID = "passwordAutofillId"
    }
}
