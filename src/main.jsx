import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Register service worker for PWA only if not in a client portal.
if (!window.location.pathname.startsWith("/portal/")) {
  let refreshing = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Activate first; controllerchange reloads only when the new worker owns the page.
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      // iOS standalone PWAs do not always check promptly for a newer worker.
      registration?.update().catch((error) => {
        console.warn("No se pudo comprobar la actualización de la PWA:", error);
      });
    },
    onOfflineReady() {
      console.log("App lista para uso offline.");
    },
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Señalizar que la aplicación se ha montado correctamente
window.dispatchEvent(new CustomEvent("app-mounted"));
