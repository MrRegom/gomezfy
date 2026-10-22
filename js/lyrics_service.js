/**
 * LyricsService - Proveedor y formateador de letras sincronizadas (Karaoke).
 * Responsabilidad Única: Obtener letras de la API y calcular la línea activa según el tiempo.
 */

export class LyricsService {
  constructor() {
    this.currentLines = [];
    this.cache = new Map();
  }

  async obtenerLetra(trackTitle, artist = '') {
    const key = `${trackTitle}-${artist}`;
    if (this.cache.has(key)) {
      const data = this.cache.get(key);
      this.currentLines = this._parsearLRC(data.syncedLyrics);
      return data;
    }

    try {
      const url = `/api/lyrics?track=${encodeURIComponent(trackTitle)}&artist=${encodeURIComponent(artist)}`;
      const res = await fetch(url);
      const data = await res.json();
      this.cache.set(key, data);
      this.currentLines = this._parsearLRC(data.syncedLyrics);
      return data;
    } catch (err) {
      console.error('[LyricsService Error]:', err);
      return { found: false, plainLyrics: 'Letra no disponible.', syncedLyrics: '' };
    }
  }

  _parsearLRC(syncedLyrics) {
    if (!syncedLyrics) return [];

    const lineas = [];
    const regex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/;

    syncedLyrics.split('\n').forEach((l) => {
      const m = regex.exec(l);
      if (m) {
        const min = parseInt(m[1], 10);
        const seg = parseInt(m[2], 10);
        const cent = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
        const tiempo = min * 60 + seg + cent;
        const texto = m[4].trim();
        if (texto) {
          lineas.push({ time: tiempo, text: texto });
        }
      }
    });

    return lineas.sort((a, b) => a.time - b.time);
  }

  getIndiceActivo(currentTime) {
    if (this.currentLines.length === 0) return -1;
    let index = -1;
    for (let i = 0; i < this.currentLines.length; i++) {
      if (currentTime >= this.currentLines[i].time) {
        index = i;
      } else {
        break;
      }
    }
    return index;
  }
}
