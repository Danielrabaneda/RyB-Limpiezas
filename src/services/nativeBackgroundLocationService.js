import { Capacitor, registerPlugin } from "@capacitor/core";

const BackgroundLocation = registerPlugin("BackgroundLocation");

export function isNativeLocationAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function requestNativeTrackingPermissions() {
  if (!isNativeLocationAvailable()) return null;
  return BackgroundLocation.requestTrackingPermissions();
}

export async function startNativeLocationTracking(options = {}) {
  if (!isNativeLocationAvailable()) return { started: false };
  return BackgroundLocation.start({
    intervalMs: options.intervalMs || 30_000,
  });
}

export async function stopNativeLocationTracking() {
  if (!isNativeLocationAvailable()) return;
  await BackgroundLocation.stop();
}

export async function getNativeLocationStatus() {
  if (!isNativeLocationAvailable()) return { running: false, pendingCount: 0 };
  return BackgroundLocation.getStatus();
}

export async function openNativeLocationSettings() {
  if (!isNativeLocationAvailable()) return;
  await BackgroundLocation.openLocationSettings();
}

export async function openNativeAppSettings() {
  if (!isNativeLocationAvailable()) return;
  await BackgroundLocation.openAppSettings();
}

export async function openNativeBatterySettings() {
  if (!isNativeLocationAvailable()) return;
  await BackgroundLocation.openBatterySettings();
}

export async function getLatestNativeLocation() {
  if (!isNativeLocationAvailable()) return null;
  const { location = null } = await BackgroundLocation.getLatestLocation();
  if (!location) return null;
  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracy: location.accuracy,
    speed: location.speed,
    timestamp: location.timestamp,
    provider: location.provider,
  };
}

export async function drainNativeLocations(onPosition) {
  if (!isNativeLocationAvailable()) return 0;
  const { locations = [] } = await BackgroundLocation.drainLocations();
  for (const location of locations) {
    await onPosition({
      coords: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        speed: location.speed,
        heading: location.heading,
        altitude: null,
        altitudeAccuracy: null,
      },
      timestamp: location.timestamp,
      nativeProvider: location.provider,
    });
  }
  return locations.length;
}

export async function configureNativeGeofences(services = []) {
  if (!isNativeLocationAvailable()) return;
  await BackgroundLocation.configureGeofences({ services });
}

export async function drainNativeGeofenceEvents(onEvent) {
  if (!isNativeLocationAvailable()) return 0;
  const { events = [] } = await BackgroundLocation.drainGeofenceEvents();
  let acknowledged = 0;
  for (const event of events) {
    await onEvent(event);
    const result = await BackgroundLocation.acknowledgeGeofenceEvent({
      eventId: event.eventId,
    });
    if (result?.acknowledged) acknowledged += 1;
  }
  return acknowledged;
}

export async function getNativeGeofenceDiagnostics() {
  if (!isNativeLocationAvailable()) return [];
  const { diagnostics = [] } =
    await BackgroundLocation.getGeofenceDiagnostics();
  return diagnostics;
}
