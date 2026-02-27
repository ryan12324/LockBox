package dev.lockbox.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.lockbox.app.biometric.BiometricPlugin;
import dev.lockbox.app.qrscanner.QRScannerPlugin;
import dev.lockbox.app.autofill.AutofillPlugin;
import dev.lockbox.app.storage.StoragePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricPlugin.class);
        registerPlugin(QRScannerPlugin.class);
        registerPlugin(AutofillPlugin.class);
        registerPlugin(StoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
