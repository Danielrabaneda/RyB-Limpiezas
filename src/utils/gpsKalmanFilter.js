/**
 * Filtro de Kalman escalar para suavizar coordenadas GPS.
 *
 * Reduce el ruido de las lecturas GPS promediando las mediciones
 * de forma óptima según su incertidumbre (accuracy). Ideal para
 * escenarios de movimiento peatonal lento como operarios en comunidades.
 *
 * @example
 * const kalman = new GpsKalmanFilter();
 * const filtered = kalman.filter(37.7749, -122.4194, 10);
 * // filtered → { lat, lng, filteredAccuracy }
 */
export class GpsKalmanFilter {
  /**
   * Crea una nueva instancia del filtro de Kalman GPS.
   *
   * @param {number} [Q=1.0] - Ruido de proceso en m². Controla cuánta
   *   incertidumbre se añade entre lecturas. Valores más altos hacen que
   *   el filtro responda más rápido a cambios reales de posición.
   *   Q=1.0 es adecuado para movimiento peatonal lento.
   */
  constructor(Q = 1.0) {
    /** @type {number} Ruido de proceso en m² */
    this.Q = Q;
    /** @type {number} Latitud estimada */
    this.lat = 0;
    /** @type {number} Longitud estimada */
    this.lng = 0;
    /** @type {number} Varianza de la estimación. Negativo = no inicializado */
    this.variance = -1;
  }

  /**
   * Procesa una nueva lectura GPS y devuelve la posición filtrada.
   *
   * En la primera lectura, inicializa el estado del filtro.
   * En lecturas posteriores, ejecuta los pasos de predicción y
   * actualización del filtro de Kalman para suavizar la posición.
   *
   * @param {number} rawLat - Latitud cruda de la lectura GPS.
   * @param {number} rawLng - Longitud cruda de la lectura GPS.
   * @param {number} accuracy - Precisión reportada por el GPS en metros.
   * @returns {{ lat: number, lng: number, filteredAccuracy: number }}
   *   Posición filtrada con precisión estimada (mínimo 0.5m).
   */
  filter(rawLat, rawLng, accuracy) {
    if (this.variance < 0) {
      // Primera lectura: inicializar el estado del filtro
      this.lat = rawLat;
      this.lng = rawLng;
      this.variance = accuracy * accuracy;
      return { lat: rawLat, lng: rawLng, filteredAccuracy: accuracy };
    }

    // Paso de predicción: la incertidumbre crece entre lecturas
    this.variance += this.Q;

    // Calcular ganancia de Kalman (K ∈ [0,1])
    // K alto → confía más en la nueva lectura
    // K bajo → confía más en la estimación anterior
    const R = accuracy * accuracy;
    const K = this.variance / (this.variance + R);

    // Paso de actualización
    this.lat += K * (rawLat - this.lat);
    this.lng += K * (rawLng - this.lng);
    this.variance = (1 - K) * this.variance;

    return {
      lat: this.lat,
      lng: this.lng,
      filteredAccuracy: Math.max(0.5, Math.sqrt(this.variance)),
    };
  }

  /**
   * Reinicia el filtro al estado no inicializado.
   * Útil al inicio de una nueva sesión de geolocalización.
   */
  reset() {
    this.variance = -1;
  }
}
