package dev.lockbox.app.autofill

import android.text.InputType

internal enum class AutofillFieldKind { USERNAME, PASSWORD, NEW_PASSWORD, ONE_TIME_CODE }

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
            declaredHints.any(::isOneTimeCodeToken) ||
            ONE_TIME_CODE_TOKENS.any(semanticText::contains)
        ) {
            return AutofillFieldKind.ONE_TIME_CODE
        }

        if (
            declaredHints.any(::isNewPasswordToken) ||
            NEW_PASSWORD_TOKENS.any(semanticText::contains) ||
            NEW_PASSWORD_COMPACT_TOKENS.any(semanticText.compactToken()::contains)
        ) {
            return AutofillFieldKind.NEW_PASSWORD
        }

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

    private fun isNewPasswordToken(value: String): Boolean {
        val compact = value.compactToken()
        return NEW_PASSWORD_TOKENS.any(value::contains) ||
            NEW_PASSWORD_COMPACT_TOKENS.any(compact::contains)
    }

    private fun isOneTimeCodeToken(value: String): Boolean =
        ONE_TIME_CODE_TOKENS.any(value::contains) || value.compactToken().contains("onetimecode")

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

    private fun String.compactToken(): String = filter(Char::isLetterOrDigit)

    private val PASSWORD_TOKENS = listOf(
        "current-password",
        "password",
        "passwd",
        "passcode"
    )
    private val NEW_PASSWORD_TOKENS = listOf(
        "new-password",
        "confirm-password",
        "password-confirmation",
        "repeat-password"
    )
    private val NEW_PASSWORD_COMPACT_TOKENS = listOf(
        "newpassword",
        "confirmpassword",
        "passwordconfirmation",
        "repeatpassword"
    )
    private val ONE_TIME_CODE_TOKENS = listOf(
        "one-time-code",
        "one_time_code",
        "verification-code",
        "verification_code",
        "totp",
        "otp"
    )
    private val USERNAME_TOKENS = listOf(
        "username",
        "user-name",
        "email",
        "login",
        "account"
    )
}
