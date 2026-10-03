import { useEffect, useState } from "react";
import { isNativeLocationAvailable } from "../../services/nativeBackgroundLocationService";

const LAST_WEB_FIX_KEY = "tracker_last_web_fix_at";
const FRESH_FIX_MS = 2 * 60_000;

function readLastFix() {
  const value = Number(localStorage.getItem(LAST_WEB_FIX_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}

export default function WebTrackingStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [permission, setPermission] = useState("unknown");
  const [lastFix, setLastFix] = useState(readLastFix);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (isNativeLocationAvailable()) return undefined;

    let permissionStatus;
    const refreshPermission = async () => {
      if (!navigator.permissions?.query) return;
      try {
        permissionStatus = await navigator.permissions.query({
          name: "geolocation",
        });
        setPermission(permissionStatus.state);
        permissionStatus.onchange = () => setPermission(permissionStatus.state);
      } catch {
        setPermission("unknown");
      }
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleFix = (event) => {
      const timestamp = Number(event.detail?.timestamp || Date.now());
      setLastFix(timestamp);
      setNow(Date.now());
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        setLastFix(readLastFix());
        setNow(Date.now());
        refreshPermission();
      }
    };

    refreshPermission();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("ryb-web-tracking-fix", handleFix);
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      if (permissionStatus) permissionStatus.onchange = null;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("ryb-web-tracking-fix", handleFix);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (isNativeLocationAvailable()) return null;

  const hasFreshFix = lastFix > 0 && now - lastFix <= FRESH_FIX_MS;
  const denied = permission === "denied";
  const androidBrowser = /Android/i.test(navigator.userAgent);
  const status = denied
    ? "GPS bloqueado"
    : !online
      ? "Sin conexión · guardando en el teléfono"
      : hasFreshFix
        ? "GPS web activo"
        : "Buscando señal GPS";
  const tone = denied
    ? "bg-red-50 border-red-200 text-red-800"
    : !online || !hasFreshFix
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-emerald-50 border-emerald-200 text-emerald-900";

  return (
    <details className={`mx-4 mt-3 rounded-xl border px-4 py-2 text-sm ${tone}`}>
      <summary className="cursor-pointer font-semibold">
        {denied ? "⚠️" : hasFreshFix ? "📍" : "🔄"} {status}
      </summary>
      <div className="mt-2 text-xs leading-relaxed">
        {denied ? (
          <p>
            Activa el permiso de ubicación de este sitio desde los ajustes del
            navegador y vuelve a cargar la página.
          </p>
        ) : (
          <p>
            La web recupera el GPS al volver a primer plano y conserva los datos
            pendientes si se pierde la conexión.
          </p>
        )}
        <p className="mt-1 font-medium">
          Con la pantalla apagada el navegador puede suspender el seguimiento.
          {androidBrowser
            ? " Para detección automática continua utiliza la aplicación LimpiaGest Android."
            : " Para seguimiento continuo utiliza la aplicación móvil nativa."}
        </p>
      </div>
    </details>
  );
}
