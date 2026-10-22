/**
 * AppController - Orquestador Central de Gomezfy Music (Clean Architecture).
 * Responsabilidad Única: Coordinar AudioEngine, StorageService, SearchService,
 * LyricsService e interactuar con el DOM de forma reactiva y desacoplada.
 */

import { AudioEngine, PlaybackState } from './audio_engine.js';
import { StorageService } from './storage_service.js';
import { SearchService } from './search_service.js';
import { LyricsService } from './lyrics_service.js';

class AppController {
  constructor() {
    this.storage = new StorageService();
    this.audio = new AudioEngine('yt-player-container');
    this.search = new SearchService();
    this.lyrics = new LyricsService();

    this.currentQueue = [];
    this.currentIndex = -1;
    this.activeTrack = null;
    this.isShuffle = false;
    this.repeatMode = 'OFF'; // 'OFF' | 'CONTEXT' | 'TRACK'
    this.isScrubbing = false;
    this.searchTimeout = null;
    this.trackPendingForPlaylist = null;

    this._inicializarElementosDOM();
    this._vincularEventosAudio();
    this._vincularEventosUI();
    this._actualizarUIPerfil();
    this._cargarListasUI();
    this._registrarServiceWorker();
  }

  _registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('[PWA] Error registrando ServiceWorker:', err);
        });
      });
    }
  }

  _inicializarElementosDOM() {
    this.dom = {
      // Perfil
      btnPerfilSelector: document.getElementById('btnPerfilSelector'),
      txtPerfilAvatar: document.getElementById('txtPerfilAvatar'),
      txtPerfilNombre: document.getElementById('txtPerfilNombre'),
      dialogPerfiles: document.getElementById('dialogPerfiles'),
      listaPerfilesDialog: document.getElementById('listaPerfilesDialog'),
      btnCrearNuevoPerfil: document.getElementById('btnCrearNuevoPerfil'),
      btnCerrarDialogPerfiles: document.getElementById('btnCerrarDialogPerfiles'),

      // Navegación
      navItems: document.querySelectorAll('.nav-item'),
      viewSections: document.querySelectorAll('.view-section'),

      // Buscador
      inputSearch: document.getElementById('inputSearch'),
      searchResultsList: document.getElementById('searchResultsList'),

      // Listas
      btnCrearLista: document.getElementById('btnCrearLista'),
      playlistGridContainer: document.getElementById('playlistGridContainer'),
      playlistTracksContainer: document.getElementById('playlistTracksContainer'),
      btnVolverListas: document.getElementById('btnVolverListas'),
      txtPlaylistNombre: document.getElementById('txtPlaylistNombre'),
      playlistItemsList: document.getElementById('playlistItemsList'),

      // Diálogo Agregar a Lista
      dialogAgregarALista: document.getElementById('dialogAgregarALista'),
      listasParaAgregarDialog: document.getElementById('listasParaAgregarDialog'),
      btnCerrarDialogAgregar: document.getElementById('btnCerrarDialogAgregar'),

      // Mini Player
      miniPlayer: document.getElementById('miniPlayer'),
      miniThumb: document.getElementById('miniThumb'),
      miniInfoZone: document.getElementById('miniInfoZone'),
      miniTitle: document.getElementById('miniTitle'),
      miniArtist: document.getElementById('miniArtist'),
      btnMiniPlayPause: document.getElementById('btnMiniPlayPause'),
      btnMiniFavorite: document.getElementById('btnMiniFavorite'),

      // Modal Reproductor Completo
      playerModal: document.getElementById('playerModal'),
      btnCerrarModal: document.getElementById('btnCerrarModal'),
      vinylDisc: document.getElementById('vinylDisc'),
      modalCover: document.getElementById('modalCover'),
      modalTitle: document.getElementById('modalTitle'),
      modalArtist: document.getElementById('modalArtist'),
      modalSeekSlider: document.getElementById('modalSeekSlider'),
      lblCurrentTime: document.getElementById('lblCurrentTime'),
      lblTotalTime: document.getElementById('lblTotalTime'),
      btnModalPlayPause: document.getElementById('btnModalPlayPause'),
      btnModalPrev: document.getElementById('btnModalPrev'),
      btnModalNext: document.getElementById('btnModalNext'),
      btnModalShuffle: document.getElementById('btnModalShuffle'),
      btnModalRepeat: document.getElementById('btnModalRepeat'),
      btnModalFavorite: document.getElementById('btnModalFavorite'),
      btnModalAddPlaylist: document.getElementById('btnModalAddPlaylist'),
      btnIrALetras: document.getElementById('btnIrALetras'),

      // Letras
      txtLyricsTrackInfo: document.getElementById('txtLyricsTrackInfo'),
      lyricsContentList: document.getElementById('lyricsContentList')
    };
  }

  _vincularEventosAudio() {
    this.audio.on('stateChange', (state) => {
      const isPlaying = (state === PlaybackState.PLAYING);
      this.dom.btnMiniPlayPause.textContent = isPlaying ? '⏸' : '▶';
      this.dom.btnModalPlayPause.textContent = isPlaying ? '⏸' : '▶';
      if (this.dom.vinylDisc) {
        this.dom.vinylDisc.classList.toggle('playing', isPlaying);
      }
    });

    this.audio.on('timeUpdate', ({ currentTime, duration }) => {
      if (!this.isScrubbing) {
        const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
        this.dom.modalSeekSlider.value = percent;
        this.dom.modalSeekSlider.style.setProperty('--progress', `${percent}%`);
        this.dom.lblCurrentTime.textContent = this._formatearTiempo(currentTime);
        this.dom.lblTotalTime.textContent = this._formatearTiempo(duration);
      }

      // Sincronizar letra activa
      const lineIndex = this.lyrics.getIndiceActivo(currentTime);
      if (lineIndex !== -1) {
        const lineElements = this.dom.lyricsContentList.querySelectorAll('.lyrics-line');
        lineElements.forEach((el, idx) => {
          if (idx === lineIndex) {
            if (!el.classList.contains('active')) {
              el.classList.add('active');
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else {
            el.classList.remove('active');
          }
        });
      }
    });

    this.audio.on('ended', () => {
      this.reproducirSiguiente();
    });

    this.audio.on('error', (err) => {
      console.warn('[YouTube Player Error]:', err);
      // Auto-recuperación silenciosa: si falla, salta al siguiente de inmediato sin interrumpir con alertas
      this.reproducirSiguiente();
    });

    // Enlazar controles nativos de la pantalla de bloqueo de iOS
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.reproducirAnterior());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.reproducirSiguiente());
    }
  }

  _vincularEventosUI() {
    // 1. Navegación por Pestañas (Tabs)
    this.dom.navItems.forEach((item) => {
      item.addEventListener('click', () => {
        this.dom.navItems.forEach(i => i.classList.remove('active'));
        this.dom.viewSections.forEach(s => s.classList.remove('active'));

        item.classList.add('active');
        const viewId = item.dataset.view;
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');

        if (viewId === 'viewPlaylists') {
          this._cargarListasUI();
        }
      });
    });

    // 2. Buscador en Vivo con Debounce
    this.dom.inputSearch.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      const query = e.target.value;
      if (query.trim().length < 2) return;

      this.searchTimeout = setTimeout(async () => {
        this.dom.searchResultsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Buscando en YouTube...</p>';
        const resultados = await this.search.buscar(query);
        this._renderizarResultadosBusqueda(resultados);
      }, 400);
    });

    // 3. Mini Player y Modal Completo
    this.dom.miniInfoZone.addEventListener('click', () => {
      this.dom.playerModal.classList.add('open');
    });

    this.dom.btnCerrarModal.addEventListener('click', () => {
      this.dom.playerModal.classList.remove('open');
    });

    this.dom.btnMiniPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlayPause();
    });

    this.dom.btnModalPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.dom.btnModalNext.addEventListener('click', () => this.reproducirSiguiente());
    this.dom.btnModalPrev.addEventListener('click', () => this.reproducirAnterior());

    // 4. Scrubbing / Salto temporal en la barra
    this.dom.modalSeekSlider.addEventListener('input', () => {
      this.isScrubbing = true;
    });

    this.dom.modalSeekSlider.addEventListener('change', (e) => {
      const porcentaje = parseFloat(e.target.value);
      const duracion = this.audio.getDuration() || 0;
      this.audio.seek((porcentaje / 100) * duracion);
      this.isScrubbing = false;
    });

    // 4.1 Clic en el disco de vinilo para pausar/reanudar
    if (this.dom.vinylDisc) {
      this.dom.vinylDisc.addEventListener('click', () => {
        this.togglePlayPause();
      });
    }

    // 5. Shuffle y Repeat
    this.dom.btnModalShuffle.addEventListener('click', () => {
      this.isShuffle = !this.isShuffle;
      this.dom.btnModalShuffle.classList.toggle('active', this.isShuffle);
    });

    this.dom.btnModalRepeat.addEventListener('click', () => {
      if (this.repeatMode === 'OFF') {
        this.repeatMode = 'CONTEXT';
        this.dom.btnModalRepeat.classList.add('active');
        this.dom.btnModalRepeat.textContent = '🔁';
      } else if (this.repeatMode === 'CONTEXT') {
        this.repeatMode = 'TRACK';
        this.dom.btnModalRepeat.textContent = '🔂';
      } else {
        this.repeatMode = 'OFF';
        this.dom.btnModalRepeat.classList.remove('active');
        this.dom.btnModalRepeat.textContent = '🔁';
      }
    });

    // 6. Favoritos
    this.dom.btnMiniFavorite.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleFavoritoActivo();
    });

    this.dom.btnModalFavorite.addEventListener('click', () => {
      this._toggleFavoritoActivo();
    });

    // 7. Perfiles
    this.dom.btnPerfilSelector.addEventListener('click', () => this._abrirDialogPerfiles());
    this.dom.btnCerrarDialogPerfiles.addEventListener('click', () => {
      this.dom.dialogPerfiles.classList.remove('open');
    });
    this.dom.btnCrearNuevoPerfil.addEventListener('click', () => {
      const nombre = prompt('Nombre del nuevo perfil:');
      if (nombre) {
        const nuevo = this.storage.agregarPerfil(nombre);
        if (nuevo) {
          this.storage.cambiarPerfil(nuevo.id);
          this._actualizarUIPerfil();
          this._cargarListasUI();
          this.dom.dialogPerfiles.classList.remove('open');
        }
      }
    });

    // 8. Crear Listas
    this.dom.btnCrearLista.addEventListener('click', () => {
      const nombre = prompt('Nombre de la nueva lista:');
      if (nombre) {
        this.storage.crearLista(nombre);
        this._cargarListasUI();
      }
    });

    this.dom.btnVolverListas.addEventListener('click', () => {
      this.dom.playlistTracksContainer.style.display = 'none';
      this.dom.playlistGridContainer.style.display = 'grid';
    });

    this.dom.btnModalAddPlaylist.addEventListener('click', () => {
      if (this.activeTrack) {
        this._abrirDialogAgregarALista(this.activeTrack);
      }
    });

    this.dom.btnCerrarDialogAgregar.addEventListener('click', () => {
      this.dom.dialogAgregarALista.classList.remove('open');
    });

    this.dom.btnIrALetras.addEventListener('click', () => {
      this.dom.playerModal.classList.remove('open');
      document.querySelector('[data-view="viewLyrics"]').click();
    });
  }

  _renderizarResultadosBusqueda(resultados) {
    this.dom.searchResultsList.innerHTML = '';
    if (resultados.length === 0) {
      this.dom.searchResultsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron resultados.</p>';
      return;
    }

    resultados.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = 'track-item';
      item.innerHTML = `
        <img src="${track.thumbnail}" alt="Thumb" class="track-thumb">
        <div class="track-details">
          <div class="track-name">${track.title}</div>
          <div class="track-artist">${track.artist} • ${track.duration}</div>
        </div>
        <div class="track-actions">
          <button type="button" class="icon-btn btn-add-pl" title="Agregar a lista">➕</button>
        </div>
      `;

      item.querySelector('.btn-add-pl').addEventListener('click', (e) => {
        e.stopPropagation();
        this._abrirDialogAgregarALista(track);
      });

      item.addEventListener('click', () => {
        this.currentQueue = [...resultados];
        this.currentIndex = index;
        this.cargarYReproducir(track);
      });

      this.dom.searchResultsList.appendChild(item);
    });
  }

  cargarYReproducir(track) {
    if (!track) return;
    this.activeTrack = track;

    // Abrir modal y actualizar UI
    this.dom.playerModal.classList.add('open');
    this.dom.miniPlayer.style.display = 'flex';
    this.dom.miniTitle.textContent = track.title;
    this.dom.miniArtist.textContent = track.artist;
    this.dom.miniThumb.src = track.thumbnail;

    this.dom.modalTitle.textContent = track.title;
    this.dom.modalArtist.textContent = track.artist;
    this.dom.modalCover.src = track.thumbnail;

    this._actualizarBotonFavoritos();

    // Reproducir en YouTube
    this.audio.loadVideo(track.id, track);

    // Cargar Letras de fondo
    this._cargarLetrasPista(track);
  }

  async _cargarLetrasPista(track) {
    this.dom.txtLyricsTrackInfo.textContent = `${track.title} — ${track.artist}`;
    this.dom.lyricsContentList.innerHTML = '<p class="lyrics-line">Cargando letra sincronizada...</p>';

    const data = await this.lyrics.obtenerLetra(track.title, track.artist);
    this.dom.lyricsContentList.innerHTML = '';

    if (this.lyrics.currentLines.length > 0) {
      this.lyrics.currentLines.forEach((l) => {
        const p = document.createElement('p');
        p.className = 'lyrics-line';
        p.textContent = l.text;
        p.addEventListener('click', () => {
          this.audio.seek(l.time);
        });
        this.dom.lyricsContentList.appendChild(p);
      });
    } else {
      const p = document.createElement('p');
      p.className = 'lyrics-line active';
      p.style.whiteSpace = 'pre-line';
      p.textContent = data.plainLyrics || 'Letra no disponible para esta pista.';
      this.dom.lyricsContentList.appendChild(p);
    }
  }

  togglePlayPause() {
    if (this.audio.currentState === PlaybackState.PLAYING) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
  }

  reproducirSiguiente() {
    if (this.currentQueue.length === 0) return;

    if (this.repeatMode === 'TRACK' && this.activeTrack) {
      this.cargarYReproducir(this.activeTrack);
      return;
    }

    if (this.isShuffle) {
      this.currentIndex = Math.floor(Math.random() * this.currentQueue.length);
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.currentQueue.length) {
        if (this.repeatMode === 'CONTEXT') {
          this.currentIndex = 0;
        } else {
          return; // Fin de reproducción
        }
      }
    }

    const nextTrack = this.currentQueue[this.currentIndex];
    if (nextTrack) this.cargarYReproducir(nextTrack);
  }

  reproducirAnterior() {
    if (this.currentQueue.length === 0) return;
    this.currentIndex = Math.max(0, this.currentIndex - 1);
    const prevTrack = this.currentQueue[this.currentIndex];
    if (prevTrack) this.cargarYReproducir(prevTrack);
  }

  _toggleFavoritoActivo() {
    if (!this.activeTrack) return;
    const esFav = this.storage.toggleFavorito(this.activeTrack);
    this._actualizarBotonFavoritos();
  }

  _actualizarBotonFavoritos() {
    if (!this.activeTrack) return;
    const esFav = this.storage.esFavorito(this.activeTrack.id);
    this.dom.btnMiniFavorite.textContent = esFav ? '❤️' : '🤍';
    this.dom.btnModalFavorite.textContent = esFav ? '❤️' : '🤍';
  }

  _cargarListasUI() {
    const listas = this.storage.getListas();
    const favoritos = this.storage.getFavoritos();

    this.dom.playlistGridContainer.innerHTML = '';

    // Tarjeta Especial de Canciones Favoritas
    const favCard = document.createElement('div');
    favCard.className = 'playlist-card';
    favCard.style.background = 'linear-gradient(135deg, #450af5, #c4efd9)';
    favCard.innerHTML = `
      <h4 style="color: #fff;">❤️ Favoritos</h4>
      <span style="color: rgba(255,255,255,0.8);">${favoritos.length} canciones</span>
    `;
    favCard.addEventListener('click', () => {
      this._mostrarPistasDeLista({ id: 'favs', name: 'Canciones Favoritas', tracks: favoritos });
    });
    this.dom.playlistGridContainer.appendChild(favCard);

    listas.forEach((pl) => {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.innerHTML = `
        <h4>📁 ${pl.name}</h4>
        <span>${pl.tracks.length} canciones</span>
      `;
      card.addEventListener('click', () => {
        this._mostrarPistasDeLista(pl);
      });
      this.dom.playlistGridContainer.appendChild(card);
    });
  }

  _mostrarPistasDeLista(playlist) {
    this.dom.playlistGridContainer.style.display = 'none';
    this.dom.playlistTracksContainer.style.display = 'block';
    this.dom.txtPlaylistNombre.textContent = playlist.name;
    this.dom.playlistItemsList.innerHTML = '';

    if (playlist.tracks.length === 0) {
      this.dom.playlistItemsList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Esta lista no tiene canciones aún.</p>';
      return;
    }

    playlist.tracks.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = 'track-item';
      item.innerHTML = `
        <img src="${track.thumbnail}" alt="Thumb" class="track-thumb">
        <div class="track-details">
          <div class="track-name">${track.title}</div>
          <div class="track-artist">${track.artist}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        this.currentQueue = [...playlist.tracks];
        this.currentIndex = index;
        this.cargarYReproducir(track);
      });
      this.dom.playlistItemsList.appendChild(item);
    });
  }

  _abrirDialogAgregarALista(track) {
    this.trackPendingForPlaylist = track;
    const listas = this.storage.getListas();
    this.dom.listasParaAgregarDialog.innerHTML = '';

    if (listas.length === 0) {
      this.dom.listasParaAgregarDialog.innerHTML = '<p style="color: var(--text-muted); padding: 10px;">Crea una lista primero.</p>';
    } else {
      listas.forEach((pl) => {
        const item = document.createElement('div');
        item.className = 'dialog-item';
        item.textContent = `📁 ${pl.name}`;
        item.addEventListener('click', () => {
          this.storage.agregarPistaALista(pl.id, track);
          this.dom.dialogAgregarALista.classList.remove('open');
          alert(`Agregada a "${pl.name}"`);
        });
        this.dom.listasParaAgregarDialog.appendChild(item);
      });
    }
    this.dom.dialogAgregarALista.classList.add('open');
  }

  _abrirDialogPerfiles() {
    const perfiles = this.storage.getPerfiles();
    const activo = this.storage.getPerfilActivo();
    this.dom.listaPerfilesDialog.innerHTML = '';

    perfiles.forEach((p) => {
      const item = document.createElement('div');
      item.className = `dialog-item ${p.id === activo.id ? 'active' : ''}`;
      item.innerHTML = `<span>${p.avatar}</span> <strong>${p.name}</strong>`;
      item.addEventListener('click', () => {
        this.storage.cambiarPerfil(p.id);
        this._actualizarUIPerfil();
        this._cargarListasUI();
        this.dom.dialogPerfiles.classList.remove('open');
      });
      this.dom.listaPerfilesDialog.appendChild(item);
    });
    this.dom.dialogPerfiles.classList.add('open');
  }

  _actualizarUIPerfil() {
    const activo = this.storage.getPerfilActivo();
    this.dom.txtPerfilAvatar.textContent = activo.avatar;
    this.dom.txtPerfilNombre.textContent = activo.name;
  }

  _formatearTiempo(segundos) {
    if (isNaN(segundos)) return '0:00';
    const min = Math.floor(segundos / 60);
    const seg = Math.floor(segundos % 60);
    return `${min}:${seg < 10 ? '0' : ''}${seg}`;
  }
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
