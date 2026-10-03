package com.ryblimpiezas.operarios;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BackgroundLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!BackgroundLocationService.shouldRemainEnabled(this)
            || BackgroundLocationService.isRunning(this)
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    != PackageManager.PERMISSION_GRANTED)) {
            return;
        }
        Intent intent = new Intent(this, BackgroundLocationService.class);
        intent.setAction(BackgroundLocationService.ACTION_START);
        intent.putExtra("intervalMs", BackgroundLocationService.getStoredIntervalMs(this));
        ContextCompat.startForegroundService(this, intent);
    }
}
