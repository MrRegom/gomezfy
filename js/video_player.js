/**
 * VideoPlayer - GomezTube
 * Responsabilidad Única: Orquestación del reproductor de video en formato Watch Page (2 Columnas)
 * idéntico a la experiencia oficial de YouTube Desktop y Mobile.
 * Incrustación Privacy-Enhanced (youtube-nocookie) sin comerciales y con soporte Cast/Picture-in-Picture.
 */

import { ICONS } from './ui_icons.js';
import { tvCastService } from './tv_cast_service.js';

export class VideoPlayer {
  constructor(theaterContainer, detailsContainer) {
    this.theaterContainer = theaterContainer;
    this.detailsContainer = detailsContainer;
    this.currentVideo = null;
    this.iframe = null;
    this.onCloseCallback = null;
    this.onFavoriteToggleCallback = null;
    this.isLiked = false;
  }

  /**
   * Carga y reproduce un video o lista de reproducción en el escenario Watch de YouTube.
   * @param {Object} video
   * @param {string|null} [playlistId]
   */
  cargarVideo(video, playlistId = null) {
    if (!video || !video.id) return;

    this.currentVideo = video;
    this.isLiked = false;

    // Parámetros de reproducción limpios y continuos
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

    // Renderizar iframe con relación de aspecto 16:9 y permisos nativos de TV/Fullscreen
    this.theaterContainer.innerHTML = `
      <div class="yt-player-aspect-wrapper">
        <iframe
          id="gomeztube-iframe"
          class="yt-iframe-player"
          src="${embedUrl}"
          title="${this._sanitizarHtml(video.title)}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen; presentation"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
    `;

    this.iframe = document.getElementById('gomeztube-iframe');
    this._renderizarDetallesWatch(video);

    // Scroll suave hacia la zona superior al reproducir en pantallas móviles
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Renderiza el encabezado de video, canal, píldora de botones y caja de descripción estilo YouTube oficial.
   * @param {Object} video
   */
  _renderizarDetallesWatch(video) {
    if (!this.detailsContainer) return;

    const channelName = this._sanitizarHtml(video.channel || 'Canal');
    const videoTitle = this._sanitizarHtml(video.title);
    const viewsText = this._sanitizarHtml(video.views || 'Reproducción');
    const publishedText = video.published ? this._sanitizarHtml(video.published) : 'GomezTube';

    const avatarHtml = video.channelAvatar
      ? `<img src="${video.channelAvatar}" alt="${channelName}" class="watch-channel-avatar" loading="lazy">`
      : `<div class="watch-channel-avatar-placeholder">${ICONS.USER_AVATAR}</div>`;

    this.detailsContainer.innerHTML = `
      <!-- Título Oficial del Video -->
      <h1 class="watch-video-title">${videoTitle}</h1>

      <!-- Fila de Canal y Botones de Acción Agrupados -->
      <div class="watch-channel-actions-row">
        
        <!-- Bloque de Canal -->
        <div class="watch-channel-group">
          <div class="watch-avatar-wrapper">
            ${avatarHtml}
          </div>
          <div class="watch-channel-meta">
            <div class="watch-channel-name-row">
              <span class="watch-channel-name">${channelName}</span>
              <span class="watch-channel-verified" title="Canal Verificado">${ICONS.VERIFIED}</span>
            </div>
            <span class="watch-subscribers-count">Oficial • Sin comerciales</span>
          </div>
          <button type="button" class="btn-yt-subscribe" id="btnSubscribeChannel" title="Suscribirse al canal">
            <span>Suscribirse</span>
          </button>
        </div>

        <!-- Barra de Botones Píldora de YouTube -->
        <div class="watch-actions-toolbar">
          
          <!-- Píldora Agrupada Like / Dislike -->
          <div class="yt-button-pill-group">
            <button type="button" class="yt-pill-btn" id="btnActionLike" title="Me gusta">
              <span class="pill-icon" id="iconLikeBtn">${ICONS.LIKE}</span>
              <span class="pill-text" id="txtLikeCount">298</span>
            </button>
            <span class="yt-pill-divider"></span>
            <button type="button" class="yt-pill-btn yt-pill-btn-dislike" id="btnActionDislike" title="No me gusta">
              <span class="pill-icon">${ICONS.DISLIKE}</span>
            </button>
          </div>

          <!-- Botón Compartir -->
          <button type="button" class="yt-action-pill" id="btnActionCompartir" title="Compartir este video">
            <span class="pill-icon">${ICONS.SHARE}</span>
            <span class="pill-text">Compartir</span>
          </button>

          <!-- Botón Transmitir a Smart TV -->
          <button type="button" class="yt-action-pill pill-cast" id="btnActionCastTV" title="Proyectar a Smart TV">
            <span class="pill-icon">${ICONS.CAST}</span>
            <span class="pill-text">Transmitir</span>
          </button>

          <!-- Botón Guardar en Biblioteca -->
          <button type="button" class="yt-action-pill" id="btnActionGuardar" title="Guardar video">
            <span class="pill-icon" id="iconBtnGuardar">${ICONS.BOOKMARK_OUTLINE}</span>
            <span class="pill-text" id="txtBtnGuardar">Guardar</span>
          </button>

          <!-- Botón Volver / Cerrar Vista -->
          <button type="button" class="yt-action-pill btn-close-pill" id="btnActionVolverFeed" title="Volver al feed principal">
            <span class="pill-icon">${ICONS.CLOSE}</span>
          </button>

        </div>
      </div>

      <!-- Caja de Descripción Oficial Redondeada de YouTube -->
      <div class="watch-description-box" id="watchDescriptionBox">
        <div class="watch-description-header">
          <span class="watch-stat-bold">${viewsText}</span>
          <span class="watch-stat-dot">•</span>
          <span class="watch-stat-bold">${publishedText}</span>
          <span class="watch-tag-adfree">#GomezTubeSinAnuncios</span>
        </div>
        <p class="watch-description-text">
          Reproduciendo sin comerciales en GomezTube. Disfruta de la mejor calidad de audio y video libre de interrupciones publicitarias y transmite a tu televisor en 1 toque.
        </p>
      </div>
    `;

    this._enlazarEventosDetalles(video);
  }

  _enlazarEventosDetalles(video) {
    // Like button toggle
    const btnLike = document.getElementById('btnActionLike');
    const txtLike = document.getElementById('txtLikeCount');
    if (btnLike && txtLike) {
      btnLike.addEventListener('click', () => {
        this.isLiked = !this.isLiked;
        btnLike.classList.toggle('active', this.isLiked);
        let count = 298;
        if (this.isLiked) count += 1;
        txtLike.textContent = String(count);
      });
    }

    // Subscribe toggle
    const btnSub = document.getElementById('btnSubscribeChannel');
    if (btnSub) {
      btnSub.addEventListener('click', () => {
        const isSubscribed = btnSub.classList.toggle('subscribed');
        btnSub.innerHTML = isSubscribed ? '<span>Suscrito</span>' : '<span>Suscribirse</span>';
      });
    }

    // Transmitir a TV
    const btnCast = document.getElementById('btnActionCastTV');
    if (btnCast) {
      btnCast.addEventListener('click', () => {
        tvCastService.proyectar(video);
      });
    }

    // Compartir video
    const btnShare = document.getElementById('btnActionCompartir');
    if (btnShare) {
      btnShare.addEventListener('click', () => this._compartirVideo(video));
    }

    // Guardar en biblioteca
    const btnGuardar = document.getElementById('btnActionGuardar');
    if (btnGuardar && this.onFavoriteToggleCallback) {
      btnGuardar.addEventListener('click', () => {
        const esFav = this.onFavoriteToggleCallback(video);
        this.actualizarBotonFavorito(esFav);
      });
    }

    // Botón volver / cerrar
    const btnVolver = document.getElementById('btnActionVolverFeed');
    if (btnVolver) {
      btnVolver.addEventListener('click', () => this.cerrar());
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

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('¡Enlace copiado al portapapeles!');
    } catch (_) {
      prompt('Copia el enlace del video:', shareUrl);
    }
  }

  cerrar() {
    this.theaterContainer.innerHTML = '';
    this.detailsContainer.innerHTML = '';
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
