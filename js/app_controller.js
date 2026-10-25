/**
 * AppController - GomezTube
 * Responsabilidad Única: Controlador de interfaz de usuario y eventos.
 * Sigue Clean Architecture sin acoplar lógica en templates ni mezclar responsabilidades.
 */

import { SearchService } from './search_service.js';
import { StorageService } from './storage_service.js';
import { VideoPlayer } from './video_player.js';
import { ICONS } from './ui_icons.js';

export class AppController {
  constructor() {
    // Referencias al DOM
    this.playerContainer = document.getElementById('playerSection');
    this.playerInfoContainer = document.getElementById('playerInfoSection');
    this.inputSearch = document.getElementById('inputSearch');
    this.btnClearSearch = document.getElementById('btnClearSearch');
    this.videoGrid = document.getElementById('videoGrid');
    this.sectionTitle = document.getElementById('sectionTitle');
    this.categoryChips = document.querySelectorAll('.category-chip');
    this.navButtons = document.querySelectorAll('.nav-tab-btn');
    this.views = {
      feed: document.getElementById('viewFeed'),
      library: document.getElementById('viewLibrary')
    };

    // Sub-vistas de biblioteca
    this.btnTabFavoritos = document.getElementById('btnTabFavoritos');
    this.btnTabHistorial = document.getElementById('btnTabHistorial');
    this.btnLimpiarHistorial = document.getElementById('btnLimpiarHistorial');
    this.libraryGrid = document.getElementById('libraryGrid');

    this.videoPlayer = new VideoPlayer(this.playerContainer, this.playerInfoContainer);
    this.currentView = 'feed';
    this.librarySubTab = 'favoritos'; // 'favoritos' | 'historial'
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
    this._configurarEventosDestacadoNomad();

    // Cargar feed inicial de tendencias
    this.cargarFeedPorCategoria('tendencias', 'Tendencias');
  }

  _configurarEventosDestacadoNomad() {
    const btnPlay = document.getElementById('btnPlayNomadLatest');
    const btnBrowse = document.getElementById('btnBrowseNomad');

    const nomadLatestVideo = {
      id: 'p34Oop-WnjQ',
      title: 'NOMAD WORSHIP - Un Paso (Video Oficial)',
      channel: 'NOMAD WORSHIP',
      channelAvatar: 'https://i.ytimg.com/vi/p34Oop-WnjQ/hq720.jpg',
      thumbnail: 'https://i.ytimg.com/vi/p34Oop-WnjQ/hq720.jpg',
      duration: '4:49',
      views: 'Video Oficial',
      published: 'Lanzamiento'
    };

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        this.videoPlayer.cargarVideo(nomadLatestVideo);
        StorageService.guardarEnHistorial(nomadLatestVideo);
      });
    }

    if (btnBrowse) {
      btnBrowse.addEventListener('click', () => {
        this.cargarFeedPorCategoria('nomad worship', 'NOMAD WORSHIP - Videos y Discografía');
        this.categoryChips.forEach((c) => {
          c.classList.toggle('active', c.dataset.query === 'nomad worship');
        });
      });
    }
  }

  _configurarEventosNavegacion() {
    this.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        this.cambiarVista(targetView);
      });
    });
  }

  cambiarVista(viewName) {
    this.currentView = viewName;

    // Actualizar botones de navegación
    this.navButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Cambiar visibilidad de secciones
    Object.keys(this.views).forEach((key) => {
      if (this.views[key]) {
        this.views[key].classList.toggle('active', key === viewName);
      }
    });

    if (viewName === 'library') {
      this.cargarBiblioteca();
    } else if (viewName === 'feed') {
      if (this.inputSearch.value.trim() === '') {
        this.sectionTitle.textContent = 'Recomendados';
      }
    }
  }

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

    this.btnClearSearch.addEventListener('click', () => {
      this.inputSearch.value = '';
      this.btnClearSearch.style.display = 'none';
      this.cargarFeedPorCategoria('tendencias', 'Tendencias');
      this.inputSearch.focus();
    });

    // Tecla Enter para búsqueda inmediata
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
  }

  _configurarEventosCategorias() {
    this.categoryChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.categoryChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        const query = chip.dataset.query;
        const nombre = chip.textContent;
        this.inputSearch.value = '';
        this.btnClearSearch.style.display = 'none';
        this.cargarFeedPorCategoria(query, nombre);
      });
    });
  }

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

  _configurarEventosReproductor() {
    this.videoPlayer.onFavoriteToggleCallback = (video) => {
      const esFav = StorageService.alternarFavorito(video);
      if (this.currentView === 'library') {
        this.cargarBiblioteca();
      }
      return esFav;
    };
  }

  async cargarFeedPorCategoria(categoriaQuery, tituloCategoria) {
    this.cambiarVista('feed');
    this.sectionTitle.textContent = tituloCategoria;
    this.mostrarCargando(this.videoGrid);

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();

    const videos = await SearchService.buscar(categoriaQuery, this.currentAbortController.signal);
    this.renderizarListaVideos(videos, this.videoGrid);
  }

  async ejecutarBusqueda(query) {
    this.cambiarVista('feed');
    this.sectionTitle.textContent = `Resultados para "${query}"`;
    this.mostrarCargando(this.videoGrid);

    // Desactivar chips de categoría
    this.categoryChips.forEach((c) => c.classList.remove('active'));

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();

    const videos = await SearchService.buscar(query, this.currentAbortController.signal);
    this.renderizarListaVideos(videos, this.videoGrid);
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

  renderizarListaVideos(videos, contenedor) {
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
      const card = this._crearTarjetaVideo(video);
      contenedor.appendChild(card);
    });
  }

  _crearTarjetaVideo(video) {
    const card = document.createElement('article');
    card.className = 'video-card';
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

    // Eventos de selección
    const reproducir = () => {
      this.videoPlayer.cargarVideo(video);
      StorageService.guardarEnHistorial(video);
      const esFav = StorageService.esFavorito(video.id);
      this.videoPlayer.actualizarBotonFavorito(esFav);
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

  // Registro del Service Worker para funcionamiento offline y PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[SW Register Fail]:', err);
      });
    });
  }
});
