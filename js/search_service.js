/**
 * SearchService - GomezTube
 * Responsabilidad Única: Cliente de API para búsqueda y feed de videos.
 */

export class SearchService {
  /**
   * Realiza una búsqueda de videos por término.
   * @param {string} query
   * @param {AbortSignal} [signal]
   * @returns {Promise<Array<Object>>}
   */
  static async buscar(query = '', signal = null) {
    try {
      const url = `/api/search?q=${encodeURIComponent(query.trim())}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: signal
      });

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.status}`);
      }

      const data = await response.json();
      return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
      if (error.name === 'AbortError') {
        return [];
      }
      console.error('[SearchService] Fallo al buscar videos:', error);
      return [];
    }
  }

  /**
   * Obtiene los videos en tendencia actuales.
   * @param {AbortSignal} [signal]
   * @returns {Promise<Array<Object>>}
   */
  static async obtenerTendencias(signal = null) {
    return this.buscar('', signal);
  }
}
