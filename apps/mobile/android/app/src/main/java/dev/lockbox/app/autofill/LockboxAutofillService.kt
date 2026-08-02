package dev.lockbox.app.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import androidx.room.withTransaction
import dev.lockbox.app.R
import dev.lockbox.app.credentialprovider.PasskeyAccountState
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

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
        if (fields.usernameId == null && fields.passwordId == null && fields.newPasswordId == null) {
            AutofillDiagnostics.recordRequest(applicationContext, 0)
            callback.onSuccess(null)
            return
        }

        val identifier = fields.webDomain ?: fields.packageName ?: run {
            AutofillDiagnostics.recordRequest(applicationContext, 0)
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

                if (cancellationSignal.isCanceled) {
                    AutofillDiagnostics.recordRequest(applicationContext, 0)
                    callback.onSuccess(null)
                    return@launch
                }

                val response = FillResponse.Builder()
                credentials.forEachIndexed { index, credential ->
                    response.addDataset(buildAuthenticationDataset(credential, fields, index))
                }
                val saveInfo = if (PasskeyAccountState.get(applicationContext) != null) {
                    buildSaveInfo(fields)
                } else null
                saveInfo?.let(response::setSaveInfo)
                AutofillDiagnostics.recordRequest(applicationContext, credentials.size)
                callback.onSuccess(
                    if (credentials.isNotEmpty() || saveInfo != null) response.build()
                    else null
                )
            } catch (error: Exception) {
                AutofillDiagnostics.recordFailure(
                    applicationContext,
                    "Android could not read the encrypted login index"
                )
                callback.onFailure("Authwell could not load autofill credentials")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        if (request.fillContexts.isEmpty()) {
            callback.onFailure("Authwell could not read the login form")
            return
        }
        val fields = parseStructures(request.fillContexts.map { it.structure })
        val identifier = fields.webDomain ?: fields.packageName
        val normalizedIdentifier = identifier?.let(AutofillIdentifier::extract)
        val password = fields.newPasswordValue ?: fields.passwordValue
        if (
            normalizedIdentifier == null ||
            password.isNullOrEmpty() ||
            password.length > MAX_PASSWORD_LENGTH ||
            fields.usernameValue.length > MAX_USERNAME_LENGTH
        ) {
            callback.onFailure("Authwell could not validate the login form")
            return
        }
        val accountId = PasskeyAccountState.get(applicationContext) ?: run {
            callback.onFailure("Unlock Authwell before saving a login")
            return
        }

        serviceScope.launch {
            try {
                val id = UUID.randomUUID().toString()
                val now = Instant.now().toString()
                val uri = if (fields.webDomain != null) {
                    "https://$normalizedIdentifier"
                } else {
                    "androidapp://$normalizedIdentifier"
                }
                val payload = JSONObject()
                    .put("name", getCredentialName(fields, normalizedIdentifier))
                    .put("username", fields.usernameValue)
                    .put("password", password)
                    .put("uri", uri)
                    .toString()
                val autofillEncryptedData = AutofillCrypto.encrypt(
                    AutofillCrypto.ensureKeyPair(applicationContext).public,
                    payload
                )
                val encryptedData = PendingSaveCrypto.encrypt(applicationContext, payload)
                val domainHashes = JSONArray()
                    .put(AutofillCrypto.hashIdentifier(applicationContext, normalizedIdentifier))
                    .toString()
                val pending = PendingAutofillSaveEntity(
                    id = id,
                    accountId = accountId,
                    domainHashes = domainHashes,
                    encryptedData = encryptedData,
                    autofillEncryptedData = autofillEncryptedData,
                    createdAt = now
                )
                val indexed = AutofillCredentialEntity(
                    id = id,
                    domainHashes = domainHashes,
                    encryptedData = autofillEncryptedData,
                    updatedAt = now
                )
                val database = VaultDatabase.getInstance(applicationContext)
                database.withTransaction {
                    val pendingDao = database.pendingAutofillSaveDao()
                    val credentialDao = database.autofillCredentialDao()
                    val existing = pendingDao.getByAccount(accountId)
                    val overflow = existing.take(
                        (existing.size - MAX_PENDING_SAVES + 1).coerceAtLeast(0)
                    )
                    overflow.forEach { expired ->
                        pendingDao.deleteByIdAndAccount(expired.id, accountId)
                        credentialDao.deleteById(expired.id)
                    }
                    pendingDao.insert(pending)
                    credentialDao.insertAll(listOf(indexed))
                }
                callback.onSuccess()
            } catch (_: Exception) {
                callback.onFailure("Authwell could not protect the saved login")
            }
        }
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

    private fun buildSaveInfo(fields: ParsedAutofillFields): SaveInfo? {
        val passwordId = fields.newPasswordId ?: fields.passwordId
        if (passwordId == null) {
            val usernameId = fields.usernameId ?: return null
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
            return SaveInfo.Builder(
                SaveInfo.SAVE_DATA_TYPE_USERNAME,
                arrayOf(usernameId)
            ).apply {
                setFlags(SaveInfo.FLAG_DELAY_SAVE)
                setDescription("Continue signing in to save this login to Authwell")
            }.build()
        }

        val saveType = SaveInfo.SAVE_DATA_TYPE_PASSWORD or
            if (fields.usernameId != null) SaveInfo.SAVE_DATA_TYPE_USERNAME else 0
        return SaveInfo.Builder(
            saveType,
            arrayOf(passwordId)
        ).apply {
            fields.usernameId?.let { setOptionalIds(arrayOf(it)) }
            setDescription("Save this login to Authwell")
        }.build()
    }

    private fun getCredentialName(
        fields: ParsedAutofillFields,
        normalizedIdentifier: String
    ): String {
        if (fields.webDomain != null) return normalizedIdentifier
        val targetPackage = fields.packageName ?: return normalizedIdentifier
        return runCatching {
            val info = packageManager.getApplicationInfo(targetPackage, 0)
            packageManager.getApplicationLabel(info).toString()
        }.getOrDefault(normalizedIdentifier).take(MAX_NAME_LENGTH)
    }

    private fun parseStructure(structure: AssistStructure): ParsedAutofillFields {
        return parseStructures(listOf(structure))
    }

    private fun parseStructures(structures: List<AssistStructure>): ParsedAutofillFields {
        val result = ParsedAutofillFields()
        structures.forEach { structure ->
            if (result.packageName == null) {
                result.packageName = structure.activityComponent?.packageName
            }
            for (windowIndex in 0 until structure.windowNodeCount) {
                traverseNode(structure.getWindowNodeAt(windowIndex).rootViewNode, result)
            }
        }
        return result
    }

    private fun traverseNode(node: AssistStructure.ViewNode, result: ParsedAutofillFields) {
        if (result.webDomain == null) result.webDomain = node.webDomain
        if (result.packageName == null) result.packageName = node.idPackage

        val autofillId = node.autofillId
        if (autofillId != null) {
            val attributes = node.htmlInfo?.attributes
            val inputType = attributes?.find { it.first.equals("type", true) }?.second
            val name = attributes?.find { it.first.equals("name", true) }?.second.orEmpty()
            val autocomplete = attributes
                ?.find { it.first.equals("autocomplete", true) }
                ?.second
            when (
                AutofillFieldHeuristics.classify(
                    autofillHints = node.autofillHints,
                    htmlType = inputType,
                    htmlName = name,
                    htmlAutocomplete = autocomplete,
                    idEntry = node.idEntry,
                    hint = node.hint?.toString(),
                    inputType = node.inputType
                )
            ) {
                AutofillFieldKind.USERNAME -> if (result.usernameId == null) {
                    result.usernameId = autofillId
                    result.usernameValue = node.textValue()
                }
                AutofillFieldKind.PASSWORD -> if (result.passwordId == null) {
                    result.passwordId = autofillId
                    result.passwordValue = node.textValue()
                }
                AutofillFieldKind.NEW_PASSWORD -> if (result.newPasswordId == null) {
                    result.newPasswordId = autofillId
                    result.newPasswordValue = node.textValue()
                }
                null -> Unit
            }
        }

        for (childIndex in 0 until node.childCount) {
            traverseNode(node.getChildAt(childIndex), result)
        }
    }

    companion object {
        private const val AUTH_REQUEST_CODE_BASE = 4_000
        private const val MAX_PENDING_SAVES = 50
        private const val MAX_NAME_LENGTH = 500
        private const val MAX_USERNAME_LENGTH = 10_000
        private const val MAX_PASSWORD_LENGTH = 100_000
    }

    private fun AssistStructure.ViewNode.textValue(): String =
        autofillValue?.takeIf { it.isText }?.textValue?.toString()
            ?: text?.toString()
            ?: ""
}

data class ParsedAutofillFields(
    var usernameId: AutofillId? = null,
    var passwordId: AutofillId? = null,
    var newPasswordId: AutofillId? = null,
    var usernameValue: String = "",
    var passwordValue: String? = null,
    var newPasswordValue: String? = null,
    var webDomain: String? = null,
    var packageName: String? = null
)
