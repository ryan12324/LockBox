package dev.lockbox.app.autofill

import org.junit.Assert.assertEquals
import org.junit.Test

class AutofillPresentationTest {

    @Test
    fun `credential label shows the selected username`() {
        assertEquals(
            "person@example.com",
            AutofillPresentation.credentialLabel("person@example.com")
        )
        assertEquals(
            "Fill person@example.com",
            AutofillPresentation.promptSubtitle("person@example.com")
        )
    }

    @Test
    fun `display username is single line bounded and has a safe fallback`() {
        assertEquals("person @example.com", AutofillPresentation.username(" person\n@example.com "))
        assertEquals(200, AutofillPresentation.username("x".repeat(250)).length)
        assertEquals("Authwell credential", AutofillPresentation.credentialLabel(" \n "))
        assertEquals(
            "Authenticate to fill this credential",
            AutofillPresentation.promptSubtitle("")
        )
    }
}
