package dev.lockbox.app.autofill

import android.annotation.SuppressLint
import android.content.Context
import org.json.JSONObject

/** Fixed dummy payload exposed only inside debug APKs for the emulator E2E suite. */
object AutofillE2eHooks {
    const val TEST_CREDENTIAL_ID = "android-autofill-e2e"
    private const val PREFS_NAME = "authwell_autofill_e2e"
    private const val ENABLED = "enabled"
    private const val SCENARIO = "scenario"

    data class Fixture(val username: String, val password: String)

    @JvmStatic
    fun payloadFor(context: Context, credentialId: String): String? {
        if (credentialId != TEST_CREDENTIAL_ID) return null
        if (!context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(ENABLED, false)
        ) {
            return null
        }
        val scenario = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(SCENARIO, "standard")
            .orEmpty()
        val fixture = fixtureFor(scenario)
        return JSONObject()
            .put("name", "Authwell Android E2E")
            .put("username", fixture.username)
            .put("password", fixture.password)
            .toString()
    }

    @SuppressLint("ApplySharedPref")
    fun configure(context: Context, enabled: Boolean, scenario: String = "standard") {
        fixtureFor(scenario)
        check(
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(ENABLED, enabled)
                .putString(SCENARIO, scenario)
                .commit()
        ) { "Could not update the AutoFill E2E hook" }
    }

    fun fixtureFor(scenario: String): Fixture = when (scenario) {
        "phone" -> Fixture("+44 7700 900123", "Authwell-E2E-4827!")
        "pin" -> Fixture("account-4827", "482701")
        "fallback" -> Fixture("fallback.account@example.test", "Authwell-E2E-4827!")
        "password-only" -> Fixture("demo.account@example.test", "Authwell-E2E-4827!")
        "standard", "email", "signup", "password-change", "multi-step", "dynamic",
        "one-time-code", "sso-only" -> Fixture(
            "autofill.e2e@example.test",
            "Authwell-E2E-4827!"
        )
        else -> throw IllegalArgumentException("Unknown AutoFill E2E scenario")
    }
}
