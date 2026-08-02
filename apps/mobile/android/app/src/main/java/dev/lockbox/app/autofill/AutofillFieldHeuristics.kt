package dev.lockbox.app.autofill

import android.text.InputType

internal enum class AutofillFieldKind { USERNAME, PASSWORD }

/** Conservative fallback field detection for apps that omit Android AutoFill hints. */
internal object AutofillFieldHeuristics {
    fun classify(
        autofillHints: Array<out String>?,
        htmlType: String?,
        htmlName: String?,
        htmlAutocomplete: String?,
        idEntry: String?,
        hint: String?,
        inputType: Int
    ): AutofillFieldKind? {
        val declaredHints = autofillHints.orEmpty().map(String::lowercase)
        val semanticText = listOfNotNull(
            htmlType,
            htmlName,
            htmlAutocomplete,
            idEntry,
            hint
        ).joinToString(" ").lowercase()

        if (
            declaredHints.any(::isPasswordToken) ||
            isPasswordInputType(inputType) ||
            PASSWORD_TOKENS.any(semanticText::contains)
        ) {
            return AutofillFieldKind.PASSWORD
        }

        if (
            declaredHints.any(::isUsernameToken) ||
            isEmailInputType(inputType) ||
            USERNAME_TOKENS.any(semanticText::contains)
        ) {
            return AutofillFieldKind.USERNAME
        }

        return null
    }

    private fun isPasswordToken(value: String): Boolean =
        PASSWORD_TOKENS.any(value::contains)

    private fun isUsernameToken(value: String): Boolean =
        USERNAME_TOKENS.any(value::contains)

    private fun isPasswordInputType(inputType: Int): Boolean {
        if (inputType and InputType.TYPE_MASK_CLASS != InputType.TYPE_CLASS_TEXT) return false
        return when (inputType and InputType.TYPE_MASK_VARIATION) {
            InputType.TYPE_TEXT_VARIATION_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD -> true
            else -> false
        }
    }

    private fun isEmailInputType(inputType: Int): Boolean =
        inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT &&
            inputType and InputType.TYPE_MASK_VARIATION == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS

    private val PASSWORD_TOKENS = listOf(
        "current-password",
        "new-password",
        "password",
        "passwd",
        "passcode"
    )
    private val USERNAME_TOKENS = listOf(
        "username",
        "user-name",
        "email",
        "login",
        "account"
    )
}
