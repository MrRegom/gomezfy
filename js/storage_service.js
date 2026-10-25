/**
 * StorageService - GomezTube
 * Responsabilidad Única: Persistencia local (localStorage) para videos guardados
 * ("Ver más tarde") e historial de visualización.
 */

const STORAGE_KEYS = Object.freeze({
  FAVORITOS: 'gomeztube_guardados_v1',
  HISTORIAL: 'gomeztube_historial_v1'
});

const MAX_HISTORIAL_ITEMS = 50;

export class StorageService {
  /**
   * Obtiene la lista de videos guardados.
   * @returns {Array<Object>}
   */
  static obtenerFavoritos() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FAVORITOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[StorageService] Error al leer favoritos:', e);
      return [];
    }
  }

  /**
   * Verifica si un video ya está guardado.
   * @param {string} videoId
   * @returns {boolean}
   */
  static esFavorito(videoId) {
    if (!videoId) return false;
    const favs = this.obtenerFavoritos();
    return favs.some((item) => item.id === videoId);
  }

  /**
   * Agrega o elimina un video de la lista de guardados.
   * @param {Object} video
   * @returns {boolean} true si quedó guardado, false si fue removido
   */
  static alternarFavorito(video) {
    if (!video || !video.id) return false;
    const favs = this.obtenerFavoritos();
    const index = favs.findIndex((item) => item.id === video.id);

    if (index >= 0) {
      favs.splice(index, 1);
      this._guardar(STORAGE_KEYS.FAVORITOS, favs);
      return false;
    } else {
      favs.unshift(video);
      this._guardar(STORAGE_KEYS.FAVORITOS, favs);
      return true;
    }
  }

  /**
   * Registra un video en el historial de reproducción.
   * @param {Object} video
   */
  static guardarEnHistorial(video) {
    if (!video || !video.id) return;
    try {
      let historial = this.obtenerHistorial();
      // Eliminar ocurrencia previa para colocarlo al principio
      historial = historial.filter((item) => item.id !== video.id);
      historial.unshift({
        ...video,
        vistoEn: Date.now()
      });

      if (historial.length > MAX_HISTORIAL_ITEMS) {
        historial = historial.slice(0, MAX_HISTORIAL_ITEMS);
      }

      this._guardar(STORAGE_KEYS.HISTORIAL, historial);
    } catch (e) {
      console.warn('[StorageService] Error al actualizar historial:', e);
    }
  }

  /**
   * Obtiene el historial de visualización.
   * @returns {Array<Object>}
   */
  static obtenerHistorial() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORIAL);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[StorageService] Error al leer historial:', e);
      return [];
    }
  }

  /**
   * Borra el historial completo.
   */
  static limpiarHistorial() {
    try {
      localStorage.removeItem(STORAGE_KEYS.HISTORIAL);
    } catch (e) {
      console.warn('[StorageService] Error al limpiar historial:', e);
    }
  }

  static _guardar(clave, data) {
    try {
      localStorage.setItem(clave, JSON.stringify(data));
    } catch (e) {
      console.warn(`[StorageService] Error al guardar en ${clave}:`, e);
    }
  }
}
