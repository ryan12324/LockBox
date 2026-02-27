package dev.lockbox.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.lockbox.app.biometric.BiometricPlugin;
import dev.lockbox.app.qrscanner.QRScannerPlugin;
import dev.lockbox.app.autofill.AutofillPlugin;
import dev.lockbox.app.storage.StoragePlugin;
import dev.lockbox.app.credentialprovider.CredentialManagerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricPlugin.class);
        registerPlugin(QRScannerPlugin.class);
        registerPlugin(AutofillPlugin.class);
        registerPlugin(StoragePlugin.class);
        registerPlugin(CredentialManagerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
