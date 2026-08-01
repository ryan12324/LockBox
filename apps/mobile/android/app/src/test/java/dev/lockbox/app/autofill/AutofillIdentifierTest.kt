package dev.lockbox.app.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AutofillIdentifierTest {
    private val octopusPackage = "android.octopusenergy.octopus.energy"

    @Test
    fun `canonical app URI matches the requesting Android package`() {
        assertEquals(
            octopusPackage,
            AutofillIdentifier.extract("androidapp://$octopusPackage")
        )
        assertEquals(octopusPackage, AutofillIdentifier.extract(octopusPackage))
    }

    @Test
    fun `HTTPS-shaped package URI remains compatible with existing entries`() {
        assertEquals(
            octopusPackage,
            AutofillIdentifier.extract("https://$octopusPackage/")
        )
    }

    @Test
    fun `malformed or unsafe application identifiers are rejected`() {
        assertNull(AutofillIdentifier.extract("androidapp://octopusenergy"))
        assertNull(AutofillIdentifier.extract("androidapp://$octopusPackage/path"))
        assertNull(AutofillIdentifier.extract("androidapp://$octopusPackage?account=other"))
        assertNull(AutofillIdentifier.extract("http://$octopusPackage"))
    }
}
