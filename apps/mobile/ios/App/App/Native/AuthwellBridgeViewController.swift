import Capacitor
import UIKit

@objc(AuthwellBridgeViewController)
final class AuthwellBridgeViewController: CAPBridgeViewController {
    private let captureShield: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.backgroundColor = .systemBackground
        view.isHidden = true

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Authwell is hidden while the screen is being captured."
        label.textAlignment = .center
        label.numberOfLines = 0
        label.textColor = .secondaryLabel
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32),
        ])
        return view
    }()

    override func capacitorDidLoad() {
        bridge?.registerPluginType(StoragePlugin.self)
        bridge?.registerPluginType(BiometricPlugin.self)
        bridge?.registerPluginType(AutofillPlugin.self)
        bridge?.registerPluginType(CredentialManagerPlugin.self)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.addSubview(captureShield)
        NSLayoutConstraint.activate([
            captureShield.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            captureShield.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            captureShield.topAnchor.constraint(equalTo: view.topAnchor),
            captureShield.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateCaptureShield),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
        updateCaptureShield()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func updateCaptureShield() {
        captureShield.isHidden = !UIScreen.main.isCaptured
        if !captureShield.isHidden { view.bringSubviewToFront(captureShield) }
    }
}
