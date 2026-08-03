package dev.lockbox.app.autofill

import android.text.InputType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AutofillFieldHeuristicsTest {
    @Test
    fun `recognizes explicit Android autofill hints`() {
        assertEquals(
            AutofillFieldKind.USERNAME,
            classify(hints = arrayOf("username"))
        )
        assertEquals(
            AutofillFieldKind.PASSWORD,
            classify(hints = arrayOf("password"))
        )
    }

    @Test
    fun `recognizes native input variations without autofill hints`() {
        assertEquals(
            AutofillFieldKind.USERNAME,
            classify(inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        )
        assertEquals(
            AutofillFieldKind.PASSWORD,
            classify(inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        )
    }

    @Test
    fun `recognizes browser autocomplete and field names`() {
        assertEquals(
            AutofillFieldKind.USERNAME,
            classify(htmlAutocomplete = "username")
        )
        assertEquals(
            AutofillFieldKind.PASSWORD,
            classify(htmlAutocomplete = "current-password")
        )
        assertEquals(
            AutofillFieldKind.NEW_PASSWORD,
            classify(htmlAutocomplete = "new-password")
        )
        assertEquals(
            AutofillFieldKind.NEW_PASSWORD,
            classify(htmlName = "confirmPassword", inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        )
        assertEquals(
            AutofillFieldKind.USERNAME,
            classify(idEntry = "accountEmailInput")
        )
    }

    @Test
    fun `does not guess unrelated text fields`() {
        assertNull(classify(idEntry = "searchQuery", hint = "Search"))
    }

    @Test
    fun `never treats one time codes as saved passwords`() {
        assertEquals(
            AutofillFieldKind.ONE_TIME_CODE,
            classify(
                htmlAutocomplete = "one-time-code",
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            )
        )
        assertEquals(
            AutofillFieldKind.ONE_TIME_CODE,
            classify(idEntry = "totpCode", hint = "Verification code")
        )
    }

    private fun classify(
        hints: Array<String>? = null,
        htmlAutocomplete: String? = null,
        htmlName: String? = null,
        idEntry: String? = null,
        hint: String? = null,
        inputType: Int = InputType.TYPE_CLASS_TEXT
    ) = AutofillFieldHeuristics.classify(
        autofillHints = hints,
        htmlType = null,
        htmlName = htmlName,
        htmlAutocomplete = htmlAutocomplete,
        idEntry = idEntry,
        hint = hint,
        inputType = inputType
    )
}
