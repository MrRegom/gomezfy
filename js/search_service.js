/**
 * SearchService - Servicio de búsqueda desacoplado.
 * Responsabilidad Única: Comunicarse con la API de búsqueda y cachear consultas.
 */

export class SearchService {
  constructor() {
    this.cache = new Map();
  }

  async buscar(query) {
    const q = query.trim();
    if (q.length < 2) return [];

    if (this.cache.has(q)) {
      return this.cache.get(q);
    }

    try {
      let response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!response.ok && response.status === 404) {
        response = await fetch(`/api/search.py?q=${encodeURIComponent(q)}`);
      }
      if (!response.ok) throw new Error('Error en búsqueda');
      const data = await response.json();
      const results = data.results || [];
      this.cache.set(q, results);
      return results;
    } catch (err) {
      console.error('[SearchService Error]:', err);
      return [];
    }
  }
}
