package dev.lockbox.app.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import dev.lockbox.app.R
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray

/**
 * Android Autofill Framework service backed by a biometric-gated local index.
 * Matching uses exact salted domain/package hashes. Selecting a dataset launches
 * AutofillAuthActivity, which authenticates the user and decrypts that one entry.
 */
class LockboxAutofillService : AutofillService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onSuccess(null)
            return
        }
        val fields = parseStructure(structure)
        if (fields.usernameId == null && fields.passwordId == null) {
            callback.onSuccess(null)
            return
        }

        val identifier = fields.webDomain ?: fields.packageName ?: run {
            callback.onSuccess(null)
            return
        }

        serviceScope.launch {
            try {
                val targetHash = AutofillCrypto.hashIdentifier(applicationContext, identifier)
                val credentials = VaultDatabase.getInstance(applicationContext)
                    .autofillCredentialDao()
                    .getAll()
                    .filter { credential ->
                        val hashes = JSONArray(credential.domainHashes)
                        (0 until hashes.length()).any { hashes.optString(it) == targetHash }
                    }

                if (cancellationSignal.isCanceled || credentials.isEmpty()) {
                    callback.onSuccess(null)
                    return@launch
                }

                val response = FillResponse.Builder()
                credentials.forEachIndexed { index, credential ->
                    response.addDataset(buildAuthenticationDataset(credential, fields, index))
                }
                callback.onSuccess(response.build())
            } catch (error: Exception) {
                callback.onFailure("Authwell could not load autofill credentials")
            }
        }
    }

    /** Saving is intentionally not advertised until the main vault can confirm it. */
    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onSuccess()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun buildAuthenticationDataset(
        credential: AutofillCredentialEntity,
        fields: ParsedAutofillFields,
        index: Int
    ): Dataset {
        val presentation = RemoteViews(packageName, R.layout.autofill_item).apply {
            setTextViewText(R.id.autofill_item_label, "Unlock Authwell credential")
            setTextViewText(R.id.autofill_item_sublabel, "Authentication required")
        }

        val intent = Intent(applicationContext, AutofillAuthActivity::class.java).apply {
            putExtra(AutofillAuthActivity.EXTRA_CREDENTIAL_ID, credential.id)
            fields.usernameId?.let { putExtra(AutofillAuthActivity.EXTRA_USERNAME_ID, it) }
            fields.passwordId?.let { putExtra(AutofillAuthActivity.EXTRA_PASSWORD_ID, it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            AUTH_REQUEST_CODE_BASE xor credential.id.hashCode() xor index,
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_CANCEL_CURRENT
        )

        return Dataset.Builder(presentation).apply {
            setAuthentication(pendingIntent.intentSender)
            fields.usernameId?.let { setValue(it, null, presentation) }
            fields.passwordId?.let { setValue(it, null, presentation) }
        }.build()
    }

    private fun parseStructure(structure: AssistStructure): ParsedAutofillFields {
        val result = ParsedAutofillFields()
        for (windowIndex in 0 until structure.windowNodeCount) {
            traverseNode(structure.getWindowNodeAt(windowIndex).rootViewNode, result)
        }
        return result
    }

    private fun traverseNode(node: AssistStructure.ViewNode, result: ParsedAutofillFields) {
        if (result.webDomain == null) result.webDomain = node.webDomain
        if (result.packageName == null) result.packageName = node.idPackage

        val autofillId = node.autofillId
        if (autofillId != null) {
            node.autofillHints?.forEach { hint ->
                when {
                    result.usernameId == null &&
                        (hint.contains("username", true) || hint.contains("email", true)) ->
                        result.usernameId = autofillId
                    result.passwordId == null && hint.contains("password", true) ->
                        result.passwordId = autofillId
                }
            }

            val attributes = node.htmlInfo?.attributes
            val inputType = attributes?.find { it.first.equals("type", true) }?.second
            val name = attributes?.find { it.first.equals("name", true) }?.second.orEmpty()
            if (
                result.usernameId == null &&
                (inputType == "email" || inputType == "text") &&
                listOf("user", "email", "login").any { name.contains(it, true) }
            ) {
                result.usernameId = autofillId
            }
            if (result.passwordId == null && inputType == "password") {
                result.passwordId = autofillId
            }
        }

        for (childIndex in 0 until node.childCount) {
            traverseNode(node.getChildAt(childIndex), result)
        }
    }

    companion object {
        private const val AUTH_REQUEST_CODE_BASE = 4_000
    }
}

data class ParsedAutofillFields(
    var usernameId: AutofillId? = null,
    var passwordId: AutofillId? = null,
    var webDomain: String? = null,
    var packageName: String? = null
)
