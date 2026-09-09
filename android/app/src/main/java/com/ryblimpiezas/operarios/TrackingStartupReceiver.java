package com.ryblimpiezas.operarios;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;

/** Reactiva el seguimiento que el operario dejó habilitado tras reiniciar o actualizar. */
public class TrackingStartupReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent receivedIntent) {
        if (!BackgroundLocationService.shouldRemainEnabled(context)) return;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                != PackageManager.PERMISSION_GRANTED) return;

        Intent serviceIntent = new Intent(context, BackgroundLocationService.class);
        serviceIntent.setAction(BackgroundLocationService.ACTION_START);
        serviceIntent.putExtra("intervalMs", BackgroundLocationService.getStoredIntervalMs(context));
        try {
            ContextCompat.startForegroundService(context, serviceIntent);
        } catch (RuntimeException ignored) {
            // Android puede aplazar el arranque si el usuario ha restringido la batería.
            // MainActivity vuelve a intentarlo al abrir la aplicación.
        }
    }
}
