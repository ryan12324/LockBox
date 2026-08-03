package dev.lockbox.app.autofill

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dev.lockbox.app.credentialprovider.PasskeyAccountState
import dev.lockbox.app.storage.VaultDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.time.Instant

/** Seeds one deterministic credential into debug builds for emulator AutoFill tests. */
class AutofillE2eSeedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SEED && intent.action != ACTION_RESET) return

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (intent.action == ACTION_RESET) {
                    AutofillE2eHooks.configure(context, false)
                    val database = VaultDatabase.getInstance(context)
                    database.autofillCredentialDao().deleteAll()
                    database.pendingAutofillSaveDao().deleteAll()
                    PasskeyAccountState.clear(context)
                    AutofillDiagnostics.clearIndex(context)
                    pendingResult.resultData = "reset=1"
                    Log.i(TAG, "Reset the Android AutoFill E2E fixture")
                } else {
                    val scenario = intent.getStringExtra(EXTRA_SCENARIO) ?: "standard"
                    val fixture = AutofillE2eHooks.fixtureFor(scenario)
                    AutofillE2eHooks.configure(context, true, scenario)
                    val hashes = JSONArray(
                        listOf(
                            AutofillCrypto.hashIdentifier(context, "localhost"),
                            AutofillCrypto.hashIdentifier(context, context.packageName)
                        )
                    ).toString()
                    val credential = AutofillCredentialEntity(
                        id = AutofillE2eHooks.TEST_CREDENTIAL_ID,
                        domainHashes = hashes,
                        displayUsername = fixture.username,
                        // The debug hook returns the fixed dummy payload before this is parsed.
                        encryptedData = "debug-e2e-fixture",
                        updatedAt = Instant.now().toString()
                    )
                    val database = VaultDatabase.getInstance(context)
                    database.pendingAutofillSaveDao().deleteAll()
                    database.autofillCredentialDao().replaceAll(listOf(credential))
                    PasskeyAccountState.set(context, TEST_ACCOUNT_ID)
                    AutofillDiagnostics.recordIndex(context, 1)
                    pendingResult.resultData = "seeded=$scenario"
                    Log.i(TAG, "Seeded the Android AutoFill E2E credential for $scenario")
                }
                pendingResult.resultCode = Activity.RESULT_OK
            } catch (error: Exception) {
                pendingResult.resultCode = Activity.RESULT_CANCELED
                pendingResult.resultData = error.javaClass.simpleName
                Log.e(TAG, "Could not seed the Android AutoFill E2E credential", error)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_SEED = "dev.lockbox.app.debug.SEED_AUTOFILL_E2E"
        const val ACTION_RESET = "dev.lockbox.app.debug.RESET_AUTOFILL_E2E"
        const val EXTRA_SCENARIO = "scenario"
        private const val TEST_ACCOUNT_ID = "android-autofill-e2e-account"
        private const val TAG = "AuthwellAutofillE2E"
    }
}
