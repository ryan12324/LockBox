package dev.lockbox.app.fido2

import android.os.Build
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * Fido2Plugin — Capacitor bridge for FIDO2 hardware key operations.
 *
 * Targets cross-platform authenticators (USB/NFC/BLE security keys)
 * via Android Credential Manager. Distinct from CredentialManagerPlugin
 * which handles platform passkeys (device-bound, biometric-gated).
 *
 * Requires Android 14+ (API 34). Gracefully degrades via isAvailable().
 */
@CapacitorPlugin(name = "Fido2")
class Fido2Plugin : Plugin() {

    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        call.resolve(result)
    }

    /**
     * Register a new FIDO2 hardware key (authenticatorAttachment: cross-platform).
     * Returns keyId, publicKey, and attestation as base64url strings.
     */
    @PluginMethod
    fun register(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("FIDO2 hardware keys require Android 14+")
            return
        }

        val userId = call.getString("userId") ?: run {
            call.reject("userId is required")
            return
        }
        val email = call.getString("email") ?: run {
            call.reject("email is required")
            return
        }
        val rpId = call.getString("rpId") ?: run {
            call.reject("rpId is required")
            return
        }
        val rpName = call.getString("rpName") ?: rpId

        pluginScope.launch {
            try {
                val credentialManager = androidx.credentials.CredentialManager.create(context)

                val challengeBytes = ByteArray(32)
                java.security.SecureRandom().nextBytes(challengeBytes)

                val requestJson = JSONObject().apply {
                    put("rp", JSONObject().apply {
                        put("id", rpId)
                        put("name", rpName)
                    })
                    put("user", JSONObject().apply {
                        put("id", base64urlEncode(userId.toByteArray(Charsets.UTF_8)))
                        put("name", email)
                        put("displayName", email)
                    })
                    put("challenge", base64urlEncode(challengeBytes))
                    put("pubKeyCredParams", JSONArray().apply {
                        put(JSONObject().apply {
                            put("type", "public-key")
                            put("alg", -7)
                        })
                    })
                    put("authenticatorSelection", JSONObject().apply {
                        put("authenticatorAttachment", "cross-platform")
                        put("residentKey", "discouraged")
                        put("userVerification", "discouraged")
                    })
                    put("attestation", "direct")
                    put("timeout", 120000)
                    // Request PRF extension support detection
                    put("extensions", JSONObject().apply {
                        put("prf", JSONObject())
                    })
                }.toString()

                val createRequest = androidx.credentials.CreatePublicKeyCredentialRequest(requestJson)
                val result = credentialManager.createCredential(activity, createRequest)

                val responseJson = JSONObject(
                    (result as androidx.credentials.CreatePublicKeyCredentialResponse)
                        .registrationResponseJson
                )
                val response = responseJson.getJSONObject("response")

                // Extract PRF support from clientExtensionResults
                val prfEnabled = responseJson.optJSONObject("clientExtensionResults")
                    ?.optJSONObject("prf")
                    ?.optBoolean("enabled", false) ?: false

                val resultObj = JSObject()
                resultObj.put("keyId", responseJson.getString("id"))
                resultObj.put("attestation", response.getString("attestationObject"))
                resultObj.put("publicKey", if (response.has("publicKey")) response.getString("publicKey") else "")
                resultObj.put("prfEnabled", prfEnabled)

                call.resolve(resultObj)
            } catch (e: androidx.credentials.exceptions.CreateCredentialException) {
                call.reject("Hardware key registration failed: ${e.type}: ${e.message}")
            } catch (e: Exception) {
                call.reject("Hardware key registration failed: ${e.message}")
            }
        }
    }

    /**
     * Authenticate (sign challenge) with a FIDO2 hardware key.
     * Returns signature, authenticatorData, and clientDataJSON as base64url strings.
     */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("FIDO2 hardware keys require Android 14+")
            return
        }

        val challenge = call.getString("challenge") ?: run {
            call.reject("challenge is required")
            return
        }
        val rpId = call.getString("rpId") ?: run {
            call.reject("rpId is required")
            return
        }

        val prfSalt = call.getString("prfSalt")

        pluginScope.launch {
            try {
                val credentialManager = androidx.credentials.CredentialManager.create(context)

                val requestJson = JSONObject().apply {
                    put("rpId", rpId)
                    put("challenge", challenge)
                    put("userVerification", "discouraged")
                    put("timeout", 120000)

                    val allowCredentials = call.getArray("allowCredentials")
                    if (allowCredentials != null && allowCredentials.length() > 0) {
                        val credArray = JSONArray()
                        for (i in 0 until allowCredentials.length()) {
                            val cred = allowCredentials.getJSONObject(i)
                            credArray.put(JSONObject().apply {
                                put("type", cred.optString("type", "public-key"))
                                put("id", cred.getString("id"))
                                put("transports", JSONArray().apply {
                                    put("usb")
                                    put("nfc")
                                    put("ble")
                                })
                            })
                        }
                        put("allowCredentials", credArray)
                    }

                    if (prfSalt != null) {
                        put("extensions", JSONObject().apply {
                            put("prf", JSONObject().apply {
                                put("eval", JSONObject().apply {
                                    put("first", prfSalt)
                                })
                            })
                        })
                    }
                }.toString()

                val getRequest = androidx.credentials.GetCredentialRequest.Builder()
                    .addCredentialOption(
                        androidx.credentials.GetPublicKeyCredentialOption(requestJson)
                    )
                    .build()

                val result = credentialManager.getCredential(activity, getRequest)

                val credential = result.credential as? androidx.credentials.PublicKeyCredential
                    ?: throw IllegalStateException("Unexpected credential type returned")

                val responseJson = JSONObject(credential.authenticationResponseJson)
                val response = responseJson.getJSONObject("response")

                val resultObj = JSObject()
                resultObj.put("signature", response.getString("signature"))
                resultObj.put("authenticatorData", response.getString("authenticatorData"))
                resultObj.put("clientDataJSON", response.getString("clientDataJSON"))

                val prfResults = responseJson.optJSONObject("clientExtensionResults")
                    ?.optJSONObject("prf")
                    ?.optJSONObject("results")
                if (prfResults != null && prfResults.has("first")) {
                    resultObj.put("prfOutput", prfResults.getString("first"))
                }

                call.resolve(resultObj)
            } catch (e: androidx.credentials.exceptions.GetCredentialException) {
                call.reject("Hardware key authentication failed: ${e.type}: ${e.message}")
            } catch (e: Exception) {
                call.reject("Hardware key authentication failed: ${e.message}")
            }
        }
    }

    private fun base64urlEncode(data: ByteArray): String {
        return Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }
}
