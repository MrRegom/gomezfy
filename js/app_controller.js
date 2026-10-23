/**
 * app_controller.js - Orquestador UI con Alta Sensibilidad Táctil y Experiencia Spotify Mobile.
 * Responsabilidad Única: Coordinar vistas, buscador reactivo, mini-player y controles de reproducción.
 */
import { AudioEngine, PlaybackState } from './audio_engine.js';
import { StorageService } from './storage_service.js';
import { LyricsService } from './lyrics_service.js';
import { SearchService } from './search_service.js';

export class AppController {
  constructor() {
    this.audio = new AudioEngine('yt-player-container');
    this.storage = new StorageService();
    this.lyrics = new LyricsService();
    this.search = new SearchService();

    this.activeTrack = null;
    this.currentQueue = [];
    this.currentIndex = -1;
    this.isShuffle = false;
    this.repeatMode = 'OFF';
    this.isScrubbing = false;
    this.searchTimeout = null;

    this._vincularElementosDOM();
    this._vincularEventosAudio();
    this._vincularEventosUI();
    this._actualizarUIPerfil();
    this._cargarListasUI();
  }

  _vincularElementosDOM() {
    this.dom = {
      // Perfil
      btnPerfilSelector: document.getElementById('btnPerfilSelector'),
      txtPerfilAvatar: document.getElementById('txtPerfilAvatar'),
      txtPerfilNombre: document.getElementById('txtPerfilNombre'),
      dialogPerfiles: document.getElementById('dialogPerfiles'),
      listaPerfilesDialog: document.getElementById('listaPerfilesDialog'),
      btnCrearNuevoPerfil: document.getElementById('btnCrearNuevoPerfil'),
      btnCerrarDialogPerfiles: document.getElementById('btnCerrarDialogPerfiles'),

      // Filtros rápidos
      categoryPills: document.querySelectorAll('.category-pill'),

      // Vistas y Navegación
      navItems: document.querySelectorAll('.nav-item'),
      viewSections: document.querySelectorAll('.view-section'),

      // Buscador
      inputSearch: document.getElementById('inputSearch'),
      searchResultsList: document.getElementById('searchResultsList'),
      sectionHeaderQuick: document.getElementById('sectionHeaderQuick'),

      // Listas / Biblioteca
      btnCrearLista: document.getElementById('btnCrearLista'),
      playlistGridContainer: document.getElementById('playlistGridContainer'),
      playlistTracksContainer: document.getElementById('playlistTracksContainer'),
      btnVolverListas: document.getElementById('btnVolverListas'),
      txtPlaylistNombre: document.getElementById('txtPlaylistNombre'),
      playlistItemsList: document.getElementById('playlistItemsList'),
      dialogAgregarALista: document.getElementById('dialogAgregarALista'),
      listasParaAgregarDialog: document.getElementById('listasParaAgregarDialog'),
      btnCerrarDialogAgregar: document.getElementById('btnCerrarDialogAgregar'),

      // Mini Player Flotante
      miniPlayer: document.getElementById('miniPlayer'),
      miniThumb: document.getElementById('miniThumb'),
      miniInfoZone: document.getElementById('miniInfoZone'),
      miniTitle: document.getElementById('miniTitle'),
      miniArtist: document.getElementById('miniArtist'),
      btnMiniPlayPause: document.getElementById('btnMiniPlayPause'),
      btnMiniFavorite: document.getElementById('btnMiniFavorite'),
      miniProgressFill: document.getElementById('miniProgressFill'),

      // Modal Reproductor Completo (Estilo Spotify)
      playerModal: document.getElementById('playerModal'),
      ambientBackdrop: document.getElementById('ambientBackdrop'),
      btnCerrarModal: document.getElementById('btnCerrarModal'),
      modalCover: document.getElementById('modalCover'),
      modalTitle: document.getElementById('modalTitle'),
      modalArtist: document.getElementById('modalArtist'),
      headerSongSubtitle: document.getElementById('headerSongSubtitle'),
      modalSeekSlider: document.getElementById('modalSeekSlider'),
      lblCurrentTime: document.getElementById('lblCurrentTime'),
      lblTotalTime: document.getElementById('lblTotalTime'),
      btnModalPlayPause: document.getElementById('btnModalPlayPause'),
      svgPlayIcon: document.getElementById('svgPlayIcon'),
      svgPauseIcon: document.getElementById('svgPauseIcon'),
      btnModalPrev: document.getElementById('btnModalPrev'),
      btnModalNext: document.getElementById('btnModalNext'),
      btnModalShuffle: document.getElementById('btnModalShuffle'),
      btnModalRepeat: document.getElementById('btnModalRepeat'),
      btnModalFavorite: document.getElementById('btnModalFavorite'),
      btnModalAddPlaylist: document.getElementById('btnModalAddPlaylist'),
      btnIrALetras: document.getElementById('btnIrALetras'),
      lyricsCardPreviewText: document.getElementById('lyricsCardPreviewText'),

      // Letras
      txtLyricsTrackInfo: document.getElementById('txtLyricsTrackInfo'),
      lyricsContentList: document.getElementById('lyricsContentList')
    };
  }

  _vincularEventosAudio() {
    this.audio.on('stateChange', (state) => {
      const isPlaying = (state === PlaybackState.PLAYING);
      this._actualizarBotonPlayPause(isPlaying);
    });

    this.audio.on('timeUpdate', ({ currentTime, duration }) => {
      if (!this.isScrubbing) {
        const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
        this.dom.modalSeekSlider.value = percent;
        this.dom.modalSeekSlider.style.setProperty('--progress', `${percent}%`);
        
        if (this.dom.miniProgressFill) {
          this.dom.miniProgressFill.style.width = `${percent}%`;
        }

        this.dom.lblCurrentTime.textContent = this._formatearTiempo(currentTime);
        
        // Formato Spotify con countdown negativo
        const restante = Math.max(0, duration - currentTime);
        this.dom.lblTotalTime.textContent = duration > 0 ? `-${this._formatearTiempo(restante)}` : '0:00';
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
      console.warn('[Reproductor Error]:', err);
      this.reproducirSiguiente();
    });

    // Control sin inversión de estado en la pantalla de bloqueo de iOS
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        this._actualizarBotonPlayPause(true);
        this.audio.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this._actualizarBotonPlayPause(false);
        this.audio.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => this.reproducirAnterior());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.reproducirSiguiente());
    }
  }

  _vincularEventosUI() {
    const haptic = () => { if (navigator.vibrate) navigator.vibrate(8); };

    // 1. Píldoras de Filtro Superior (Estilo Spotify)
    this.dom.categoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        haptic();
        this.dom.categoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const genre = pill.dataset.genre;
        if (genre) {
          this.dom.inputSearch.value = genre;
          this._ejecutarBusqueda(genre);
        }
      });
    });

    // 2. Navegación por Pestañas (Tabs)
    this.dom.navItems.forEach((item) => {
      item.addEventListener('click', () => {
        haptic();
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

    // 3. Buscador en Vivo con Debounce Rápido
    this.dom.inputSearch.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      const query = e.target.value;
      if (query.trim().length < 2) return;

      this.searchTimeout = setTimeout(() => {
        this._ejecutarBusqueda(query);
      }, 350);
    });

    // 4. Mini Player y Modal Completo
    this.dom.miniInfoZone.addEventListener('click', () => {
      haptic();
      this.dom.playerModal.classList.add('open');
    });

    this.dom.btnCerrarModal.addEventListener('click', () => {
      haptic();
      this.dom.playerModal.classList.remove('open');
    });

    this.dom.btnMiniPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlayPause();
    });

    this.dom.btnModalPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.dom.btnModalNext.addEventListener('click', () => this.reproducirSiguiente());
    this.dom.btnModalPrev.addEventListener('click', () => this.reproducirAnterior());

    // 5. Scrubbing en Barra de Tiempo
    this.dom.modalSeekSlider.addEventListener('input', () => {
      this.isScrubbing = true;
    });

    this.dom.modalSeekSlider.addEventListener('change', (e) => {
      const porcentaje = parseFloat(e.target.value);
      const duracion = this.audio.getDuration() || 0;
      this.audio.seek((porcentaje / 100) * duracion);
      this.isScrubbing = false;
    });

    // 6. Shuffle y Repeat
    this.dom.btnModalShuffle.addEventListener('click', () => {
      haptic();
      this.isShuffle = !this.isShuffle;
      this.dom.btnModalShuffle.classList.toggle('active', this.isShuffle);
    });

    this.dom.btnModalRepeat.addEventListener('click', () => {
      haptic();
      if (this.repeatMode === 'OFF') {
        this.repeatMode = 'CONTEXT';
        this.dom.btnModalRepeat.classList.add('active');
      } else if (this.repeatMode === 'CONTEXT') {
        this.repeatMode = 'TRACK';
      } else {
        this.repeatMode = 'OFF';
        this.dom.btnModalRepeat.classList.remove('active');
      }
    });

    // 7. Favoritos
    this.dom.btnMiniFavorite.addEventListener('click', (e) => {
      e.stopPropagation();
      haptic();
      this._toggleFavoritoActivo();
    });

    this.dom.btnModalFavorite.addEventListener('click', () => {
      haptic();
      this._toggleFavoritoActivo();
    });

    // 8. Perfiles
    this.dom.btnPerfilSelector.addEventListener('click', () => {
      haptic();
      this._abrirDialogPerfiles();
    });

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

    // 9. Crear Listas
    this.dom.btnCrearLista.addEventListener('click', () => {
      haptic();
      const nombre = prompt('Nombre de la nueva lista:');
      if (nombre) {
        this.storage.crearLista(nombre);
        this._cargarListasUI();
      }
    });

    this.dom.btnVolverListas.addEventListener('click', () => {
      haptic();
      this.dom.playlistTracksContainer.style.display = 'none';
      this.dom.playlistGridContainer.style.display = 'grid';
    });

    this.dom.btnModalAddPlaylist.addEventListener('click', () => {
      haptic();
      if (this.activeTrack) {
        this._abrirDialogAgregarALista(this.activeTrack);
      }
    });

    this.dom.btnCerrarDialogAgregar.addEventListener('click', () => {
      this.dom.dialogAgregarALista.classList.remove('open');
    });

    // 10. Vista Previa de Letras (Expandir)
    this.dom.btnIrALetras.addEventListener('click', () => {
      haptic();
      this.dom.playerModal.classList.remove('open');
      document.querySelector('[data-view="viewLyrics"]').click();
    });
  }

  async _ejecutarBusqueda(query) {
    this.dom.searchResultsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 30px;">Buscando música...</p>';
    const resultados = await this.search.buscar(query);
    this._renderizarResultadosBusqueda(resultados);
  }

  _renderizarResultadosBusqueda(resultados) {
    this.dom.searchResultsList.innerHTML = '';
    if (resultados.length === 0) {
      this.dom.searchResultsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 30px;">No se encontraron resultados.</p>';
      return;
    }

    resultados.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = 'track-item';
      item.innerHTML = `
        <img src="${track.thumbnail}" alt="Thumb" class="track-thumb" loading="lazy">
        <div class="track-details">
          <div class="track-name">${track.title}</div>
          <div class="track-artist">${track.artist} • ${track.duration}</div>
        </div>
        <div class="track-actions">
          <button type="button" class="btn-add-pl" title="Agregar a lista">➕</button>
        </div>
      `;

      item.querySelector('.btn-add-pl').addEventListener('click', (e) => {
        e.stopPropagation();
        if (navigator.vibrate) navigator.vibrate(8);
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
    if (navigator.vibrate) navigator.vibrate(10);
    this.activeTrack = track;

    // Actualización visual instantánea (Optimistic UI Cero Latencia)
    this._actualizarBotonPlayPause(true);
    this.dom.playerModal.classList.add('open');
    this.dom.miniPlayer.style.display = 'flex';
    this.dom.miniTitle.textContent = track.title;
    this.dom.miniArtist.textContent = track.artist;
    this.dom.miniThumb.src = track.thumbnail;

    this.dom.modalTitle.textContent = track.title;
    this.dom.modalArtist.textContent = track.artist;
    this.dom.headerSongSubtitle.textContent = track.artist;
    this.dom.modalCover.src = track.thumbnail;

    this._actualizarBotonFavoritos();

    // Reproducción directa e inmediata en el motor
    this.audio.loadVideo(track.id, track);

    // Cargar Letras de fondo
    this._cargarLetrasPista(track);
  }

  async _cargarLetrasPista(track) {
    this.dom.txtLyricsTrackInfo.textContent = `${track.title} — ${track.artist}`;
    this.dom.lyricsContentList.innerHTML = '<p class="lyrics-line">Cargando letra sincronizada...</p>';
    this.dom.lyricsCardPreviewText.textContent = 'Cargando letra...';

    const data = await this.lyrics.obtenerLetra(track.title, track.artist);
    this.dom.lyricsContentList.innerHTML = '';

    if (this.lyrics.currentLines.length > 0) {
      const primera = this.lyrics.currentLines[0].text;
      this.dom.lyricsCardPreviewText.textContent = primera ? `“${primera}”` : 'Toca para ver la letra';

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
      this.dom.lyricsCardPreviewText.textContent = 'Toca para leer la letra completa';
    }
  }

  _actualizarBotonPlayPause(isPlaying) {
    this.dom.btnMiniPlayPause.textContent = isPlaying ? '⏸' : '▶';
    if (this.dom.svgPlayIcon && this.dom.svgPauseIcon) {
      this.dom.svgPlayIcon.style.display = isPlaying ? 'none' : 'block';
      this.dom.svgPauseIcon.style.display = isPlaying ? 'block' : 'none';
    }
  }

  togglePlayPause() {
    if (navigator.vibrate) navigator.vibrate(8);
    const currentlyPlaying = (this.audio.currentState === PlaybackState.PLAYING);
    
    // Conmutación inmediata en la interfaz sin esperar la respuesta del reproductor
    this._actualizarBotonPlayPause(!currentlyPlaying);

    if (currentlyPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
  }

  reproducirSiguiente() {
    if (this.currentQueue.length === 0) return;
    if (navigator.vibrate) navigator.vibrate(8);

    if (this.repeatMode === 'TRACK' && this.activeTrack) {
      this.cargarYReproducir(this.activeTrack);
      return;
    }

    if (this.isShuffle) {
      this.currentIndex = Math.floor(Math.random() * this.currentQueue.length);
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.currentQueue.length) {
        this.currentIndex = 0;
      }
    }

    this.cargarYReproducir(this.currentQueue[this.currentIndex]);
  }

  reproducirAnterior() {
    if (this.currentQueue.length === 0) return;
    if (navigator.vibrate) navigator.vibrate(8);

    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = this.currentQueue.length - 1;
    }

    this.cargarYReproducir(this.currentQueue[this.currentIndex]);
  }

  _formatearTiempo(segundos) {
    if (isNaN(segundos) || segundos < 0) return '0:00';
    const mins = Math.floor(segundos / 60);
    const secs = Math.floor(segundos % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _actualizarBotonFavoritos() {
    if (!this.activeTrack) return;
    const esFav = this.storage.esFavorito(this.activeTrack.id);
    this.dom.btnMiniFavorite.textContent = esFav ? '💚' : '🤍';
    this.dom.btnModalFavorite.textContent = esFav ? '💚' : '🤍';
    this.dom.btnModalFavorite.classList.toggle('active', esFav);
  }

  _toggleFavoritoActivo() {
    if (!this.activeTrack) return;
    this.storage.toggleFavorito(this.activeTrack);
    this._actualizarBotonFavoritos();
    this._cargarListasUI();
  }

  _actualizarUIPerfil() {
    const perfil = this.storage.getPerfilActivo();
    this.dom.txtPerfilAvatar.textContent = perfil.avatar;
    this.dom.txtPerfilNombre.textContent = perfil.name;
  }

  _abrirDialogPerfiles() {
    const perfiles = this.storage.getPerfiles();
    const activo = this.storage.getPerfilActivo();
    this.dom.listaPerfilesDialog.innerHTML = '';

    perfiles.forEach((p) => {
      const item = document.createElement('div');
      item.className = `dialog-item ${p.id === activo.id ? 'active' : ''}`;
      item.innerHTML = `<span>${p.avatar}</span><strong>${p.name}</strong>`;
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

  _cargarListasUI() {
    const listas = this.storage.getListas();
    const favoritos = this.storage.getFavoritos();
    this.dom.playlistGridContainer.innerHTML = '';

    const favCard = document.createElement('div');
    favCard.className = 'playlist-card';
    favCard.style.background = 'linear-gradient(135deg, #450af5 0%, #8e8ee5 100%)';
    favCard.innerHTML = `
      <div style="font-size: 1.5rem; margin-bottom: 8px;">💚</div>
      <div style="font-weight: 700;">Tus Me Gusta</div>
      <div style="font-size: 0.75rem; opacity: 0.8;">${favoritos.length} canciones</div>
    `;
    favCard.addEventListener('click', () => {
      this._mostrarPistasDeLista({ name: 'Tus Me Gusta', tracks: favoritos });
    });
    this.dom.playlistGridContainer.appendChild(favCard);

    listas.forEach((pl) => {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.innerHTML = `
        <div style="font-size: 1.5rem; margin-bottom: 8px;">🎵</div>
        <div style="font-weight: 700;">${pl.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${pl.tracks.length} canciones</div>
      `;
      card.addEventListener('click', () => {
        this._mostrarPistasDeLista(pl);
      });
      this.dom.playlistGridContainer.appendChild(card);
    });
  }

  _mostrarPistasDeLista(lista) {
    this.dom.txtPlaylistNombre.textContent = lista.name;
    this.dom.playlistItemsList.innerHTML = '';

    if (lista.tracks.length === 0) {
      this.dom.playlistItemsList.innerHTML = '<p style="color: var(--text-muted); padding: 16px;">Esta lista no tiene canciones aún.</p>';
    } else {
      lista.tracks.forEach((track, index) => {
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
          this.currentQueue = [...lista.tracks];
          this.currentIndex = index;
          this.cargarYReproducir(track);
        });
        this.dom.playlistItemsList.appendChild(item);
      });
    }

    this.dom.playlistGridContainer.style.display = 'none';
    this.dom.playlistTracksContainer.style.display = 'block';
  }

  _abrirDialogAgregarALista(track) {
    const listas = this.storage.getListas();
    this.dom.listasParaAgregarDialog.innerHTML = '';

    if (listas.length === 0) {
      this.dom.listasParaAgregarDialog.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No tienes listas creadas aún.</p>';
    } else {
      listas.forEach((pl) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-primary';
        btn.style.width = '100%';
        btn.style.background = 'var(--bg-card)';
        btn.style.color = '#fff';
        btn.style.marginBottom = '8px';
        btn.textContent = pl.name;
        btn.addEventListener('click', () => {
          this.storage.agregarPistaALista(pl.id, track);
          this.dom.dialogAgregarALista.classList.remove('open');
          this._cargarListasUI();
        });
        this.dom.listasParaAgregarDialog.appendChild(btn);
      });
    }

    this.dom.dialogAgregarALista.classList.add('open');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
