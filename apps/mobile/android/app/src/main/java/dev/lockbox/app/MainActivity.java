package dev.lockbox.app;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

import dev.lockbox.app.biometric.BiometricPlugin;
import dev.lockbox.app.autofill.AutofillPlugin;
import dev.lockbox.app.storage.StoragePlugin;
import dev.lockbox.app.credentialprovider.CredentialManagerPlugin;
import dev.lockbox.app.foldable.FoldableLayoutPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(BiometricPlugin.class);
        registerPlugin(AutofillPlugin.class);
        registerPlugin(StoragePlugin.class);
        registerPlugin(CredentialManagerPlugin.class);
        registerPlugin(FoldableLayoutPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
