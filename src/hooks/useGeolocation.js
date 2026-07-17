import { useState, useEffect, useCallback } from "react";
import { GpsKalmanFilter } from "../utils/gpsKalmanFilter";

export function useGeolocation(customOptions = {}) {
  const [position, setPosition] = useState(null);
  const [filteredPosition, setFilteredPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = useCallback(
    (options = {}) => {
      setLoading(true);
      setError(null);

      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          const msg = "La geolocalización no está soportada en este navegador";
          setError(msg);
          setLoading(false);
          reject(msg);
          return;
        }

        const getPosition = (opts) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const coords = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed:
                  typeof pos.coords.speed === "number"
                    ? pos.coords.speed
                    : null,
                timestamp: pos.timestamp || Date.now(),
              };
              setPosition(coords);
              setLoading(false);
              resolve(coords);
            },
            (err) => {
              if (err.code === 3 && opts.enableHighAccuracy) {
                console.warn(
                  "Timeout con alta precisión. Reintentando con baja precisión...",
                );
                getPosition({
                  ...opts,
                  enableHighAccuracy: false,
                  timeout: 15000,
                  maximumAge: 60000,
                });
                return;
              }

              let msg = "Error obteniendo ubicación";
              switch (err.code) {
                case 1:
                  msg = "Permiso de ubicación denegado";
                  break;
                case 2:
                  msg = "Ubicación no disponible";
                  break;
                case 3:
                  msg = "Tiempo de espera agotado";
                  break;
              }
              setError(msg);
              setLoading(false);
              reject(msg);
            },
            opts,
          );
        };

        getPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
          ...customOptions,
          ...options,
        });
      });
    },
    [customOptions],
  );

  const getCurrentPositionRaw = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject("La geolocalización no está soportada en este navegador");
        return;
      }

      const getPosition = (opts) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed:
                typeof pos.coords.speed === "number" ? pos.coords.speed : null,
              timestamp: pos.timestamp || Date.now(),
            });
          },
          (err) => {
            if (err.code === 3 && opts.enableHighAccuracy) {
              console.warn(
                "[KalmanFilter] Timeout con alta precisión. Reintentando con baja precisión...",
              );
              getPosition({
                enableHighAccuracy: false,
                timeout: 15000,
                maximumAge: 60000,
              });
              return;
            }
            reject(err);
          },
          opts,
        );
      };

      getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }, []);

  const getFilteredPosition = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const kalman = new GpsKalmanFilter(1.0);
      let validReadings = 0;
      let lastFilteredPosition = null;
      let lastRawPosition = null;

      const MAX_ATTEMPTS = 3;
      const REQUIRED_VALID = 2;
      const ACCURACY_THRESHOLD = 30;

      for (
        let attempt = 0;
        attempt < MAX_ATTEMPTS && validReadings < REQUIRED_VALID;
        attempt++
      ) {
        try {
          const pos = await getCurrentPositionRaw();
          lastRawPosition = pos;

          if (pos.accuracy > ACCURACY_THRESHOLD) {
            console.warn(
              `[KalmanFilter] Lectura ${attempt + 1} descartada: accuracy=${pos.accuracy.toFixed(1)}m > ${ACCURACY_THRESHOLD}m`,
            );
            continue;
          }

          const result = kalman.filter(pos.lat, pos.lng, pos.accuracy);
          lastFilteredPosition = {
            lat: result.lat,
            lng: result.lng,
            accuracy: result.filteredAccuracy,
            speed: pos.speed,
            timestamp: pos.timestamp,
          };
          validReadings++;

          console.log(
            `[KalmanFilter] Lectura válida ${validReadings}/${REQUIRED_VALID}: ` +
              `raw=(${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}, ±${pos.accuracy.toFixed(1)}m) → ` +
              `filtered=(${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}, ±${result.filteredAccuracy.toFixed(1)}m)`,
          );

          if (pos.accuracy <= 15) {
            console.log(
              `[KalmanFilter] Excelente precisión detectada (±${pos.accuracy.toFixed(1)}m <= 15m) en intento ${attempt + 1}. Retornando inmediatamente.`,
            );
            lastFilteredPosition = {
              lat: pos.lat,
              lng: pos.lng,
              accuracy: pos.accuracy,
              speed: pos.speed,
              timestamp: pos.timestamp,
            };
            break;
          }
        } catch (readError) {
          console.warn(
            `[KalmanFilter] Error en lectura ${attempt + 1}:`,
            readError,
          );
        }
      }

      let finalPosition;

      if (lastFilteredPosition === null) {
        if (lastRawPosition) {
          console.warn(
            "[KalmanFilter] Sin lecturas precisas. Usando fallback raw: " +
              `accuracy=${lastRawPosition.accuracy.toFixed(1)}m`,
          );
          finalPosition = lastRawPosition;
        } else {
          const msg = "No se pudo obtener la ubicación GPS";
          setError(msg);
          setLoading(false);
          throw new Error(msg);
        }
      } else {
        finalPosition = lastFilteredPosition;
      }

      setFilteredPosition(finalPosition);
      setPosition(finalPosition);
      setLoading(false);
      return finalPosition;
    } catch (err) {
      const msg =
        typeof err === "string"
          ? err
          : err.message || "Error obteniendo ubicación filtrada";
      setError(msg);
      setLoading(false);
      throw err;
    }
  }, [getCurrentPositionRaw]);

  return {
    position,
    filteredPosition,
    error,
    loading,
    getCurrentPosition,
    getFilteredPosition,
  };
}
