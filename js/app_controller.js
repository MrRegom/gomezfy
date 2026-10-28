/**
 * AppController - GomezTube
 * Responsabilidad Única: Controlador orquestador de interfaz de usuario, navegación,
 * transiciones de vistas (Feed / Watch 2 Columnas / Biblioteca) y búsqueda instantánea.
 * Implementa Clean Architecture desacoplando eventos, almacenamiento y servicios.
 */

import { SearchService } from './search_service.js';
import { StorageService } from './storage_service.js';
import { VideoPlayer } from './video_player.js';
import { ICONS } from './ui_icons.js';
import { PARACAS_ALBUM, NOMAD_WORSHIP_FEATURED } from './featured_collections.js';

export class AppController {
  constructor() {
    // Referencias principales del DOM
    this.theaterContainer = document.getElementById('watchPlayerTheater');
    this.detailsContainer = document.getElementById('watchVideoDetails');
    this.relatedListContainer = document.getElementById('watchRelatedList');
    this.btnCloseWatchView = document.getElementById('btnCloseWatchView');

    this.btnMenuToggle = document.getElementById('btnMenuToggle');
    this.btnLogoHome = document.getElementById('btnLogoHome');
    this.ytSidebar = document.getElementById('ytSidebar');
    this.sidebarBackdrop = document.getElementById('sidebarBackdrop');

    this.inputSearch = document.getElementById('inputSearch');
    this.btnClearSearch = document.getElementById('btnClearSearch');
    this.btnSearchSubmit = document.getElementById('btnSearchSubmit');
    this.btnVoiceSearch = document.getElementById('btnVoiceSearch');

    this.featuredShelf = document.getElementById('featuredShelf');
    this.sectionTitle = document.getElementById('sectionTitle');
    this.videoGrid = document.getElementById('videoGrid');
    this.categoryChips = document.querySelectorAll('.yt-chip');

    // Navegación y Vistas
    this.views = {
      feed: document.getElementById('viewFeed'),
      watch: document.getElementById('viewWatch'),
      library: document.getElementById('viewLibrary')
    };

    this.navButtons = document.querySelectorAll('.yt-guide-item, .nav-tab-btn');

    // Sub-vistas de biblioteca
    this.btnTabFavoritos = document.getElementById('btnTabFavoritos');
    this.btnTabHistorial = document.getElementById('btnTabHistorial');
    this.btnLimpiarHistorial = document.getElementById('btnLimpiarHistorial');
    this.libraryGrid = document.getElementById('libraryGrid');

    // Instancia del reproductor
    this.videoPlayer = new VideoPlayer(this.theaterContainer, this.detailsContainer);

    this.currentView = 'feed';
    this.previousView = 'feed';
    this.librarySubTab = 'favoritos';
    this.searchDebounceTimer = null;
    this.currentAbortController = null;

    this._inicializar();
  }

  _inicializar() {
    this._configurarEventosNavegacion();
    this._configurarEventosBuscador();
    this._configurarEventosCategorias();
    this._configurarEventosBiblioteca();
    this._configurarEventosReproductor();
    this._configurarEventosSidebar();
    this._configurarEventosDestacados();

    // Cargar feed inicial de tendencias
    this.cargarFeedPorCategoria('tendencias', 'Tendencias');
  }

  /* =========================================================================
     1. Navegación y Vistas
     ========================================================================= */
  _configurarEventosNavegacion() {
    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        const targetAction = btn.dataset.action;
        const targetQuery = btn.dataset.query;

        if (targetAction === 'chip' && targetQuery) {
          if (targetQuery === 'paracas') {
            this.cargarAlbumParacas();
          } else {
            this.cargarFeedPorCategoria(targetQuery, btn.textContent.trim());
          }
          this._cerrarSidebarMovil();
          return;
        }

        if (targetView) {
          this.cambiarVista(targetView);
          this._cerrarSidebarMovil();
        }
      });
    });

    if (this.btnLogoHome) {
      this.btnLogoHome.addEventListener('click', (e) => {
        e.preventDefault();
        this.inputSearch.value = '';
        this.btnClearSearch.style.display = 'none';
        this.cargarFeedPorCategoria('tendencias', 'Tendencias');
      });
    }

    if (this.btnCloseWatchView) {
      this.btnCloseWatchView.addEventListener('click', () => {
        this.videoPlayer.cerrar();
        this.cambiarVista(this.previousView || 'feed');
      });
    }
  }

  cambiarVista(viewName) {
    if (this.currentView !== viewName) {
      this.previousView = this.currentView;
    }
    this.currentView = viewName;

    // Actualizar botones de navegación activos
    this.navButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Conmutar visibilidad de secciones
    Object.keys(this.views).forEach((key) => {
      if (this.views[key]) {
        this.views[key].classList.toggle('active', key === viewName);
      }
    });

    if (viewName === 'library') {
      this.cargarBiblioteca();
    }
  }

  _configurarEventosSidebar() {
    if (this.btnMenuToggle) {
      this.btnMenuToggle.addEventListener('click', () => {
        this.ytSidebar.classList.toggle('open');
        this.sidebarBackdrop.classList.toggle('visible');
      });
    }

    if (this.sidebarBackdrop) {
      this.sidebarBackdrop.addEventListener('click', () => {
        this._cerrarSidebarMovil();
      });
    }
  }

  _cerrarSidebarMovil() {
    if (this.ytSidebar) this.ytSidebar.classList.remove('open');
    if (this.sidebarBackdrop) this.sidebarBackdrop.classList.remove('visible');
  }

  /* =========================================================================
     2. Búsqueda Instantánea en el Tope (Sin tener que scrollear)
     ========================================================================= */
  _configurarEventosBuscador() {
    this.inputSearch.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this.btnClearSearch.style.display = query.length > 0 ? 'inline-flex' : 'none';

      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        if (query.length >= 2) {
          this.ejecutarBusqueda(query);
        } else if (query.length === 0) {
          this.cargarFeedPorCategoria('tendencias', 'Tendencias');
        }
      }, 350);
    });

    if (this.btnSearchSubmit) {
      this.btnSearchSubmit.addEventListener('click', () => {
        const query = this.inputSearch.value.trim();
        if (query.length >= 2) {
          this.ejecutarBusqueda(query);
        }
      });
    }

    this.btnClearSearch.addEventListener('click', () => {
      this.inputSearch.value = '';
      this.btnClearSearch.style.display = 'none';
      this.cargarFeedPorCategoria('tendencias', 'Tendencias');
      this.inputSearch.focus();
    });

    this.inputSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this.searchDebounceTimer);
        const query = this.inputSearch.value.trim();
        if (query.length >= 2) {
          this.ejecutarBusqueda(query);
          this.inputSearch.blur();
        }
      }
    });

    if (this.btnVoiceSearch) {
      this.btnVoiceSearch.addEventListener('click', () => {
        this._iniciarReconocimientoVoz();
      });
    }
  }

  _iniciarReconocimientoVoz() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta búsqueda por voz directa. Puedes escribir en el buscador.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CL';
    recognition.start();

    this.inputSearch.placeholder = 'Escuchando...';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.inputSearch.value = transcript;
      this.inputSearch.placeholder = 'Buscar';
      this.btnClearSearch.style.display = 'inline-flex';
      this.ejecutarBusqueda(transcript);
    };

    recognition.onerror = () => {
      this.inputSearch.placeholder = 'Buscar';
    };
  }

  async ejecutarBusqueda(query) {
    this.cambiarVista('feed');

    // OCULTAR INMEDIATAMENTE el shelf de destacados para que los resultados aparezcan arriba sin scroll
    if (this.featuredShelf) {
      this.featuredShelf.style.display = 'none';
    }

    this.sectionTitle.textContent = `Resultados para "${query}"`;
    this.mostrarCargando(this.videoGrid);

    // Desactivar chips activos
    this.categoryChips.forEach((c) => c.classList.remove('active'));

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();

    const videos = await SearchService.buscar(query, this.currentAbortController.signal);
    this.renderizarListaVideos(videos, this.videoGrid);

    // Scroll inmediato a la cabecera de resultados para que no haya que scrollear
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =========================================================================
     3. Categorías y Colecciones
     ========================================================================= */
  _configurarEventosCategorias() {
    this.categoryChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.categoryChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        const query = chip.dataset.query;
        const nombre = chip.textContent.trim();
        this.inputSearch.value = '';
        this.btnClearSearch.style.display = 'none';

        if (query === 'paracas') {
          this.cargarAlbumParacas();
        } else {
          this.cargarFeedPorCategoria(query, nombre);
        }
      });
    });
  }

  async cargarFeedPorCategoria(categoriaQuery, tituloCategoria) {
    this.cambiarVista('feed');

    // Mostrar el shelf destacado solo si está en 'tendencias' / 'Todos'
    if (this.featuredShelf) {
      this.featuredShelf.style.display = (categoriaQuery === 'tendencias') ? 'block' : 'none';
    }

    this.sectionTitle.textContent = tituloCategoria;
    this.mostrarCargando(this.videoGrid);

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();

    const videos = await SearchService.buscar(categoriaQuery, this.currentAbortController.signal);
    this.renderizarListaVideos(videos, this.videoGrid);
  }

  _configurarEventosDestacados() {
    const btnPlayNomad = document.getElementById('btnPlayNomadLatest');
    const btnBrowseNomad = document.getElementById('btnBrowseNomad');

    if (btnPlayNomad) {
      btnPlayNomad.addEventListener('click', () => {
        this.reproducirVideo(NOMAD_WORSHIP_FEATURED.latestVideo);
      });
    }

    if (btnBrowseNomad) {
      btnBrowseNomad.addEventListener('click', () => {
        this.cargarFeedPorCategoria('nomad worship', 'NOMAD WORSHIP - Videos y Discografía');
        this.categoryChips.forEach((c) => {
          c.classList.toggle('active', c.dataset.query === 'nomad worship');
        });
      });
    }

    const btnPlayParacas = document.getElementById('btnPlayParacasAlbum');
    const btnBrowseParacas = document.getElementById('btnBrowseParacas');

    if (btnPlayParacas) {
      btnPlayParacas.addEventListener('click', () => {
        const primerTrack = PARACAS_ALBUM.tracks[0];
        this.reproducirVideo(primerTrack, PARACAS_ALBUM.playlistId);
      });
    }

    if (btnBrowseParacas) {
      btnBrowseParacas.addEventListener('click', () => {
        this.cargarAlbumParacas();
      });
    }
  }

  cargarAlbumParacas() {
    this.cambiarVista('feed');
    if (this.featuredShelf) {
      this.featuredShelf.style.display = 'none';
    }
    this.sectionTitle.textContent = 'Paracas - Sueños en el aire (Álbum 1978 EMI-Odeón)';
    this.categoryChips.forEach((c) => {
      c.classList.toggle('active', c.dataset.query === 'paracas');
    });
    this.renderizarListaVideos(PARACAS_ALBUM.tracks, this.videoGrid, PARACAS_ALBUM.playlistId);
  }

  /* =========================================================================
     4. Orquestación del Reproductor Watch Page (2 Columnas - Imagen 2)
     ========================================================================= */
  _configurarEventosReproductor() {
    this.videoPlayer.onCloseCallback = () => {
      this.cambiarVista(this.previousView || 'feed');
    };

    this.videoPlayer.onFavoriteToggleCallback = (video) => {
      const esFav = StorageService.alternarFavorito(video);
      if (this.currentView === 'library') {
        this.cargarBiblioteca();
      }
      return esFav;
    };
  }

  /**
   * Abre la vista Watch completa y renderiza la columna de videos recomendados.
   * @param {Object} video
   * @param {string|null} [playlistId]
   */
  async reproducirVideo(video, playlistId = null) {
    if (!video || !video.id) return;

    this.cambiarVista('watch');
    this.videoPlayer.cargarVideo(video, playlistId);
    StorageService.guardarEnHistorial(video);

    const esFav = StorageService.esFavorito(video.id);
    this.videoPlayer.actualizarBotonFavorito(esFav);

    // Cargar columna lateral de videos recomendados (Imagen 2)
    this._cargarVideosRelacionados(video);
  }

  async _cargarVideosRelacionados(video) {
    if (!this.relatedListContainer) return;

    this.relatedListContainer.innerHTML = `
      <div class="loading-state-mini">
        <div class="spinner-mini"></div>
        <span>Cargando videos sugeridos...</span>
      </div>
    `;

    // Buscar videos del mismo canal o tema relacionado
    const queryRelacionados = video.channel ? `${video.channel} musica` : video.title;
    const relacionados = await SearchService.buscar(queryRelacionados);

    // Filtrar el video actual si aparece en la lista
    const videosFiltrados = (relacionados || []).filter((v) => v.id !== video.id).slice(0, 15);

    this.renderizarListaRelacionados(videosFiltrados, this.relatedListContainer);
  }

  renderizarListaRelacionados(videos, contenedor) {
    contenedor.innerHTML = '';
    if (!videos || videos.length === 0) {
      contenedor.innerHTML = `<p class="empty-related-msg">No hay más sugerencias en este momento.</p>`;
      return;
    }

    videos.forEach((video) => {
      const card = document.createElement('article');
      card.className = 'related-video-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const durationHtml = video.duration
        ? `<span class="duration-badge-mini">${this._sanitizarHtml(video.duration)}</span>`
        : '';

      card.innerHTML = `
        <div class="related-thumbnail-wrapper">
          <img src="${video.thumbnail}" alt="${this._sanitizarHtml(video.title)}" class="related-thumbnail" loading="lazy">
          ${durationHtml}
        </div>
        <div class="related-info-block">
          <h4 class="related-title">${this._sanitizarHtml(video.title)}</h4>
          <p class="related-channel">${this._sanitizarHtml(video.channel || 'Canal')}</p>
          <p class="related-meta">${this._sanitizarHtml(video.views || 'Video')}</p>
        </div>
      `;

      const onClick = () => this.reproducirVideo(video);
      card.addEventListener('click', onClick);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      });

      contenedor.appendChild(card);
    });
  }

  /* =========================================================================
     5. Renderizado de Grilla Principal
     ========================================================================= */
  renderizarListaVideos(videos, contenedor, defaultPlaylistId = null) {
    contenedor.innerHTML = '';

    if (!videos || videos.length === 0) {
      contenedor.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-wrapper">${ICONS.SEARCH}</div>
          <h3>No se encontraron videos</h3>
          <p>Intenta con otros términos de búsqueda.</p>
        </div>
      `;
      return;
    }

    videos.forEach((video) => {
      const card = this._crearTarjetaVideo(video, defaultPlaylistId);
      contenedor.appendChild(card);
    });
  }

  _crearTarjetaVideo(video, defaultPlaylistId = null) {
    const card = document.createElement('article');
    card.className = 'yt-video-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const durationHtml = video.duration
      ? `<span class="duration-badge">${this._sanitizarHtml(video.duration)}</span>`
      : '';

    const viewsHtml = video.views ? `<span class="card-stat">${this._sanitizarHtml(video.views)}</span>` : '';
    const dateHtml = video.published ? `<span class="card-stat-dot">•</span><span class="card-stat">${this._sanitizarHtml(video.published)}</span>` : '';

    const avatarHtml = video.channelAvatar
      ? `<img src="${video.channelAvatar}" alt="${this._sanitizarHtml(video.channel)}" class="card-channel-avatar" loading="lazy">`
      : `<div class="card-channel-avatar-placeholder">${ICONS.USER_AVATAR}</div>`;

    card.innerHTML = `
      <div class="card-thumbnail-wrapper">
        <img src="${video.thumbnail}" alt="${this._sanitizarHtml(video.title)}" class="card-thumbnail" loading="lazy">
        ${durationHtml}
      </div>
      <div class="card-info-row">
        ${avatarHtml}
        <div class="card-text-block">
          <h3 class="card-title">${this._sanitizarHtml(video.title)}</h3>
          <p class="card-channel">${this._sanitizarHtml(video.channel || 'Canal')}</p>
          <div class="card-meta">
            ${viewsHtml}
            ${dateHtml}
          </div>
        </div>
      </div>
    `;

    const reproducir = () => {
      const playlist = video.playlistId || defaultPlaylistId || (PARACAS_ALBUM.tracks.some(t => t.id === video.id) ? PARACAS_ALBUM.playlistId : null);
      this.reproducirVideo(video, playlist);
    };

    card.addEventListener('click', reproducir);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        reproducir();
      }
    });

    return card;
  }

  /* =========================================================================
     6. Biblioteca y Estados
     ========================================================================= */
  _configurarEventosBiblioteca() {
    if (this.btnTabFavoritos) {
      this.btnTabFavoritos.addEventListener('click', () => {
        this.librarySubTab = 'favoritos';
        this.btnTabFavoritos.classList.add('active');
        this.btnTabHistorial.classList.remove('active');
        this.cargarBiblioteca();
      });
    }

    if (this.btnTabHistorial) {
      this.btnTabHistorial.addEventListener('click', () => {
        this.librarySubTab = 'historial';
        this.btnTabHistorial.classList.add('active');
        this.btnTabFavoritos.classList.remove('active');
        this.cargarBiblioteca();
      });
    }

    if (this.btnLimpiarHistorial) {
      this.btnLimpiarHistorial.addEventListener('click', () => {
        if (confirm('¿Deseas vaciar todo el historial de videos vistos?')) {
          StorageService.limpiarHistorial();
          this.cargarBiblioteca();
        }
      });
    }
  }

  cargarBiblioteca() {
    if (!this.libraryGrid) return;

    if (this.librarySubTab === 'favoritos') {
      if (this.btnLimpiarHistorial) this.btnLimpiarHistorial.style.display = 'none';
      const favoritos = StorageService.obtenerFavoritos();
      if (favoritos.length === 0) {
        this.libraryGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrapper">${ICONS.BOOKMARK_OUTLINE}</div>
            <h3>No tienes videos guardados</h3>
            <p>Guarda tus videos para ver más tarde usando el botón Guardar en cualquier video.</p>
          </div>
        `;
        return;
      }
      this.renderizarListaVideos(favoritos, this.libraryGrid);
    } else {
      if (this.btnLimpiarHistorial) this.btnLimpiarHistorial.style.display = 'inline-flex';
      const historial = StorageService.obtenerHistorial();
      if (historial.length === 0) {
        this.libraryGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrapper">${ICONS.HISTORY}</div>
            <h3>El historial está vacío</h3>
            <p>Los videos que reproduzcas aparecerán aquí automáticamente.</p>
          </div>
        `;
        return;
      }
      this.renderizarListaVideos(historial, this.libraryGrid);
    }
  }

  mostrarCargando(contenedor) {
    contenedor.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Cargando videos...</p>
      </div>
    `;
  }

  _sanitizarHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Inicialización de la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  new AppController();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[SW Register Fail]:', err);
      });
    });
  }
});
