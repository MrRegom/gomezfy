/**
 * VideoPlayer - GomezTube
 * Responsabilidad Única: Orquestación del reproductor de video sin comerciales
 * mediante incrustación limpia (Privacy-Enhanced youtube-nocookie) con soporte
 * nativo de Pantalla Completa y Picture-in-Picture.
 */

import { ICONS } from './ui_icons.js';

export class VideoPlayer {
  constructor(containerElement, infoContainerElement) {
    this.container = containerElement;
    this.infoContainer = infoContainerElement;
    this.currentVideo = null;
    this.iframe = null;
    this.onCloseCallback = null;
    this.onFavoriteToggleCallback = null;
  }

  /**
   * Carga y reproduce un video o lista de reproducción.
   * @param {Object} video
   * @param {string|null} [playlistId]
   */
  cargarVideo(video, playlistId = null) {
    if (!video || !video.id) return;

    this.currentVideo = video;
    this.container.classList.remove('hidden');

    // Construcción de URL con parámetros limpios sin anuncios ni seguimiento
    const params = new URLSearchParams({
      autoplay: '1',
      rel: '0',
      modestbranding: '1',
      iv_load_policy: '3',
      playsinline: '1',
      enablejsapi: '1'
    });

    if (playlistId) {
      params.set('list', playlistId);
    }

    const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?${params.toString()}`;

    // Renderizar iframe con permisos de pantalla completa y Picture-in-Picture
    this.container.innerHTML = `
      <div class="player-wrapper">
        <iframe
          id="gomeztube-iframe"
          class="video-iframe"
          src="${embedUrl}"
          title="${this._sanitizarHtml(video.title)}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
    `;

    this.iframe = document.getElementById('gomeztube-iframe');
    this._renderizarDetallesVideo(video);

    // Scroll suave hacia el reproductor en móviles si está fuera de pantalla
    if (window.innerWidth <= 768) {
      this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Renderiza la barra de detalles (título, canal, botones de acción).
   * @param {Object} video
   */
  _renderizarDetallesVideo(video) {
    if (!this.infoContainer) return;

    this.infoContainer.classList.remove('hidden');
    this.infoContainer.innerHTML = `
      <div class="video-info-header">
        <h1 class="video-active-title">${this._sanitizarHtml(video.title)}</h1>
        <div class="video-stats-row">
          <span class="video-stat">${this._sanitizarHtml(video.views || 'Video')}</span>
          ${video.published ? `<span class="video-stat-dot">•</span><span class="video-stat">${this._sanitizarHtml(video.published)}</span>` : ''}
        </div>
      </div>

      <div class="video-channel-actions-row">
        <div class="channel-info-block">
          <div class="channel-avatar-wrapper">
            ${
              video.channelAvatar
                ? `<img src="${video.channelAvatar}" alt="${this._sanitizarHtml(video.channel)}" class="channel-avatar" loading="lazy">`
                : `<div class="channel-avatar-placeholder">${ICONS.USER_AVATAR}</div>`
            }
          </div>
          <div class="channel-meta">
            <span class="channel-name">${this._sanitizarHtml(video.channel || 'Canal')}</span>
            <span class="channel-badge-nofads">${ICONS.SHIELD_CHECK} Sin comerciales</span>
          </div>
        </div>

        <div class="video-actions-toolbar">
          <button type="button" class="action-btn" id="btnActionGuardar" title="Guardar en biblioteca">
            <span class="action-icon" id="iconBtnGuardar">${ICONS.BOOKMARK_OUTLINE}</span>
            <span class="action-text" id="txtBtnGuardar">Guardar</span>
          </button>
          <button type="button" class="action-btn" id="btnActionCompartir" title="Compartir enlace">
            <span class="action-icon">${ICONS.SHARE}</span>
            <span class="action-text">Compartir</span>
          </button>
          <button type="button" class="action-btn btn-close-player" id="btnActionCerrar" title="Cerrar reproductor">
            <span class="action-icon">${ICONS.CLOSE}</span>
          </button>
        </div>
      </div>
    `;

    // Vincular eventos de la barra de acciones
    const btnCerrar = document.getElementById('btnActionCerrar');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => this.cerrar());
    }

    const btnCompartir = document.getElementById('btnActionCompartir');
    if (btnCompartir) {
      btnCompartir.addEventListener('click', () => this._compartirVideo(video));
    }

    const btnGuardar = document.getElementById('btnActionGuardar');
    if (btnGuardar && this.onFavoriteToggleCallback) {
      btnGuardar.addEventListener('click', () => {
        const esFav = this.onFavoriteToggleCallback(video);
        this.actualizarBotonFavorito(esFav);
      });
    }
  }

  actualizarBotonFavorito(esFavorito) {
    const icon = document.getElementById('iconBtnGuardar');
    const txt = document.getElementById('txtBtnGuardar');
    if (icon && txt) {
      icon.innerHTML = esFavorito ? ICONS.BOOKMARK_FILLED : ICONS.BOOKMARK_OUTLINE;
      txt.textContent = esFavorito ? 'Guardado' : 'Guardar';
    }
  }

  async _compartirVideo(video) {
    const shareUrl = `https://youtu.be/${video.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: video.title,
          text: `Mira "${video.title}" en GomezTube sin comerciales:`,
          url: shareUrl
        });
        return;
      } catch (_) {}
    }

    // Fallback: Copiar al portapapeles
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('¡Enlace copiado al portapapeles!');
    } catch (_) {
      prompt('Copia el enlace del video:', shareUrl);
    }
  }

  cerrar() {
    this.container.innerHTML = '';
    this.container.classList.add('hidden');
    if (this.infoContainer) {
      this.infoContainer.innerHTML = '';
      this.infoContainer.classList.add('hidden');
    }
    this.currentVideo = null;
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
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
