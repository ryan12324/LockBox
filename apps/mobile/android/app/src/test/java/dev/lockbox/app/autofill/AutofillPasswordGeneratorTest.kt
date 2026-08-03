package dev.lockbox.app.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutofillPasswordGeneratorTest {
    @Test
    fun `strong passwords contain every required character class`() {
        val password = AutofillPasswordGenerator.generate(20, includeSymbols = true)
        assertEquals(20, password.length)
        assertTrue(password.any(Char::isUpperCase))
        assertTrue(password.any(Char::isLowerCase))
        assertTrue(password.any(Char::isDigit))
        assertTrue(password.any { !it.isLetterOrDigit() })
    }

    @Test
    fun `compatible passwords omit symbols`() {
        val password = AutofillPasswordGenerator.generate(20, includeSymbols = false)
        assertEquals(20, password.length)
        assertTrue(password.all(Char::isLetterOrDigit))
    }

    @Test
    fun `suggestions honor field length constraints`() {
        val constrained = AutofillPasswordGenerator.suggestions(minLength = 12, maxLength = 24)
        assertEquals(listOf("strong", "compatible"), constrained.map { it.id })
        assertTrue(constrained.all { it.password.length == 20 })
        assertFalse(constrained.any { it.password.length > 24 })

        assertTrue(
            AutofillPasswordGenerator.suggestions(minLength = 12, maxLength = 7).isEmpty()
        )
    }
}
