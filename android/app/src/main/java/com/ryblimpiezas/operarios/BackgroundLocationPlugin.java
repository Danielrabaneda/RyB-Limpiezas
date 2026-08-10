package com.ryblimpiezas.operarios;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "BackgroundLocation",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION
        }),
        @Permission(alias = "notifications", strings = {
            Manifest.permission.POST_NOTIFICATIONS
        })
    }
)
public class BackgroundLocationPlugin extends Plugin {
    private PluginCall pendingStartCall;

    @PluginMethod
    public void requestTrackingPermissions(PluginCall call) {
        requestPermissionForAliases(
            Build.VERSION.SDK_INT >= 33
                ? new String[] { "location", "notifications" }
                : new String[] { "location" },
            call,
            "permissionsCallback"
        );
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", getPermissionState("location").toString());
        result.put("notifications", Build.VERSION.SDK_INT >= 33
            ? getPermissionState("notifications").toString()
            : "granted");
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            pendingStartCall = call;
            requestPermissionForAlias("location", call, "startAfterPermission");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            call.reject("Se necesita permiso de ubicación precisa para iniciar el seguimiento.");
            pendingStartCall = null;
            return;
        }
        startService(call);
        pendingStartCall = null;
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundLocationService.class);
        intent.setAction(BackgroundLocationService.ACTION_START);
        intent.putExtra("intervalMs", Math.max(15_000, call.getInt("intervalMs", 30_000)));
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("started", true);
        result.put("backgroundPermissionRequired",
            Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                != PackageManager.PERMISSION_GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundLocationService.class);
        intent.setAction(BackgroundLocationService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        LocationManager locationManager =
            (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
        JSObject result = new JSObject();
        result.put("running", BackgroundLocationService.isRunning(getContext()));
        result.put("locationServicesEnabled",
            locationManager != null && LocationManagerCompat.isLocationEnabled(locationManager));
        result.put("backgroundPermissionGranted",
            Build.VERSION.SDK_INT < 29 ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED);
        result.put("pendingCount", BackgroundLocationService.getPendingCount(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getLatestLocation(PluginCall call) {
        JSONObject location = BackgroundLocationService.getLatestLocation(getContext());
        JSObject result = new JSObject();
        if (location != null) result.put("location", location);
        call.resolve(result);
    }

    @PluginMethod
    public void drainLocations(PluginCall call) {
        JSONArray stored = BackgroundLocationService.drainLocations(getContext());
        JSArray locations = new JSArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item != null) locations.put(item);
        }
        JSObject result = new JSObject();
        result.put("locations", locations);
        call.resolve(result);
    }

    @PluginMethod
    public void configureGeofences(PluginCall call) {
        JSArray configs = call.getArray("services", new JSArray());
        BackgroundLocationService.configureGeofences(getContext(), configs);
        call.resolve();
    }

    @PluginMethod
    public void drainGeofenceEvents(PluginCall call) {
        JSONArray stored = BackgroundLocationService.drainGeofenceEvents(getContext());
        JSArray events = new JSArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item != null) events.put(item);
        }
        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }

    @PluginMethod
    public void acknowledgeGeofenceEvent(PluginCall call) {
        String eventId = call.getString("eventId", "");
        JSObject result = new JSObject();
        result.put("acknowledged",
            BackgroundLocationService.acknowledgeGeofenceEvent(getContext(), eventId));
        call.resolve(result);
    }

    @PluginMethod
    public void getGeofenceDiagnostics(PluginCall call) {
        JSONArray stored = BackgroundLocationService.getGeofenceDiagnostics(getContext());
        JSArray diagnostics = new JSArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item != null) diagnostics.put(item);
        }
        JSObject result = new JSObject();
        result.put("diagnostics", diagnostics);
        call.resolve(result);
    }
}
