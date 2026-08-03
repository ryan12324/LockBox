import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var privacyShield: UIVisualEffectView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = AuthwellBridgeViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        guard let window, privacyShield == nil else { return }
        let shield = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        shield.frame = window.bounds
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(shield)
        privacyShield = shield
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        privacyShield?.removeFromSuperview()
        privacyShield = nil
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if let scheme = url.scheme?.lowercased(),
           scheme == "otpauth" || scheme == "otpauth-migration" {
            do {
                _ = try NativeCredentialCapture.captureTotpSetup(url: url)
            } catch {
                // Capacitor still receives the URL so the unlocked app can show
                // a useful validation or sign-in message without persisting it.
            }
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
