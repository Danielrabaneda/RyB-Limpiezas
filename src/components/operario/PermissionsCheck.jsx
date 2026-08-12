import { useState, useEffect } from "react";
import { requestNotificationPermission } from "../../utils/geolocation";
import { registerForPushNotifications } from "../../services/fcmService";
import { useAuth } from "../../contexts/AuthContext";
import { useTenant } from "../../contexts/TenantContext";
import {
  getNativeLocationStatus,
  isNativeLocationAvailable,
  openNativeAppSettings,
  openNativeBatterySettings,
  openNativeLocationSettings,
  requestNativeTrackingPermissions,
  startNativeLocationTracking,
} from "../../services/nativeBackgroundLocationService";

export default function PermissionsCheck() {
  const { userProfile } = useAuth();
  const { companyId } = useTenant();
  const [showModal, setShowModal] = useState(false);
  const [status, setStatus] = useState("pending"); // 'pending', 'loading', 'granted', 'error'
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [needsLocationSettings, setNeedsLocationSettings] = useState(false);
  const [needsBackgroundSettings, setNeedsBackgroundSettings] = useState(false);
  const [needsBatterySettings, setNeedsBatterySettings] = useState(false);

  // Detectar si es iOS en navegador (no instalado como PWA)
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream;
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone);

  useEffect(() => {
    const checkNativeProtection = async () => {
      const permissionsChecked = sessionStorage.getItem("permissions_checked");
      if (!isNativeLocationAvailable()) {
        if (!permissionsChecked) setShowModal(true);
        return;
      }
      try {
        const nativeStatus = await getNativeLocationStatus();
        const needsProtection =
          nativeStatus?.fineLocationPermissionGranted === false ||
          nativeStatus?.locationServicesEnabled === false ||
          nativeStatus?.backgroundPermissionGranted === false ||
          nativeStatus?.batteryOptimizationDisabled === false ||
          nativeStatus?.running === false;
        if (!permissionsChecked || needsProtection) setShowModal(true);
      } catch (error) {
        console.warn("[Permissions] No se pudo comprobar la protección nativa:", error);
        if (!permissionsChecked) setShowModal(true);
      }
    };
    checkNativeProtection();
  }, []);

  const requestPermissions = async (openSettingsAutomatically = true) => {
    setStatus("loading");
    setErrorMessage("");
    setInfoMessage("");

    let gpsSuccess = false;

    // 1. Pedir Ubicación GPS (Obligatorio para la app)
    try {
      if (isNativeLocationAvailable()) {
        const nativeStatus = await getNativeLocationStatus();
        if (nativeStatus?.locationServicesEnabled === false) {
          setNeedsLocationSettings(true);
          setNeedsBackgroundSettings(false);
          setNeedsBatterySettings(false);
          setErrorMessage(
            "La ubicación del teléfono está desactivada. Actívala en los ajustes para continuar.",
          );
          setStatus("error");
          if (openSettingsAutomatically) await openNativeLocationSettings();
          return;
        }

        setNeedsLocationSettings(false);
        const permissionResult = await requestNativeTrackingPermissions();
        if (permissionResult?.location !== "granted") {
          const permissionError = new Error(
            "Debes permitir la ubicación precisa para utilizar el GPS de la aplicación.",
          );
          permissionError.code = 1;
          throw permissionError;
        }

        const protectedStatus = await getNativeLocationStatus();
        if (protectedStatus?.backgroundPermissionGranted === false) {
          setNeedsBackgroundSettings(true);
          setNeedsBatterySettings(false);
          setErrorMessage(
            "Para seguir funcionando con la pantalla apagada, abre Permisos > Ubicación y selecciona ‘Permitir siempre’.",
          );
          setStatus("error");
          if (openSettingsAutomatically) await openNativeAppSettings();
          return;
        }

        setNeedsBackgroundSettings(false);
        if (protectedStatus?.batteryOptimizationDisabled === false) {
          setNeedsBatterySettings(true);
          setErrorMessage(
            "Permite que LimpiaGest funcione sin restricciones de batería para evitar que Android detenga el GPS.",
          );
          setStatus("error");
          if (openSettingsAutomatically) await openNativeBatterySettings();
          return;
        }

        setNeedsBatterySettings(false);
        await startNativeLocationTracking({ intervalMs: 30_000 });
      } else {
        await new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(
              new Error("La geolocalización no está soportada en tu navegador."),
            );
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
          );
        });
      }
      gpsSuccess = true;
    } catch (err) {
      console.error("Error al obtener ubicación GPS:", err);
      let msg = "No se pudo obtener tu ubicación GPS.";
      if (err.code === 1) {
        msg =
          "Has denegado el permiso de ubicación. Por favor, ve a los ajustes de tu navegador/dispositivo y permítelo para este sitio.";
      } else if (err.code === 3) {
        msg =
          "Tiempo de espera agotado al buscar ubicación. Asegúrate de tener el GPS activado.";
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
      setStatus("error");
      return; // Si falla la ubicación, nos detenemos aquí
    }

    // 2. Pedir Notificaciones (Opcional - no bloqueante)
    try {
      const notifResult = await requestNotificationPermission();

      if (notifResult === "granted") {
        try {
          await registerForPushNotifications(companyId, userProfile?.uid);
        } catch (fcmErr) {
          console.warn("[Permissions] No se pudo registrar FCM:", fcmErr);
        }
      } else if (notifResult === "unsupported" || (isIOS && !isStandalone)) {
        setInfoMessage(
          "💡 Nota: En iPhone/iOS, para recibir notificaciones pulsa Compartir (📤) ➔ 'Añadir a pantalla de inicio'.",
        );
      } else if (notifResult === "denied") {
        setInfoMessage(
          "Las notificaciones fueron deshabilitadas. Puedes activarlas en los ajustes de tu navegador si las deseas.",
        );
      }
    } catch (notifErr) {
      console.warn("[Permissions] Error al solicitar notificaciones:", notifErr);
    }

    // 3. Éxito (Ubicación concedida)
    if (gpsSuccess) {
      setStatus("granted");
      sessionStorage.setItem("permissions_checked", "true");
      setTimeout(() => setShowModal(false), infoMessage ? 2500 : 1000);
    }
  };

  const openLocationSettings = async () => {
    setErrorMessage(
      "La ubicación del teléfono está desactivada. Actívala y vuelve a la aplicación.",
    );
    await openNativeLocationSettings();
  };

  const openBackgroundSettings = async () => {
    setErrorMessage(
      "En Permisos > Ubicación selecciona ‘Permitir siempre’ y vuelve a LimpiaGest.",
    );
    await openNativeAppSettings();
  };

  const openBatterySettings = async () => {
    setErrorMessage(
      "Acepta que LimpiaGest funcione sin restricciones de batería y vuelve a la aplicación.",
    );
    await openNativeBatterySettings();
  };

  // Al regresar de los ajustes, continuar automáticamente si el usuario
  // ya ha activado la ubicación general del teléfono.
  useEffect(() => {
    if (
      !showModal ||
      (!needsLocationSettings && !needsBackgroundSettings && !needsBatterySettings) ||
      !isNativeLocationAvailable()
    ) {
      return undefined;
    }

    const retryWhenVisible = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await requestPermissions(false);
      } catch (error) {
        console.warn("[Permissions] No se pudo comprobar el ajuste GPS:", error);
      }
    };

    document.addEventListener("visibilitychange", retryWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", retryWhenVisible);
  }, [
    showModal,
    needsLocationSettings,
    needsBackgroundSettings,
    needsBatterySettings,
  ]);

  const handleClose = () => {
    sessionStorage.setItem("permissions_checked", "true");
    setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl text-center">
        <div className="text-5xl mb-4">📍 🔔</div>
        <h2 className="text-xl font-bold mb-3">Permisos Necesarios</h2>
        <p className="text-muted text-sm mb-4">
          Para registrar tu llegada, ver tu ruta y verificar tus servicios, necesitamos
          acceso a tu <b>ubicación GPS</b>.
        </p>

        {isIOS && !isStandalone && (
          <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded mb-4 text-left border border-blue-200">
            📲 <b>Dispositivo iPhone / iOS:</b>
            <br />
            Para habilitar notificaciones push, añade la app a tu pantalla de inicio
            pulsando <b>Compartir (📤) ➔ Añadir a pantalla de inicio</b>.
          </div>
        )}

        {!isNativeLocationAvailable() && (
          <div className="bg-amber-50 text-amber-900 text-xs p-3 rounded mb-4 text-left border border-amber-200">
            🌐 <b>Seguimiento desde navegador:</b> funcionará mientras la web esté
            activa y recuperará el GPS al volver. Con la pantalla apagada el móvil
            puede suspenderlo; para seguimiento continuo usa la aplicación móvil.
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 text-red-700 text-xs p-3 rounded mb-4 text-left border border-red-200">
            <strong>Atención:</strong> {errorMessage}
          </div>
        )}

        {infoMessage && !errorMessage && (
          <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded mb-4 text-left border border-amber-200">
            {infoMessage}
          </div>
        )}

        <button
          className="btn btn-primary w-full py-3 text-base font-bold mb-3"
          onClick={
            needsLocationSettings
              ? openLocationSettings
              : needsBackgroundSettings
                ? openBackgroundSettings
                : needsBatterySettings
                  ? openBatterySettings
                  : () => requestPermissions()
          }
          disabled={status === "loading" || status === "granted"}
        >
          {needsLocationSettings
            ? "⚙️ Abrir ajustes de ubicación"
            : needsBackgroundSettings
              ? "⚙️ Permitir ubicación siempre"
              : needsBatterySettings
                ? "🔋 Quitar restricción de batería"
            : status === "loading"
            ? "⏳ Solicitando ubicación..."
            : status === "granted"
              ? "✅ Ubicación concedida"
              : status === "error"
                ? "🔄 Reintentar ubicación"
                : "Conceder Permisos"}
        </button>

        {(status === "error" || (isIOS && !isStandalone)) && (
          <button
            className="btn btn-ghost w-full py-2 text-sm text-muted"
            onClick={handleClose}
          >
            Continuar a la app
          </button>
        )}
      </div>
    </div>
  );
}
