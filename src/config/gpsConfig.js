/**
 * Configuración centralizada de umbrales GPS, geovallas y notificaciones
 * para la aplicación RyB Limpiezas.
 */
export const GPS_CONFIG = {
  // Polling de respaldo
  CHECK_INTERVAL_MS: 30 * 1000, // 30s

  // Geofencing por defecto
  DEFAULT_GEOFENCE_RADIUS_METERS: 50, // 50m para comunidades urbanas
  HYSTERESIS_BUFFER_METERS: 50, // +50m para confirmar la salida

  // Tiempos de permanencia mínimos para confirmar transiciones
  ENTRY_CONFIRM_DELAY_MS: 90 * 1000, // 90s de permanencia para confirmar llegada (evita falsos positivos en coche/paso rápido)
  EXIT_CONFIRM_DELAY_MS: 5 * 60 * 1000, // 5 min fuera de geovalla para confirmar salida (evita micro-cortes)

  // Límites de precisión de GPS aceptables
  MAX_ACCURACY_FOR_ENTRY_METERS: 40, // Descartar por completo lecturas con precisión peor de 40m para llegada
  MAX_ACCURACY_FOR_EXIT_METERS: 80, // Ignorar lecturas imprecisas para salida

  // Intervalo de re-notificación
  RE_NOTIFY_INTERVAL_MS: 3 * 60 * 1000, // Recordatorio cada 3 minutos en rango

  // Parámetros de suspensión de la PWA
  MAX_SUSPENSION_FOR_ESTIMATE_MS: 60 * 60 * 1000, // 1 hora máximo de suspensión de la app para estimar llegada

  // Filtro de velocidad
  MAX_SPEED_FOR_ENTRY_KMH: 30, // 30 km/h: no detectar entrada si se viaja rápido

  // Ventanas de llegada (en minutos) respecto a la hora programada
  ARRIVAL_WINDOW_PRE_MINUTES: 45, // 45 minutos antes
  ARRIVAL_WINDOW_POST_MINUTES: 90, // 90 minutos después

  // Duración del silenciado de sugerencias descartadas
  DISMISSAL_SILENCE_DURATION_MS: 25 * 60 * 1000, // 25 minutos de silencio tras descartar una sugerencia
};
