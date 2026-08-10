package com.ryblimpiezas.operarios;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.Notification;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class BackgroundLocationService extends Service implements LocationListener {
    public static final String ACTION_START = "com.ryblimpiezas.operarios.START_TRACKING";
    public static final String ACTION_STOP = "com.ryblimpiezas.operarios.STOP_TRACKING";
    public static final String ACTION_CANCEL_AUTOMATION = "com.ryblimpiezas.operarios.CANCEL_AUTOMATION";
    private static final String CHANNEL_ID = "ryb_location_tracking";
    private static final String ALERT_CHANNEL_ID = "ryb_geofence_alerts_v2";
    private static final int NOTIFICATION_ID = 4107;
    private static final String PREFS = "ryb_background_location";
    private static final String KEY_RUNNING = "running";
    private static final String KEY_LOCATIONS = "locations";
    private static final String KEY_LAST_LOCATION = "last_location";
    private static final String KEY_LAST_GPS_LOCATION = "last_gps_location";
    private static final String KEY_GEOFENCE_CONFIG = "geofence_config";
    private static final String KEY_GEOFENCE_STATES = "geofence_states";
    private static final String KEY_GEOFENCE_EVENTS = "geofence_events";
    private static final String KEY_GEOFENCE_DIAGNOSTICS = "geofence_diagnostics";
    private static final int MAX_PENDING_LOCATIONS = 500;
    private static final int MAX_GEOFENCE_EVENTS = 50;
    private static final int MAX_DIAGNOSTIC_EVENTS = 100;
    private static final long AUTO_ACTION_GRACE_MS = 2 * 60_000;
    private static final long IGNORE_DURATION_MS = 25 * 60_000;
    private static final long GEOFENCE_TICK_MS = 15_000;
    private static final long MAX_LOCATION_AGE_MS = 2 * 60_000;
    private static volatile boolean serviceAlive = false;

    private LocationManager locationManager;
    private long intervalMs = 30_000;
    private Handler geofenceHandler;
    private JSONObject lastGeofenceLocation;
    private PowerManager.WakeLock transitionWakeLock;
    private final Runnable geofenceTick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            if (lastGeofenceLocation != null
                && now - lastGeofenceLocation.optLong("timestamp", 0) <= MAX_LOCATION_AGE_MS) {
                evaluateGeofences(lastGeofenceLocation, now);
            }
            if (geofenceHandler != null) {
                geofenceHandler.postDelayed(this, GEOFENCE_TICK_MS);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        serviceAlive = true;
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        geofenceHandler = new Handler(Looper.getMainLooper());
        lastGeofenceLocation = getLatestLocation(this);
        createNotificationChannel();
        geofenceHandler.postDelayed(geofenceTick, GEOFENCE_TICK_MS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            return START_NOT_STICKY;
        }

        if (intent != null && ACTION_CANCEL_AUTOMATION.equals(intent.getAction())) {
            cancelAutomation(intent.getStringExtra("serviceId"));
            return START_STICKY;
        }

        intervalMs = intent != null ? intent.getLongExtra("intervalMs", 30_000) : 30_000;
        startForeground(NOTIFICATION_ID, buildNotification());
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_RUNNING, true).apply();
        appendDiagnostic(this, "tracking_started", null, "intervalMs=" + intervalMs);
        requestUpdates();
        return START_STICKY;
    }

    private void requestUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            stopTracking();
            return;
        }
        try {
            locationManager.removeUpdates(this);
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                0f,
                this
            );
            locationManager.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                Math.max(intervalMs, 60_000),
                0f,
                this
            );
        } catch (IllegalArgumentException ignored) {
            // Algunos dispositivos no disponen de ambos proveedores.
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        JSONObject item = new JSONObject();
        try {
            item.put("latitude", location.getLatitude());
            item.put("longitude", location.getLongitude());
            item.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 999);
            item.put("speed", location.hasSpeed() ? location.getSpeed() : 0);
            item.put("heading", location.hasBearing() ? location.getBearing() : 0);
            item.put("timestamp", location.getTime());
            item.put("provider", location.getProvider());
            appendLocation(this, item);
            lastGeofenceLocation = item;
            evaluateGeofences(item, System.currentTimeMillis());
        } catch (JSONException ignored) {
        }
    }

    private NotificationCompat.Builder notificationBuilder() {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jornada y ubicación activas")
            .setContentText("RyB está detectando llegadas, salidas y kilómetros.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    private android.app.Notification buildNotification() {
        return notificationBuilder().build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Seguimiento durante la jornada",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Permite detectar llegadas, salidas y kilómetros durante la jornada.");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);

            NotificationChannel alertChannel = new NotificationChannel(
                ALERT_CHANNEL_ID,
                "Avisos de llegada y salida",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("Avisos sonoros antes de iniciar o finalizar servicios automáticamente.");
            alertChannel.enableVibration(true);
            alertChannel.setVibrationPattern(new long[] { 0, 500, 250, 500, 250, 800 });
            alertChannel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            getSystemService(NotificationManager.class).createNotificationChannel(alertChannel);
        }
    }

    private void evaluateGeofences(JSONObject location, long now) {
        if (location.optDouble("accuracy", 999) > 80) return;
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray configs;
        JSONObject states;
        try {
            configs = new JSONArray(prefs.getString(KEY_GEOFENCE_CONFIG, "[]"));
            states = new JSONObject(prefs.getString(KEY_GEOFENCE_STATES, "{}"));
        } catch (JSONException error) {
            return;
        }

        boolean hasPendingTransition = false;
        for (int i = 0; i < configs.length(); i++) {
            JSONObject config = configs.optJSONObject(i);
            if (config == null) continue;
            String serviceId = config.optString("serviceId", "");
            if (serviceId.isEmpty()) continue;
            JSONObject state = states.optJSONObject(serviceId);
            if (state == null) state = new JSONObject();
            if (state.optLong("ignoreUntil", 0) > now) continue;

            boolean active = config.optBoolean("active", false);
            double distance = distanceMeters(
                location.optDouble("latitude"), location.optDouble("longitude"),
                config.optDouble("latitude"), config.optDouble("longitude")
            );
            double radius = active
                ? config.optDouble("exitRadius", 100)
                : config.optDouble("entryRadius", 50);
            long confirmMs = active
                ? config.optLong("exitConfirmMs", 5 * 60_000)
                : config.optLong("entryConfirmMs", 2 * 60_000);
            boolean crossed = active ? distance > radius : distance <= radius;

            try {
                if (!crossed) {
                    if (state.optLong("firstDetectedAt", 0) > 0) {
                        appendDiagnostic(this, "transition_cancelled", serviceId,
                            "distance=" + Math.round(distance) + ",radius=" + Math.round(radius));
                    }
                    state.remove("firstDetectedAt");
                    state.remove("notifiedAt");
                    state.remove("queued");
                    getSystemService(NotificationManager.class).cancel(notificationId(serviceId));
                } else {
                    long firstDetectedAt = state.optLong("firstDetectedAt", 0);
                    if (firstDetectedAt == 0) {
                        firstDetectedAt = now;
                        state.put("firstDetectedAt", firstDetectedAt);
                        appendDiagnostic(this, active ? "exit_detected" : "entry_detected", serviceId,
                            "distance=" + Math.round(distance) + ",radius=" + Math.round(radius)
                                + ",confirmMs=" + confirmMs);
                    }
                    long elapsed = now - firstDetectedAt;
                    if (elapsed >= confirmMs && state.optLong("notifiedAt", 0) == 0) {
                        state.put("notifiedAt", now);
                        showGeofenceAlert(config, active, distance);
                        appendDiagnostic(this, active ? "exit_alerted" : "entry_alerted", serviceId,
                            "elapsedMs=" + elapsed);
                    }
                    if (elapsed >= confirmMs + AUTO_ACTION_GRACE_MS && !state.optBoolean("queued", false)) {
                        enqueueGeofenceEvent(config, location, active, firstDetectedAt, distance);
                        state.put("queued", true);
                        showAutomaticActionQueued(config, active);
                        appendDiagnostic(this, active ? "exit_queued" : "entry_queued", serviceId,
                            "elapsedMs=" + elapsed);
                    }
                    if (!state.optBoolean("queued", false)) hasPendingTransition = true;
                }
                states.put(serviceId, state);
            } catch (JSONException ignored) {
            }
        }
        prefs.edit().putString(KEY_GEOFENCE_STATES, states.toString()).apply();
        if (hasPendingTransition) {
            keepCpuAwakeForTransition();
        } else {
            releaseTransitionWakeLock();
        }
    }

    private void keepCpuAwakeForTransition() {
        if (transitionWakeLock == null) {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            transitionWakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "RyB:GeofenceTransition"
            );
            transitionWakeLock.setReferenceCounted(false);
        }
        if (!transitionWakeLock.isHeld()) {
            transitionWakeLock.acquire(15 * 60_000L);
        }
    }

    private void releaseTransitionWakeLock() {
        if (transitionWakeLock != null && transitionWakeLock.isHeld()) {
            transitionWakeLock.release();
        }
    }

    private void showGeofenceAlert(JSONObject config, boolean active, double distance) {
        String serviceId = config.optString("serviceId");
        String communityName = config.optString("communityName", "la comunidad");
        boolean autoCloseOnExit = config.optBoolean("autoCloseOnExit", false);
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent openPending = PendingIntent.getActivity(
            this, notificationId(serviceId), openIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        Intent cancelIntent = new Intent(this, BackgroundLocationService.class);
        cancelIntent.setAction(ACTION_CANCEL_AUTOMATION);
        cancelIntent.putExtra("serviceId", serviceId);
        PendingIntent cancelPending = PendingIntent.getService(
            this, notificationId(serviceId) + 1, cancelIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        String title = active ? "Parece que has salido de " + communityName : "Has llegado a " + communityName;
        String body = active
            ? (autoCloseOnExit
                ? "El servicio finalizará automáticamente en 2 minutos."
                : "Salida confirmada. Abre la aplicación para finalizar el servicio.")
            : "El servicio se iniciará automáticamente en 2 minutos.";
        Notification notification = new NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(title)
            .setContentText(body + " Distancia: " + Math.round(distance) + " m.")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body + " Pulsa para abrir la aplicación."))
            .setContentIntent(openPending)
            .addAction(0, "Abrir aplicación", openPending)
            .addAction(0, "Ignorar 25 min", cancelPending)
            .setAutoCancel(false)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)
            .build();
        getSystemService(NotificationManager.class).notify(notificationId(serviceId), notification);
    }

    private void showAutomaticActionQueued(JSONObject config, boolean active) {
        String serviceId = config.optString("serviceId");
        String name = config.optString("communityName", "la comunidad");
        boolean autoCloseOnExit = config.optBoolean("autoCloseOnExit", false);
        Notification notification = new NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(active ? "Salida confirmada" : "Llegada confirmada")
            .setContentText(active
                ? (autoCloseOnExit
                    ? "Se finalizará el servicio de " + name + " al sincronizar."
                    : "Abre la aplicación para finalizar el servicio de " + name + ".")
                : "Se iniciará el servicio de " + name + " al sincronizar.")
            .setAutoCancel(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build();
        getSystemService(NotificationManager.class).notify(automaticNotificationId(serviceId), notification);
    }

    private void cancelAutomation(String serviceId) {
        if (serviceId == null || serviceId.isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONObject states = new JSONObject(prefs.getString(KEY_GEOFENCE_STATES, "{}"));
            JSONObject state = states.optJSONObject(serviceId);
            if (state == null) state = new JSONObject();
            state.put("ignoreUntil", System.currentTimeMillis() + IGNORE_DURATION_MS);
            state.remove("firstDetectedAt");
            state.remove("notifiedAt");
            state.remove("queued");
            states.put(serviceId, state);
            prefs.edit().putString(KEY_GEOFENCE_STATES, states.toString()).apply();
            getSystemService(NotificationManager.class).cancel(notificationId(serviceId));
            getSystemService(NotificationManager.class).cancel(automaticNotificationId(serviceId));
            appendDiagnostic(this, "automation_ignored", serviceId, "durationMs=" + IGNORE_DURATION_MS);
            releaseTransitionWakeLock();
        } catch (JSONException ignored) {
        }
    }

    private synchronized void enqueueGeofenceEvent(JSONObject config, JSONObject location, boolean active, long detectedAt, double distance) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONArray events = new JSONArray(prefs.getString(KEY_GEOFENCE_EVENTS, "[]"));
            String eventId = (active ? "exit" : "entry") + "_"
                + config.optString("serviceId") + "_" + detectedAt;
            for (int i = 0; i < events.length(); i++) {
                JSONObject existing = events.optJSONObject(i);
                if (existing != null && eventId.equals(existing.optString("eventId"))) return;
            }
            JSONObject event = new JSONObject();
            event.put("eventId", eventId);
            event.put("type", active ? "exit" : "entry");
            event.put("serviceId", config.optString("serviceId"));
            event.put("communityName", config.optString("communityName"));
            event.put("detectedAt", detectedAt);
            event.put("latitude", location.optDouble("latitude"));
            event.put("longitude", location.optDouble("longitude"));
            event.put("accuracy", location.optDouble("accuracy", 999));
            event.put("speed", location.optDouble("speed", 0));
            event.put("timestamp", location.optLong("timestamp"));
            event.put("distance", distance);
            event.put("autoCloseOnExit", config.optBoolean("autoCloseOnExit", false));
            events.put(event);
            while (events.length() > MAX_GEOFENCE_EVENTS) events.remove(0);
            prefs.edit().putString(KEY_GEOFENCE_EVENTS, events.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    private static int notificationId(String serviceId) {
        return 5000 + Math.abs(serviceId.hashCode() % 100000);
    }

    private static int automaticNotificationId(String serviceId) {
        return 150000 + Math.abs(serviceId.hashCode() % 100000);
    }

    private static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        double earthRadius = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private void stopTracking() {
        if (locationManager != null) locationManager.removeUpdates(this);
        serviceAlive = false;
        appendDiagnostic(this, "tracking_stopped", null, null);
        releaseTransitionWakeLock();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_RUNNING, false).apply();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(this);
        serviceAlive = false;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_RUNNING, false).apply();
        if (geofenceHandler != null) geofenceHandler.removeCallbacks(geofenceTick);
        releaseTransitionWakeLock();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private static synchronized void appendLocation(Context context, JSONObject location) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray current;
        try {
            current = new JSONArray(prefs.getString(KEY_LOCATIONS, "[]"));
        } catch (JSONException error) {
            current = new JSONArray();
        }
        JSONArray trimmed = new JSONArray();
        int start = Math.max(0, current.length() - MAX_PENDING_LOCATIONS + 1);
        for (int i = start; i < current.length(); i++) trimmed.put(current.opt(i));
        trimmed.put(location);
        SharedPreferences.Editor editor = prefs.edit()
            .putString(KEY_LOCATIONS, trimmed.toString())
            .putString(KEY_LAST_LOCATION, location.toString());
        if ("gps".equals(location.optString("provider"))) {
            editor.putString(KEY_LAST_GPS_LOCATION, location.toString());
        }
        editor.apply();
    }

    private static synchronized void appendDiagnostic(
        Context context,
        String type,
        String serviceId,
        String detail
    ) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray current;
        try {
            current = new JSONArray(prefs.getString(KEY_GEOFENCE_DIAGNOSTICS, "[]"));
        } catch (JSONException error) {
            current = new JSONArray();
        }
        JSONObject item = new JSONObject();
        try {
            item.put("timestamp", System.currentTimeMillis());
            item.put("type", type);
            if (serviceId != null) item.put("serviceId", serviceId);
            if (detail != null) item.put("detail", detail);
            current.put(item);
            while (current.length() > MAX_DIAGNOSTIC_EVENTS) current.remove(0);
            prefs.edit().putString(KEY_GEOFENCE_DIAGNOSTICS, current.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    public static boolean isRunning(Context context) {
        return serviceAlive;
    }

    public static int getPendingCount(Context context) {
        try {
            return new JSONArray(context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(KEY_LOCATIONS, "[]")).length();
        } catch (JSONException error) {
            return 0;
        }
    }

    public static synchronized JSONObject getLatestLocation(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray locations = new JSONArray(prefs.getString(KEY_LOCATIONS, "[]"));
            JSONObject latest = parseStoredLocation(prefs.getString(KEY_LAST_LOCATION, null));
            JSONObject lastGps = parseStoredLocation(prefs.getString(KEY_LAST_GPS_LOCATION, null));
            JSONObject bestRecent = null;
            double bestAccuracy = Double.MAX_VALUE;
            long cutoff = System.currentTimeMillis() - 60_000;
            JSONObject[] savedCandidates = new JSONObject[] { latest, lastGps };
            for (JSONObject candidate : savedCandidates) {
                if (candidate == null || candidate.optLong("timestamp", 0) < cutoff) continue;
                double accuracy = candidate.optDouble("accuracy", 999);
                boolean gpsProvider = "gps".equals(candidate.optString("provider"));
                double score = accuracy + (gpsProvider ? 0 : 25);
                if (score < bestAccuracy) {
                    bestAccuracy = score;
                    bestRecent = candidate;
                }
            }
            for (int i = locations.length() - 1; i >= 0; i--) {
                JSONObject candidate = locations.optJSONObject(i);
                if (candidate == null || candidate.optLong("timestamp", 0) < cutoff) break;
                double accuracy = candidate.optDouble("accuracy", 999);
                boolean gpsProvider = "gps".equals(candidate.optString("provider"));
                double score = accuracy + (gpsProvider ? 0 : 25);
                if (score < bestAccuracy) {
                    bestAccuracy = score;
                    bestRecent = candidate;
                }
            }
            return bestRecent != null ? bestRecent : latest;
        } catch (JSONException error) {
            return null;
        }
    }

    private static JSONObject parseStoredLocation(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException error) {
            return null;
        }
    }

    public static synchronized JSONArray drainLocations(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray result;
        try {
            result = new JSONArray(prefs.getString(KEY_LOCATIONS, "[]"));
        } catch (JSONException error) {
            result = new JSONArray();
        }
        prefs.edit().putString(KEY_LOCATIONS, "[]").apply();
        return result;
    }

    public static synchronized void configureGeofences(Context context, JSONArray configs) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray nextConfigs = configs != null ? configs : new JSONArray();
        JSONObject nextStates = new JSONObject();
        String previousConfigRaw = prefs.getString(KEY_GEOFENCE_CONFIG, "[]");
        try {
            JSONArray previousConfigs = new JSONArray(previousConfigRaw);
            JSONObject previousStates = new JSONObject(prefs.getString(KEY_GEOFENCE_STATES, "{}"));

            for (int i = 0; i < nextConfigs.length(); i++) {
                JSONObject next = nextConfigs.optJSONObject(i);
                if (next == null) continue;
                String serviceId = next.optString("serviceId", "");
                if (serviceId.isEmpty()) continue;

                boolean sameDetectionMode = false;
                for (int j = 0; j < previousConfigs.length(); j++) {
                    JSONObject previous = previousConfigs.optJSONObject(j);
                    if (previous != null
                        && serviceId.equals(previous.optString("serviceId", ""))
                        && next.optBoolean("active", false) == previous.optBoolean("active", false)) {
                        sameDetectionMode = true;
                        break;
                    }
                }

                if (sameDetectionMode && previousStates.has(serviceId)) {
                    nextStates.put(serviceId, previousStates.optJSONObject(serviceId));
                } else {
                    NotificationManager manager = context.getSystemService(NotificationManager.class);
                    if (manager != null) manager.cancel(notificationId(serviceId));
                }
            }
        } catch (JSONException ignored) {
            nextStates = new JSONObject();
        }

        prefs.edit()
            .putString(KEY_GEOFENCE_CONFIG, nextConfigs.toString())
            .putString(KEY_GEOFENCE_STATES, nextStates.toString())
            .apply();
        if (!previousConfigRaw.equals(nextConfigs.toString())) {
            String mode = "empty";
            JSONObject first = nextConfigs.optJSONObject(0);
            if (first != null) mode = first.optBoolean("active", false) ? "exit" : "entry";
            appendDiagnostic(context, "geofence_configured",
                first != null ? first.optString("serviceId", null) : null,
                "count=" + nextConfigs.length() + ",mode=" + mode);
        }
    }

    /** Returns the durable outbox without removing it. Events are deleted only after server acknowledgement. */
    public static synchronized JSONArray drainGeofenceEvents(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONArray events = new JSONArray(prefs.getString(KEY_GEOFENCE_EVENTS, "[]"));
            boolean migrated = false;
            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.optJSONObject(i);
                if (event != null && event.optString("eventId", "").isEmpty()) {
                    event.put("eventId", event.optString("type", "event") + "_"
                        + event.optString("serviceId", "unknown") + "_"
                        + event.optLong("detectedAt", System.currentTimeMillis()));
                    migrated = true;
                }
            }
            if (migrated) {
                prefs.edit().putString(KEY_GEOFENCE_EVENTS, events.toString()).apply();
            }
            return events;
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    public static synchronized boolean acknowledgeGeofenceEvent(Context context, String eventId) {
        if (eventId == null || eventId.isEmpty()) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        try {
            JSONArray current = new JSONArray(prefs.getString(KEY_GEOFENCE_EVENTS, "[]"));
            JSONArray remaining = new JSONArray();
            JSONObject acknowledged = null;
            for (int i = 0; i < current.length(); i++) {
                JSONObject event = current.optJSONObject(i);
                if (event != null && eventId.equals(event.optString("eventId"))) {
                    acknowledged = event;
                } else if (event != null) {
                    remaining.put(event);
                }
            }
            if (acknowledged == null) return false;
            prefs.edit().putString(KEY_GEOFENCE_EVENTS, remaining.toString()).apply();
            String serviceId = acknowledged.optString("serviceId");
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.cancel(notificationId(serviceId));
                manager.cancel(automaticNotificationId(serviceId));
                String name = acknowledged.optString("communityName", "la comunidad");
                boolean exit = "exit".equals(acknowledged.optString("type"));
                Notification completed = new NotificationCompat.Builder(context, ALERT_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.checkbox_on_background)
                    .setContentTitle(exit ? "Servicio finalizado" : "Servicio iniciado")
                    .setContentText((exit ? "Finalización" : "Inicio")
                        + " automático confirmado en " + name + ".")
                    .setAutoCancel(true)
                    .setSilent(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .build();
                manager.notify(automaticNotificationId(serviceId), completed);
            }
            appendDiagnostic(context, "event_acknowledged", serviceId, "eventId=" + eventId);
            return true;
        } catch (JSONException error) {
            return false;
        }
    }

    public static synchronized JSONArray getGeofenceDiagnostics(Context context) {
        try {
            return new JSONArray(context.getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(KEY_GEOFENCE_DIAGNOSTICS, "[]"));
        } catch (JSONException error) {
            return new JSONArray();
        }
    }
}
