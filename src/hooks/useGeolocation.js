import { useState, useCallback } from 'react';
import { GpsKalmanFilter } from '../utils/gpsKalmanFilter';

export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [filteredPosition, setFilteredPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = useCallback((customOptions = {}) => {
    return new Promise((resolve, reject) => {
      setLoading(true);
      setError(null);

      if (!navigator.geolocation) {
        const err = 'La geolocalización no está soportada en este navegador';
        setError(err);
        setLoading(false);
        reject(err);
        return;
      }

      const getPosition = (options) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            setPosition(coords);
            setLoading(false);
            resolve(coords);
          },
          (err) => {
            // Si falla por timeout y estábamos usando alta precisión, intentar con baja precisión
            if (err.code === 3 && options.enableHighAccuracy) {
              console.warn('Timeout con alta precisión. Reintentando con baja precisión...');
              getPosition({ ...options, enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
              return;
            }

            let msg = 'Error obteniendo ubicación';
            switch (err.code) {
              case 1: msg = 'Permiso de ubicación denegado'; break;
              case 2: msg = 'Ubicación no disponible'; break;
              case 3: msg = 'Tiempo de espera agotado'; break;
            }
            setError(msg);
            setLoading(false);
            reject(msg);
          },
          options
        );
      };

      // Iniciar con alta precisión, permitiendo usar caché (por defecto 5 segundos)
      getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
        ...customOptions
      });
    });
  }, []);

  /**
   * Obtiene una única lectura GPS raw (sin filtrar).
   * Usa la misma lógica interna que getCurrentPosition pero sin
   * modificar el estado React, para uso interno del filtrado.
   *
   * @returns {Promise<{ lat: number, lng: number, accuracy: number }>}
   * @private
   */
  const getCurrentPositionRaw = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject('La geolocalización no está soportada en este navegador');
        return;
      }

      const getPosition = (options) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          (err) => {
            // Si falla por timeout y estábamos usando alta precisión, intentar con baja precisión
            if (err.code === 3 && options.enableHighAccuracy) {
              console.warn('[KalmanFilter] Timeout con alta precisión. Reintentando con baja precisión...');
              getPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
              return;
            }
            reject(err);
          },
          options
        );
      };

      getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }, []);

  /**
   * Obtiene una posición GPS filtrada mediante el filtro de Kalman.
   *
   * Toma hasta 5 lecturas GPS consecutivas, descarta las que tengan
   * accuracy > 15m, y pasa las válidas por un filtro de Kalman escalar.
   * Se necesitan 3 lecturas válidas para un resultado óptimo.
   *
   * Si ninguna lectura cumple el umbral de precisión, devuelve la
   * última lectura cruda como fallback.
   *
   * @returns {Promise<{ lat: number, lng: number, accuracy: number }>}
   *   Posición filtrada con el campo `accuracy` correspondiente a
   *   la precisión estimada tras el filtrado.
   */
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
      const ACCURACY_THRESHOLD = 30; // metros (suficiente precisión para validar rango de 500m)

      for (let attempt = 0; attempt < MAX_ATTEMPTS && validReadings < REQUIRED_VALID; attempt++) {
        try {
          const pos = await getCurrentPositionRaw();
          lastRawPosition = pos;

          if (pos.accuracy > ACCURACY_THRESHOLD) {
            console.warn(
              `[KalmanFilter] Lectura ${attempt + 1} descartada: accuracy=${pos.accuracy.toFixed(1)}m > ${ACCURACY_THRESHOLD}m`
            );
            continue; // Descartar lectura imprecisa, intentar de nuevo
          }

          const result = kalman.filter(pos.lat, pos.lng, pos.accuracy);
          lastFilteredPosition = {
            lat: result.lat,
            lng: result.lng,
            accuracy: result.filteredAccuracy,
          };
          validReadings++;

          console.log(
            `[KalmanFilter] Lectura válida ${validReadings}/${REQUIRED_VALID}: ` +
            `raw=(${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}, ±${pos.accuracy.toFixed(1)}m) → ` +
            `filtered=(${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}, ±${result.filteredAccuracy.toFixed(1)}m)`
          );

          // Optimización de salida temprana: si la lectura actual ya es de excelente precisión, terminamos
          if (pos.accuracy <= 15) {
            console.log(`[KalmanFilter] Excelente precisión detectada (±${pos.accuracy.toFixed(1)}m <= 15m) en intento ${attempt + 1}. Retornando inmediatamente.`);
            lastFilteredPosition = {
              lat: pos.lat,
              lng: pos.lng,
              accuracy: pos.accuracy
            };
            break;
          }
        } catch (readError) {
          console.warn(`[KalmanFilter] Error en lectura ${attempt + 1}:`, readError);
          // Continuar con el siguiente intento
        }
      }

      let finalPosition;

      if (lastFilteredPosition === null) {
        // No hubo ninguna lectura con accuracy <= umbral
        // Fallback: usar la última lectura raw (sin filtrar)
        if (lastRawPosition) {
          console.warn(
            '[KalmanFilter] Sin lecturas precisas. Usando fallback raw: ' +
            `accuracy=${lastRawPosition.accuracy.toFixed(1)}m`
          );
          finalPosition = lastRawPosition;
        } else {
          // Ninguna lectura fue posible, lanzar error
          const msg = 'No se pudo obtener la ubicación GPS';
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
      const msg = typeof err === 'string' ? err : err.message || 'Error obteniendo ubicación filtrada';
      setError(msg);
      setLoading(false);
      throw err;
    }
  }, [getCurrentPositionRaw]);

  return { position, filteredPosition, error, loading, getCurrentPosition, getFilteredPosition };
}
