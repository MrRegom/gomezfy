/**
 * VideoPlayer - GomezTube
 * Responsabilidad Única: Orquestación del reproductor de video en formato Watch Page (2 Columnas)
 * idéntico a la experiencia oficial de YouTube Desktop y Mobile.
 * Incrustación Privacy-Enhanced (youtube-nocookie) sin comerciales, con soporte Cast/Picture-in-Picture
 * y funcionalidad de doble clic / doble toque para adelantar/retroceder 15 segundos con animación oficial.
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

    // Estado del tiempo y reproducción
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = true;
    this.keyboardListenerAttached = false;

    this._inicializarEscuchaMensajesIframe();
  }

  /**
   * Escucha mensajes enviados por el iframe de YouTube (postMessage API con enablejsapi=1)
   * para mantener el tiempo actual sincronizado en milisegundos.
   */
  _inicializarEscuchaMensajesIframe() {
    window.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') {
            this.currentTime = data.info.currentTime;
          }
          if (typeof data.info.duration === 'number') {
            this.duration = data.info.duration;
          }
          if (typeof data.info.playerState === 'number') {
            this.isPlaying = data.info.playerState === 1; // 1 = PLAYING
          }
        }
      } catch (_) {}
    });
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
    this.currentTime = 0;

    // Parámetros de reproducción limpios y continuos con API JS activada
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

    // Renderizar iframe con relación de aspecto 16:9 y capa de doble toque estilo YouTube
    this.theaterContainer.innerHTML = `
      <div class="yt-player-aspect-wrapper" id="playerAspectWrapper">
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

        <!-- Capa de Gestos Doble Clic / Doble Toque (+/- 15 seg estilo YouTube) -->
        <div class="yt-doubletap-layer" id="doubleTapLayer">
          
          <!-- Zona Izquierda (-15 seg) -->
          <div class="yt-tap-zone zone-left" id="tapZoneLeft" title="Doble clic para retroceder 15s">
            <div class="yt-seek-indicator" id="indicatorLeft">
              <div class="yt-seek-ripple-arc arc-left"></div>
              <div class="yt-seek-badge-content">
                <div class="yt-seek-triangles">
                  <span>&#9664;</span><span>&#9664;</span><span>&#9664;</span>
                </div>
                <span class="yt-seek-text" id="txtSeekLeft">-15 segundos</span>
              </div>
            </div>
          </div>

          <!-- Zona Central (Pausa / Reanudar en clic simple) -->
          <div class="yt-tap-zone zone-center" id="tapZoneCenter"></div>

          <!-- Zona Derecha (+15 seg) -->
          <div class="yt-tap-zone zone-right" id="tapZoneRight" title="Doble clic para adelantar 15s">
            <div class="yt-seek-indicator" id="indicatorRight">
              <div class="yt-seek-ripple-arc arc-right"></div>
              <div class="yt-seek-badge-content">
                <div class="yt-seek-triangles">
                  <span>&#9654;</span><span>&#9654;</span><span>&#9654;</span>
                </div>
                <span class="yt-seek-text" id="txtSeekRight">+15 segundos</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    this.iframe = document.getElementById('gomeztube-iframe');
    this._renderizarDetallesWatch(video);
    this._configurarGestosDobleTapSeek();

    // Enviar evento de escucha al iframe tan pronto cargue
    if (this.iframe) {
      this.iframe.addEventListener('load', () => {
        this._enviarComando('listening');
      });
    }

    // Scroll suave hacia la zona superior al reproducir en pantallas móviles
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Configura los eventos de doble clic (escritorio/ratón), doble toque (móviles Android/iPhone)
   * y atajos de teclado para adelantar y retroceder 15 segundos.
   */
  _configurarGestosDobleTapSeek() {
    const zoneRight = document.getElementById('tapZoneRight');
    const zoneLeft = document.getElementById('tapZoneLeft');
    const zoneCenter = document.getElementById('tapZoneCenter');

    let rightAccum = 0;
    let rightTimer = null;
    let lastTapRight = 0;

    const ejecutarAdelantar = () => {
      rightAccum += 15;
      const txt = document.getElementById('txtSeekRight');
      const indicator = document.getElementById('indicatorRight');
      if (txt) txt.textContent = `+${rightAccum} segundos`;
      if (indicator) {
        indicator.classList.remove('active');
        void indicator.offsetWidth; // Reflow for animation restart
        indicator.classList.add('active');
      }

      this.seekRelativo(15);

      clearTimeout(rightTimer);
      rightTimer = setTimeout(() => {
        if (indicator) indicator.classList.remove('active');
        rightAccum = 0;
      }, 700);
    };

    if (zoneRight) {
      // Doble clic ratón (PC/Mac)
      zoneRight.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ejecutarAdelantar();
      });

      // Doble toque móvil (Android / iOS)
      zoneRight.addEventListener('touchend', (e) => {
        const ahora = Date.now();
        const intervalo = ahora - lastTapRight;
        if (intervalo > 0 && intervalo < 350) {
          e.preventDefault();
          e.stopPropagation();
          ejecutarAdelantar();
          lastTapRight = 0;
        } else {
          lastTapRight = ahora;
        }
      });
    }

    let leftAccum = 0;
    let leftTimer = null;
    let lastTapLeft = 0;

    const ejecutarRetroceder = () => {
      leftAccum += 15;
      const txt = document.getElementById('txtSeekLeft');
      const indicator = document.getElementById('indicatorLeft');
      if (txt) txt.textContent = `-${leftAccum} segundos`;
      if (indicator) {
        indicator.classList.remove('active');
        void indicator.offsetWidth;
        indicator.classList.add('active');
      }

      this.seekRelativo(-15);

      clearTimeout(leftTimer);
      leftTimer = setTimeout(() => {
        if (indicator) indicator.classList.remove('active');
        leftAccum = 0;
      }, 700);
    };

    if (zoneLeft) {
      // Doble clic ratón (PC/Mac)
      zoneLeft.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ejecutarRetroceder();
      });

      // Doble toque móvil (Android / iOS)
      zoneLeft.addEventListener('touchend', (e) => {
        const ahora = Date.now();
        const intervalo = ahora - lastTapLeft;
        if (intervalo > 0 && intervalo < 350) {
          e.preventDefault();
          e.stopPropagation();
          ejecutarRetroceder();
          lastTapLeft = 0;
        } else {
          lastTapLeft = ahora;
        }
      });
    }

    if (zoneCenter) {
      zoneCenter.addEventListener('click', () => {
        this.togglePlayPause();
      });
    }

    // Configurar atajos de teclado globales (ArrowRight, ArrowLeft, L, J, Space, K)
    if (!this.keyboardListenerAttached) {
      this.keyboardListenerAttached = true;
      document.addEventListener('keydown', (e) => {
        // Ignorar si el usuario está escribiendo en el buscador
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea') return;
        if (!this.currentVideo) return;

        if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          ejecutarAdelantar();
        } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          ejecutarRetroceder();
        } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          this.togglePlayPause();
        }
      });
    }
  }

  /**
   * Salto relativo de tiempo hacia adelante o atrás.
   * @param {number} segundos - Positivo para adelantar, negativo para retroceder
   */
  seekRelativo(segundos) {
    const tiempoBase = typeof this.currentTime === 'number' ? this.currentTime : 0;
    const nuevoTiempo = Math.max(0, tiempoBase + segundos);
    this.currentTime = nuevoTiempo;

    this._enviarComando('seekTo', [nuevoTiempo, true]);
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this._enviarComando('pauseVideo');
      this.isPlaying = false;
    } else {
      this._enviarComando('playVideo');
      this.isPlaying = true;
    }
  }

  _enviarComando(func, args = []) {
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), '*');
    }
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

    const btnSub = document.getElementById('btnSubscribeChannel');
    if (btnSub) {
      btnSub.addEventListener('click', () => {
        const isSubscribed = btnSub.classList.toggle('subscribed');
        btnSub.innerHTML = isSubscribed ? '<span>Suscrito</span>' : '<span>Suscribirse</span>';
      });
    }

    const btnCast = document.getElementById('btnActionCastTV');
    if (btnCast) {
      btnCast.addEventListener('click', () => {
        tvCastService.proyectar(video);
      });
    }

    const btnShare = document.getElementById('btnActionCompartir');
    if (btnShare) {
      btnShare.addEventListener('click', () => this._compartirVideo(video));
    }

    const btnGuardar = document.getElementById('btnActionGuardar');
    if (btnGuardar && this.onFavoriteToggleCallback) {
      btnGuardar.addEventListener('click', () => {
        const esFav = this.onFavoriteToggleCallback(video);
        this.actualizarBotonFavorito(esFav);
      });
    }

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
