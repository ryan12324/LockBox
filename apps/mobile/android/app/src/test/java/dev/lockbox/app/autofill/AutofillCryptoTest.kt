package dev.lockbox.app.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertArrayEquals
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.spec.MGF1ParameterSpec
import javax.crypto.Cipher

class AutofillCryptoTest {

    @Test
    fun `OAEP parameters match across software encryption and Keystore decryption`() {
        val parameters = AutofillCrypto.oaepParameters()

        assertEquals("SHA-256", parameters.digestAlgorithm)
        assertEquals("MGF1", parameters.mgfAlgorithm)
        assertEquals("SHA-1", (parameters.mgfParameters as MGF1ParameterSpec).digestAlgorithm)
    }

    @Test
    fun `explicit OAEP parameters wrap and unwrap an index key`() {
        val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val indexKey = ByteArray(32) { it.toByte() }
        val encrypted = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            init(Cipher.ENCRYPT_MODE, keyPair.public, AutofillCrypto.oaepParameters())
            doFinal(indexKey)
        }
        val decrypted = Cipher.getInstance("RSA/ECB/OAEPPadding").run {
            init(Cipher.DECRYPT_MODE, keyPair.private, AutofillCrypto.oaepParameters())
            doFinal(encrypted)
        }

        assertArrayEquals(indexKey, decrypted)
    }
}
