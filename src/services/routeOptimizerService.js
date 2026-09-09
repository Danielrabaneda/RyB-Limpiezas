import { getDistance } from "../utils/geolocation.js";

/**
 * Mantiene la API anterior para los consumidores que solo necesitan el array.
 */
export function optimizeRoute(services, startLat, startLng, options = {}) {
  return optimizeRoutePlan(services, startLat, startLng, options).services;
}

/**
 * Calcula el siguiente recorrido y devuelve metadatos para que la interfaz no
 * anuncie una optimización que realmente no se ha podido realizar.
 */
export function optimizeRoutePlan(
  services,
  startLat,
  startLng,
  {
    now = new Date(),
    averageSpeedKmh = 25,
    defaultServiceMinutes = 30,
    urgencyWindowMinutes = 30,
  } = {},
) {
  const source = Array.isArray(services) ? services : [];
  const hasValidStart = isValidCoordinatePair(startLat, startLng);

  const completed = source
    .filter((service) => ["completed", "missed"].includes(service.status))
    .sort((a, b) => getCompletionTime(a) - getCompletionTime(b));
  const inProgress = source.filter((service) =>
    ["in_progress", "started"].includes(service.status),
  );
  const pending = source.filter(
    (service) =>
      !["completed", "missed", "in_progress", "started"].includes(
        service.status,
      ),
  );

  const prepared = pending.map((service) => {
    const coordinates = getValidCoordinates(service.community?.location);
    const preferredTime =
      service.community?.preferredTime || service.scheduledTime || null;
    return {
      ...service,
      _lat: coordinates?.lat ?? null,
      _lng: coordinates?.lng ?? null,
      _preferredTime: isValidTime(preferredTime) ? preferredTime : null,
    };
  });

  const routable = prepared.filter(
    (service) => service._lat !== null && service._lng !== null,
  );
  const withoutCoordinates = prepared.filter(
    (service) => service._lat === null || service._lng === null,
  );
  const unroutable = cleanRouteFields(
    withoutCoordinates.map((service) => ({
      ...service,
      routeWarning: "Ubicación sin configurar",
    })),
  );

  if (!hasValidStart || routable.length < 2) {
    return {
      services: [
        ...inProgress,
        ...cleanRouteFields(routable),
        ...unroutable,
        ...completed,
      ],
      optimized: false,
      reason: !hasValidStart
        ? "missing_start_location"
        : "not_enough_routable_services",
      missingCoordinates: withoutCoordinates.length,
    };
  }

  const withTimeConstraint = routable
    .filter((service) => service._preferredTime)
    .sort(
      (a, b) =>
        timeToMinutes(a._preferredTime) - timeToMinutes(b._preferredTime),
    );
  const withoutTimeConstraint = routable.filter(
    (service) => !service._preferredTime,
  );

  const optimized = [];
  const remaining = [...withoutTimeConstraint];
  const timeQueue = [...withTimeConstraint];
  let currentLat = Number(startLat);
  let currentLng = Number(startLng);
  let estimatedClockMinutes = now.getHours() * 60 + now.getMinutes();

  while (remaining.length > 0 || timeQueue.length > 0) {
    let nextService = null;

    if (timeQueue.length > 0) {
      const urgentIndex = timeQueue.findIndex((timedService) => {
        const travelMinutes = estimateTravelTimeMinutes(
          getDistance(
            currentLat,
            currentLng,
            timedService._lat,
            timedService._lng,
          ),
          averageSpeedKmh,
        );
        return (
          timeToMinutes(timedService._preferredTime) <=
          estimatedClockMinutes + travelMinutes + urgencyWindowMinutes
        );
      });

      if (urgentIndex >= 0) {
        nextService = timeQueue.splice(urgentIndex, 1)[0];
      }
    }

    if (!nextService && remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let index = 0; index < remaining.length; index += 1) {
        const distance = getDistance(
          currentLat,
          currentLng,
          remaining[index]._lat,
          remaining[index]._lng,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }

      nextService = remaining.splice(nearestIndex, 1)[0];
    }

    if (!nextService) {
      nextService = timeQueue.shift();
    }

    const distanceMeters = getDistance(
      currentLat,
      currentLng,
      nextService._lat,
      nextService._lng,
    );
    const travelMinutes = estimateTravelTimeMinutes(
      distanceMeters,
      averageSpeedKmh,
    );
    const arrivalMinutes = estimatedClockMinutes + travelMinutes;
    const preferredMinutes = nextService._preferredTime
      ? timeToMinutes(nextService._preferredTime)
      : null;
    const serviceStartMinutes =
      preferredMinutes === null
        ? arrivalMinutes
        : Math.max(arrivalMinutes, preferredMinutes);

    optimized.push({
      ...nextService,
      routePosition: optimized.length + 1,
      estimatedArrivalMinutes: Math.round(arrivalMinutes),
    });

    estimatedClockMinutes =
      serviceStartMinutes +
      getServiceDurationMinutes(nextService, defaultServiceMinutes);
    currentLat = nextService._lat;
    currentLng = nextService._lng;
  }

  return {
    services: [
      ...inProgress,
      ...cleanRouteFields(optimized),
      ...unroutable,
      ...completed,
    ],
    optimized: true,
    reason: "optimized",
    missingCoordinates: withoutCoordinates.length,
  };
}

export function getValidCoordinates(location) {
  if (!location) return null;
  const lat = Number(location._lat ?? location.latitude);
  const lng = Number(location._long ?? location.longitude);
  if (!isValidCoordinatePair(lat, lng)) return null;
  return { lat, lng };
}

export function calculateTotalDistance(services, startLat, startLng) {
  if (!Array.isArray(services) || services.length === 0) return 0;
  if (!isValidCoordinatePair(startLat, startLng)) return 0;

  let totalMeters = 0;
  let previousLat = Number(startLat);
  let previousLng = Number(startLng);

  for (const service of services) {
    const coordinates = getValidCoordinates(service.community?.location);
    if (!coordinates) continue;
    totalMeters += getDistance(
      previousLat,
      previousLng,
      coordinates.lat,
      coordinates.lng,
    );
    previousLat = coordinates.lat;
    previousLng = coordinates.lng;
  }

  return Math.round(totalMeters / 100) / 10;
}

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

function getCompletionTime(service) {
  const value = service.updatedAt;
  if (value?.toDate) return value.toDate().getTime();
  if (value) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  return 0;
}

function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidTime(timeString) {
  if (typeof timeString !== "string") return false;
  const match = timeString.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isValidCoordinatePair(lat, lng) {
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number(lng) >= -180 &&
    Number(lng) <= 180 &&
    !(Number(lat) === 0 && Number(lng) === 0)
  );
}

function estimateTravelTimeMinutes(distanceMeters, averageSpeedKmh) {
  const safeSpeed = Math.max(5, Number(averageSpeedKmh) || 25);
  const roadDistanceKm = (Math.max(0, distanceMeters) / 1000) * 1.25;
  return Math.max(1, Math.round((roadDistanceKm / safeSpeed) * 60));
}

function getServiceDurationMinutes(service, defaultMinutes) {
  const configured = Number(
    service.estimatedDurationMinutes ??
      service.durationMinutes ??
      service.plannedDurationMinutes,
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : defaultMinutes;
}

function cleanRouteFields(services) {
  return services.map((service) => {
    const { _lat, _lng, _preferredTime, ...cleaned } = service;
    return cleaned;
  });
}
