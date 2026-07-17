// Custom Service Worker para RyB Limpiezas
// Este archivo se inyecta con el precache de Workbox via injectManifest

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { createHandlerBoundToURL } from "workbox-precaching";

// Precache assets inyectados por Workbox
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation routing (SPA fallback) - Excluir portal de clientes para permitir cargas de red frescas y marcadores correctos
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/portal\//],
  }),
);

// Cache Google Fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  "GET",
);

// ========================
// PUSH NOTIFICATION HANDLER
// ========================

// Manejar notificaciones push recibidas
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "RyB Limpiezas", body: event.data.text() };
    }
  }

  const title = data.title || "RyB Limpiezas";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    tag: data.tag || "ryb-notification",
    data: data,
    // El sonido se maneja a través del sistema de notificaciones del OS
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Manejar clics en notificaciones
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Determinar la URL de destino según los datos de la notificación
  const notifData = event.notification.data || {};
  const targetUrl =
    notifData.targetUrl ||
    (notifData.serviceId ? `/operario/servicio/${notifData.serviceId}` : "/");

  // Abrir la app o enfocar la ventana existente
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una ventana abierta, enfocarla y navegar
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            // Enviar mensaje al cliente para navegar a la URL correcta
            if (targetUrl !== "/") {
              client.postMessage({ type: "NAVIGATE", url: targetUrl });
            }
            return;
          }
        }
        // Si no, abrir una nueva ventana con la URL de destino
        return self.clients.openWindow(targetUrl);
      }),
  );
});

// ========================
// MENSAJE DESDE EL MAIN THREAD
// ========================
// Para mostrar notificaciones nativas con sonido desde la app en foreground/background

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || "RyB Limpiezas", {
        body: options?.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: options?.requireInteraction !== false,
        tag: options?.tag || "ryb-alert-" + Date.now(),
        silent: false, // El SO reproduce sonido de notificación del sistema
        ...options,
      }),
    );
  }
});

// Activar inmediatamente sin esperar a las pestañas cerradas
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
