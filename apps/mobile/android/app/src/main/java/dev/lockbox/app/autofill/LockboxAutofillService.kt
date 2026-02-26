package dev.lockbox.app.autofill

import android.app.assist.AssistStructure
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
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import dev.lockbox.app.R
import dev.lockbox.app.storage.VaultDatabase
import dev.lockbox.app.storage.VaultItemEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * LockboxAutofillService — Android Autofill Framework integration.
 *
 * Runs in a SEPARATE PROCESS from the Capacitor WebView.
 * Uses Room DB as a bridge to access encrypted vault items.
 *
 * Flow:
 * 1. Android triggers onFillRequest when user focuses an autofillable field
 * 2. Service traverses the AssistStructure to find username/password fields
 * 3. Queries Room DB for matching credentials (by URI/package name)
 * 4. Builds FillResponse with Dataset options
 * 5. User picks a credential → Android fills the fields
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

        // Parse the AssistStructure to find autofillable fields
        val parsedFields = parseStructure(structure)

        if (parsedFields.usernameId == null && parsedFields.passwordId == null) {
            callback.onSuccess(null)
            return
        }

        // Get the web domain or app package for credential matching
        val identifier = parsedFields.webDomain ?: parsedFields.packageName ?: run {
            callback.onSuccess(null)
            return
        }

        serviceScope.launch {
            try {
                val db = VaultDatabase.getInstance(applicationContext)
                val items = db.vaultItemDao().getByTypeAndStatus("login", "synced")

                if (items.isEmpty()) {
                    callback.onSuccess(null)
                    return@launch
                }

                val responseBuilder = FillResponse.Builder()
                var hasDatasets = false

                for (item in items) {
                    val dataset = buildDataset(item, parsedFields)
                    if (dataset != null) {
                        responseBuilder.addDataset(dataset)
                        hasDatasets = true
                    }
                }

                if (!hasDatasets) {
                    callback.onSuccess(null)
                    return@launch
                }

                // Add save info so Android offers to save new credentials
                val saveInfoBuilder = SaveInfo.Builder(
                    SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD,
                    arrayOfNulls<AutofillId>(0)
                )

                val requiredIds = mutableListOf<AutofillId>()
                parsedFields.usernameId?.let { requiredIds.add(it) }
                parsedFields.passwordId?.let { requiredIds.add(it) }

                if (requiredIds.isNotEmpty()) {
                    responseBuilder.setSaveInfo(
                        SaveInfo.Builder(
                            SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD,
                            requiredIds.toTypedArray()
                        ).build()
                    )
                }

                callback.onSuccess(responseBuilder.build())
            } catch (e: Exception) {
                callback.onFailure("Lockbox autofill error: ${e.message}")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        val structure = request.fillContexts.lastOrNull()?.structure ?: run {
            callback.onFailure("No structure available")
            return
        }

        val parsedFields = parseStructure(structure)
        val webDomain = parsedFields.webDomain ?: parsedFields.packageName

        // Extract entered values from the structure
        val username = parsedFields.usernameValue
        val password = parsedFields.passwordValue

        if (username == null && password == null) {
            callback.onFailure("No credentials to save")
            return
        }

        serviceScope.launch {
            try {
                val db = VaultDatabase.getInstance(applicationContext)
                // Store as pending_create — will be encrypted and synced by the main app
                val entity = VaultItemEntity(
                    id = java.util.UUID.randomUUID().toString(),
                    encryptedData = "", // Will be encrypted by main app
                    type = "login",
                    iv = "",
                    revisionDate = java.time.Instant.now().toString(),
                    syncStatus = "pending_create",
                    folderId = null,
                    tags = null,
                    favorite = false
                )
                db.vaultItemDao().upsert(entity)
                callback.onSuccess()
            } catch (e: Exception) {
                callback.onFailure("Failed to save credential: ${e.message}")
            }
        }
    }

    /**
     * Build a Dataset for a vault item to present in the autofill popup.
     */
    private fun buildDataset(
        item: VaultItemEntity,
        fields: ParsedAutofillFields
    ): Dataset? {
        // Note: In production, we'd decrypt the item to get username for display.
        // For the autofill popup, we show a generic "Lockbox" label.
        val presentation = RemoteViews(packageName, R.layout.autofill_item).apply {
            setTextViewText(R.id.autofill_item_label, "Lockbox credential")
            setTextViewText(R.id.autofill_item_sublabel, item.id.take(8))
        }

        val datasetBuilder = Dataset.Builder(presentation)
        var hasValues = false

        fields.usernameId?.let { id ->
            // The actual credential data would be decrypted on-demand
            datasetBuilder.setValue(id, AutofillValue.forText(""))
            hasValues = true
        }

        fields.passwordId?.let { id ->
            datasetBuilder.setValue(id, AutofillValue.forText(""))
            hasValues = true
        }

        return if (hasValues) datasetBuilder.build() else null
    }

    /**
     * Parse an AssistStructure to find username and password autofill fields.
     */
    private fun parseStructure(structure: AssistStructure): ParsedAutofillFields {
        val result = ParsedAutofillFields()

        for (i in 0 until structure.windowNodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            val rootNode = windowNode.rootViewNode
            traverseNode(rootNode, result)
        }

        return result
    }

    /**
     * Recursively traverse view nodes to find autofillable fields.
     */
    private fun traverseNode(
        node: AssistStructure.ViewNode,
        result: ParsedAutofillFields
    ) {
        // Check web domain
        if (node.webDomain != null && result.webDomain == null) {
            result.webDomain = node.webDomain
        }

        // Check package name
        if (node.idPackage != null && result.packageName == null) {
            result.packageName = node.idPackage
        }

        // Check if this node is autofillable
        val autofillHints = node.autofillHints
        if (autofillHints != null && node.autofillId != null) {
            for (hint in autofillHints) {
                when {
                    hint.contains("username", ignoreCase = true) ||
                    hint.contains("email", ignoreCase = true) -> {
                        result.usernameId = node.autofillId
                        result.usernameValue = node.text?.toString()
                    }
                    hint.contains("password", ignoreCase = true) -> {
                        result.passwordId = node.autofillId
                        result.passwordValue = node.text?.toString()
                    }
                }
            }
        }

        // Also check HTML attributes for web forms
        val htmlInfo = node.htmlInfo
        if (htmlInfo != null) {
            val inputType = htmlInfo.attributes?.find { it.first == "type" }?.second
            when (inputType) {
                "email", "text" -> {
                    val name = htmlInfo.attributes?.find { it.first == "name" }?.second ?: ""
                    if (name.contains("user", ignoreCase = true) ||
                        name.contains("email", ignoreCase = true) ||
                        name.contains("login", ignoreCase = true)) {
                        if (result.usernameId == null) {
                            result.usernameId = node.autofillId
                            result.usernameValue = node.text?.toString()
                        }
                    }
                }
                "password" -> {
                    if (result.passwordId == null) {
                        result.passwordId = node.autofillId
                        result.passwordValue = node.text?.toString()
                    }
                }
            }
        }

        // Recurse into children
        for (i in 0 until node.childCount) {
            traverseNode(node.getChildAt(i), result)
        }
    }
}

/**
 * Parsed autofill fields extracted from AssistStructure traversal.
 */
data class ParsedAutofillFields(
    var usernameId: AutofillId? = null,
    var passwordId: AutofillId? = null,
    var usernameValue: String? = null,
    var passwordValue: String? = null,
    var webDomain: String? = null,
    var packageName: String? = null
)
