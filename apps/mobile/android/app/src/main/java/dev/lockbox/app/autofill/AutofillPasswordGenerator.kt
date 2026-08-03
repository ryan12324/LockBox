package dev.lockbox.app.autofill

import java.security.SecureRandom

internal data class GeneratedPasswordSuggestion(
    val id: String,
    val label: String,
    val description: String,
    val password: String
)

/** Creates signup secrets in memory with Android's cryptographic RNG. */
internal object AutofillPasswordGenerator {
    private const val DEFAULT_LENGTH = 20
    private const val LONG_LENGTH = 32
    private const val MIN_LENGTH = 8
    private const val MAX_LENGTH = 128
    private const val UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    private const val LOWERCASE = "abcdefghijklmnopqrstuvwxyz"
    private const val DIGITS = "0123456789"
    private const val SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?"
    private val secureRandom = SecureRandom()

    fun suggestions(minLength: Int = 0, maxLength: Int = 0): List<GeneratedPasswordSuggestion> {
        val minimum = maxOf(MIN_LENGTH, minLength)
        val maximum = if (maxLength > 0) minOf(MAX_LENGTH, maxLength) else MAX_LENGTH
        if (minimum > maximum) return emptyList()

        val preferredLength = DEFAULT_LENGTH.coerceIn(minimum, maximum)
        val results = mutableListOf(
            GeneratedPasswordSuggestion(
                id = "strong",
                label = "Use a strong password",
                description = "$preferredLength characters with symbols",
                password = generate(preferredLength, includeSymbols = true)
            ),
            GeneratedPasswordSuggestion(
                id = "compatible",
                label = "Use letters and numbers",
                description = "$preferredLength characters without symbols",
                password = generate(preferredLength, includeSymbols = false)
            )
        )
        if (maximum >= LONG_LENGTH && preferredLength < LONG_LENGTH) {
            results += GeneratedPasswordSuggestion(
                id = "long",
                label = "Use a longer password",
                description = "$LONG_LENGTH characters with symbols",
                password = generate(LONG_LENGTH, includeSymbols = true)
            )
        }
        return results
    }

    fun generate(length: Int, includeSymbols: Boolean): String {
        require(length in MIN_LENGTH..MAX_LENGTH) { "Password length is out of range" }
        val requiredPools = buildList {
            add(UPPERCASE)
            add(LOWERCASE)
            add(DIGITS)
            if (includeSymbols) add(SYMBOLS)
        }
        val pool = requiredPools.joinToString("")
        val characters = CharArray(length)
        requiredPools.forEachIndexed { index, required ->
            characters[index] = required[secureRandom.nextInt(required.length)]
        }
        for (index in requiredPools.size until characters.size) {
            characters[index] = pool[secureRandom.nextInt(pool.length)]
        }
        for (index in characters.lastIndex downTo 1) {
            val swapIndex = secureRandom.nextInt(index + 1)
            val value = characters[index]
            characters[index] = characters[swapIndex]
            characters[swapIndex] = value
        }
        return characters.concatToString()
    }
}
