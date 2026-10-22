/**
 * StorageService - Patrón Repository para persistencia Local-First.
 * Responsabilidad Única: Manejar el aislamiento de perfiles locales (Papá, Hijo)
 * y sus respectivas listas de reproducción y favoritos sin dependencias externas.
 */

const DEFAULT_PROFILES = [
  { id: 'papa', name: 'Papá', avatar: '👨' },
  { id: 'hijo', name: 'Hijo', avatar: '👦' }
];

export class StorageService {
  constructor() {
    this._inicializarPerfiles();
  }

  _inicializarPerfiles() {
    const perfilesGuardados = localStorage.getItem('gomezfy_profiles');
    if (!perfilesGuardados) {
      localStorage.setItem('gomezfy_profiles', JSON.stringify(DEFAULT_PROFILES));
      localStorage.setItem('gomezfy_active_profile', 'papa');
    }
  }

  getPerfiles() {
    try {
      return JSON.parse(localStorage.getItem('gomezfy_profiles')) || DEFAULT_PROFILES;
    } catch {
      return DEFAULT_PROFILES;
    }
  }

  getPerfilActivo() {
    const activoId = localStorage.getItem('gomezfy_active_profile') || 'papa';
    const perfiles = this.getPerfiles();
    return perfiles.find(p => p.id === activoId) || perfiles[0];
  }

  cambiarPerfil(perfilId) {
    const perfiles = this.getPerfiles();
    const existe = perfiles.some(p => p.id === perfilId);
    if (existe) {
      localStorage.setItem('gomezfy_active_profile', perfilId);
      return true;
    }
    return false;
  }

  agregarPerfil(nombre, avatar = '🎧') {
    if (!nombre.trim()) return null;
    const perfiles = this.getPerfiles();
    const id = 'perfil_' + Date.now();
    const nuevo = { id, name: nombre.trim(), avatar };
    perfiles.push(nuevo);
    localStorage.setItem('gomezfy_profiles', JSON.stringify(perfiles));
    return nuevo;
  }

  // --- Listas de Reproducción vinculadas al perfil activo ---

  _getClaveListas() {
    const perfil = this.getPerfilActivo();
    return `gomezfy_playlists_${perfil.id}`;
  }

  getListas() {
    try {
      const data = localStorage.getItem(this._getClaveListas());
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  crearLista(nombre) {
    if (!nombre.trim()) return null;
    const listas = this.getListas();
    const nueva = {
      id: 'pl_' + Date.now(),
      name: nombre.trim(),
      tracks: [],
      createdAt: new Date().toISOString()
    };
    listas.unshift(nueva);
    localStorage.setItem(this._getClaveListas(), JSON.stringify(listas));
    return nueva;
  }

  eliminarLista(listaId) {
    let listas = this.getListas();
    listas = listas.filter(l => l.id !== listaId);
    localStorage.setItem(this._getClaveListas(), JSON.stringify(listas));
  }

  agregarPistaALista(listaId, track) {
    const listas = this.getListas();
    const lista = listas.find(l => l.id === listaId);
    if (lista) {
      const yaExiste = lista.tracks.some(t => t.id === track.id);
      if (!yaExiste) {
        lista.tracks.push(track);
        localStorage.setItem(this._getClaveListas(), JSON.stringify(listas));
        return true;
      }
    }
    return false;
  }

  removerPistaDeLista(listaId, trackId) {
    const listas = this.getListas();
    const lista = listas.find(l => l.id === listaId);
    if (lista) {
      lista.tracks = lista.tracks.filter(t => t.id !== trackId);
      localStorage.setItem(this._getClaveListas(), JSON.stringify(listas));
      return true;
    }
    return false;
  }

  // --- Favoritos del perfil activo ---

  _getClaveFavoritos() {
    const perfil = this.getPerfilActivo();
    return `gomezfy_favorites_${perfil.id}`;
  }

  getFavoritos() {
    try {
      const data = localStorage.getItem(this._getClaveFavoritos());
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  esFavorito(trackId) {
    const favs = this.getFavoritos();
    return favs.some(t => t.id === trackId);
  }

  toggleFavorito(track) {
    let favs = this.getFavoritos();
    const existe = favs.some(t => t.id === track.id);
    if (existe) {
      favs = favs.filter(t => t.id !== track.id);
    } else {
      favs.unshift(track);
    }
    localStorage.setItem(this._getClaveFavoritos(), JSON.stringify(favs));
    return !existe;
  }
}
