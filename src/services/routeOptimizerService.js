import { getDistance } from "../utils/geolocation";

/**
 * Optimiza el orden de los servicios usando el algoritmo Nearest Neighbor,
 * respetando restricciones horarias (preferredTime) de las comunidades.
 *
 * @param {Array} services - Array de servicios enriquecidos con community.location
 * @param {number} startLat - Latitud del punto de partida
 * @param {number} startLng - Longitud del punto de partida
 * @returns {Array} Servicios reordenados en el orden óptimo
 */
export function optimizeRoute(services, startLat, startLng) {
  if (!services || services.length <= 1) return services;

  // Separar servicios por estado
  const completed = services.filter((s) => s.status === "completed");
  const inProgress = services.filter((s) => s.status === "in_progress");
  const pending = services.filter(
    (s) => s.status !== "completed" && s.status !== "in_progress",
  );

  // Ordenar los completados cronológicamente por su hora de actualización/finalización (de más antiguo a más reciente)
  completed.sort((a, b) => {
    const tA = a.updatedAt?.toDate
      ? a.updatedAt.toDate().getTime()
      : a.updatedAt
        ? new Date(a.updatedAt).getTime()
        : 0;
    const tB = b.updatedAt?.toDate
      ? b.updatedAt.toDate().getTime()
      : b.updatedAt
        ? new Date(b.updatedAt).getTime()
        : 0;
    return tA - tB;
  });

  if (pending.length <= 1) {
    return [...completed, ...inProgress, ...pending];
  }

  // Extraer coordenadas de cada servicio pendiente
  const withCoords = pending.map((svc) => {
    const loc = svc.community?.location;
    const lat = loc?._lat || loc?.latitude || 0;
    const lng = loc?._long || loc?.longitude || 0;
    const preferredTime = svc.community?.preferredTime || null;
    return { ...svc, _lat: lat, _lng: lng, _preferredTime: preferredTime };
  });

  // Separar en: con restricción horaria y sin restricción
  const withTimeConstraint = withCoords.filter((s) => s._preferredTime);
  const withoutTimeConstraint = withCoords.filter((s) => !s._preferredTime);

  // Ordenar los que tienen restricción horaria por hora
  withTimeConstraint.sort((a, b) => {
    return timeToMinutes(a._preferredTime) - timeToMinutes(b._preferredTime);
  });

  // Construir la ruta optimizada intercalando restricciones horarias
  const optimized = [];
  const remaining = [...withoutTimeConstraint];
  let currentLat = startLat;
  let currentLng = startLng;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Pool combinado: insertamos los servicios con restricción en el momento adecuado
  const timeQueue = [...withTimeConstraint];

  while (remaining.length > 0 || timeQueue.length > 0) {
    // Calcular cuántos minutos de viaje estimados hemos acumulado
    const estimatedMinutesSoFar =
      currentMinutes + estimateTravelMinutes(optimized);

    // ¿Hay algún servicio con restricción horaria que deba ir AHORA?
    // (su hora preferida está próxima o ya pasó)
    let forcedTimeService = null;
    if (timeQueue.length > 0) {
      const nextTimed = timeQueue[0];
      const nextTimedMinutes = timeToMinutes(nextTimed._preferredTime);

      // Si la hora preferida es antes de lo que tardaríamos en hacer el siguiente servicio libre,
      // o si ya hemos pasado esa hora, insertarlo ahora
      const urgencyWindow = 30; // 30 minutos de margen
      if (
        nextTimedMinutes <= estimatedMinutesSoFar + urgencyWindow ||
        nextTimedMinutes <= currentMinutes
      ) {
        forcedTimeService = timeQueue.shift();
      }
    }

    if (forcedTimeService) {
      optimized.push(forcedTimeService);
      currentLat = forcedTimeService._lat;
      currentLng = forcedTimeService._lng;
    } else if (remaining.length > 0) {
      // Nearest Neighbor: elegir el más cercano
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = getDistance(
          currentLat,
          currentLng,
          remaining[i]._lat,
          remaining[i]._lng,
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      currentLat = nearest._lat;
      currentLng = nearest._lng;
    } else {
      // Solo quedan servicios con restricción horaria
      const next = timeQueue.shift();
      optimized.push(next);
      currentLat = next._lat;
      currentLng = next._lng;
    }
  }

  // Limpiar propiedades internas
  const cleaned = optimized.map((s) => {
    const { _lat, _lng, _preferredTime, ...rest } = s;
    return rest;
  });

  return [...completed, ...inProgress, ...cleaned];
}

/**
 * Calcula la distancia total de un recorrido de servicios en kilómetros.
 *
 * @param {Array} services - Array de servicios con community.location
 * @param {number} startLat - Latitud del punto de partida
 * @param {number} startLng - Longitud del punto de partida
 * @returns {number} Distancia total en km (redondeada a 1 decimal)
 */
export function calculateTotalDistance(services, startLat, startLng) {
  if (!services || services.length === 0) return 0;

  let totalMeters = 0;
  let prevLat = startLat;
  let prevLng = startLng;

  for (const svc of services) {
    const loc = svc.community?.location;
    const lat = loc?._lat || loc?.latitude || 0;
    const lng = loc?._long || loc?.longitude || 0;
    if (lat === 0 && lng === 0) continue;

    totalMeters += getDistance(prevLat, prevLng, lat, lng);
    prevLat = lat;
    prevLng = lng;
  }

  return Math.round(totalMeters / 100) / 10; // km con 1 decimal
}

/**
 * Compara el orden original vs el optimizado y devuelve estadísticas.
 *
 * @param {Array} originalServices - Servicios en orden original
 * @param {Array} optimizedServices - Servicios en orden optimizado
 * @param {number} startLat - Latitud del punto de partida
 * @param {number} startLng - Longitud del punto de partida
 * @returns {{ originalDistance: number, optimizedDistance: number, savedDistance: number, savedPercent: number }}
 */
export function getRouteStats(
  originalServices,
  optimizedServices,
  startLat,
  startLng,
) {
  const originalDistance = calculateTotalDistance(
    originalServices,
    startLat,
    startLng,
  );
  const optimizedDistance = calculateTotalDistance(
    optimizedServices,
    startLat,
    startLng,
  );
  const savedDistance = Math.max(0, originalDistance - optimizedDistance);
  const savedPercent =
    originalDistance > 0
      ? Math.round((savedDistance / originalDistance) * 100)
      : 0;

  return {
    originalDistance,
    optimizedDistance,
    savedDistance,
    savedPercent,
  };
}

// --- Helpers ---

/**
 * Convierte "HH:MM" a minutos desde medianoche
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Estima minutos de viaje acumulados basándose en los servicios ya añadidos.
 * Asume ~30 min por servicio de limpieza + tiempo de desplazamiento.
 */
function estimateTravelMinutes(services) {
  return services.length * 45; // 45 min promedio por servicio (30 limpieza + 15 viaje)
}
