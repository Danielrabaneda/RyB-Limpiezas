import { useState, useCallback } from 'react';

export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = useCallback(() => {
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
              getPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
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

      // Iniciar con alta precisión, 15 segundos
      getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }, []);

  return { position, error, loading, getCurrentPosition };
}
