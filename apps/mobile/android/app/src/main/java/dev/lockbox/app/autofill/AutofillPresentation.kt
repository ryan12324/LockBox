package dev.lockbox.app.autofill

/** Sanitizes the device-local username shown by Android before authentication. */
internal object AutofillPresentation {
    private const val MAX_DISPLAY_USERNAME_LENGTH = 200
    private val whitespace = Regex("\\s+")

    fun username(value: String): String = value
        .replace(whitespace, " ")
        .trim()
        .take(MAX_DISPLAY_USERNAME_LENGTH)

    fun credentialLabel(value: String): String =
        username(value).ifBlank { "Authwell credential" }

    fun promptSubtitle(value: String): String = username(value)
        .takeIf { it.isNotBlank() }
        ?.let { "Fill $it" }
        ?: "Authenticate to fill this credential"
}
