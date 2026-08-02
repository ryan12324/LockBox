import Capacitor
import Foundation
import LocalAuthentication

@objc(BiometricPlugin)
final class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BiometricPlugin"
    let jsName = "Biometric"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEnrolled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enrollBiometric", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unenroll", returnType: CAPPluginReturnPromise),
    ]

    @objc func checkAvailability(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            error: &error
        )
        let type: String
        if !available {
            type = "none"
        } else {
            switch context.biometryType {
            case .faceID: type = "face"
            case .touchID: type = "fingerprint"
            default: type = "none"
            }
        }
        call.resolve(["available": available, "biometryType": type])
    }

    @objc func isEnrolled(_ call: CAPPluginCall) {
        guard let scope = validatedScope(call) else { return }
        do {
            let status = try BiometricVault.status(scope: scope)
            call.resolve([
                "enrolled": status.enrolled,
                "replacementRequired": status.replacementRequired,
            ])
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func enrollBiometric(_ call: CAPPluginCall) {
        guard let scope = validatedScope(call) else { return }
        guard
            let encoded = call.getString("userKey"),
            let userKey = Data(base64Encoded: encoded),
            userKey.count == 64,
            userKey.base64EncodedString() == encoded
        else {
            call.reject("userKey must be canonical Base64 for a 64-byte vault key")
            return
        }
        let context = LAContext()
        context.localizedReason = "Enable biometric unlock for Authwell"
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: context.localizedReason
        ) { success, error in
            guard success else {
                call.reject("Biometric enrollment was cancelled", nil, error)
                return
            }
            do {
                try BiometricVault.store(userKey: userKey, scope: scope, context: context)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let scope = validatedScope(call) else { return }
        do {
            let status = try BiometricVault.status(scope: scope)
            guard status.enrolled else {
                call.resolve([
                    "success": false,
                    "fallbackReason": status.replacementRequired
                        ? "accountMismatch"
                        : "credentialUnavailable",
                ])
                return
            }
        } catch {
            call.reject(error.localizedDescription, nil, error)
            return
        }
        let context = LAContext()
        let reason = call.getString("reason")?.trimmingCharacters(in: .whitespacesAndNewlines)
        context.localizedReason = reason?.isEmpty == false ? reason! : "Unlock Authwell"
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: context.localizedReason
        ) { success, _ in
            guard success else {
                call.resolve(["success": false, "fallbackReason": "cancelled"])
                return
            }
            do {
                let userKey = try BiometricVault.load(scope: scope, context: context)
                call.resolve([
                    "success": true,
                    "userKey": userKey.base64EncodedString(),
                ])
            } catch {
                call.resolve([
                    "success": false,
                    "fallbackReason": "biometricsChanged",
                ])
            }
        }
    }

    @objc func unenroll(_ call: CAPPluginCall) {
        do {
            try BiometricVault.remove()
            call.resolve()
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    private func validatedScope(_ call: CAPPluginCall) -> String? {
        guard
            let scope = call.getString("scope")?.trimmingCharacters(in: .whitespacesAndNewlines),
            !scope.isEmpty,
            scope.count <= 2_048,
            !scope.contains("\0")
        else {
            call.reject("scope is required")
            return nil
        }
        return scope
    }
}
