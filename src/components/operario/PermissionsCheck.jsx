import { useState, useEffect } from "react";
import { requestNotificationPermission } from "../../utils/geolocation";
import { registerForPushNotifications } from "../../services/fcmService";
import { useAuth } from "../../contexts/AuthContext";
import { useTenant } from "../../contexts/TenantContext";

export default function PermissionsCheck() {
  const { userProfile } = useAuth();
  const { companyId } = useTenant();
  const [showModal, setShowModal] = useState(false);
  const [status, setStatus] = useState("pending"); // 'pending', 'loading', 'granted', 'error'
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

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
    // Check session storage so we only show the popup if we haven't asked during this session
    const permissionsChecked = sessionStorage.getItem("permissions_checked");
    if (!permissionsChecked) {
      setShowModal(true);
    }
  }, []);

  const requestPermissions = async () => {
    setStatus("loading");
    setErrorMessage("");
    setInfoMessage("");

    let gpsSuccess = false;

    // 1. Pedir Ubicación GPS (Obligatorio para la app)
    try {
      await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("La geolocalización no está soportada en tu navegador."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
        );
      });
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
          onClick={requestPermissions}
          disabled={status === "loading" || status === "granted"}
        >
          {status === "loading"
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
