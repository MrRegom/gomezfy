/**
 * TvCastService - GomezTube
 * Responsabilidad Única: Gestión de la proyección hacia Smart TVs y pantallas remotas.
 * Soporta Google Cast Framework (Chromecast, Android TV, Google TV), Presentation API W3C,
 * AirPlay para ecosistema Apple y vinculación directa mediante código de TV.
 */

import { ICONS } from './ui_icons.js';

export class TvCastService {
  constructor() {
    this.modalContainer = null;
    this.castContext = null;
    this.isCastReady = false;

    this._inicializarCastFramework();
  }

  /**
   * Inicializa la integración con Google Cast Sender SDK si está disponible en el entorno global.
   */
  _inicializarCastFramework() {
    window.__onGCastApiAvailable = (isAvailable) => {
      if (isAvailable && window.cast && window.cast.framework) {
        try {
          this.castContext = window.cast.framework.CastContext.getInstance();
          this.castContext.setOptions({
            receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
          });
          this.isCastReady = true;
        } catch (err) {
          console.warn('[TvCastService]: Error al inicializar CastContext:', err);
        }
      }
    };

    // Si el framework ya cargó antes de registrar el hook
    if (window.cast && window.cast.framework && !this.isCastReady) {
      try {
        this.castContext = window.cast.framework.CastContext.getInstance();
        this.isCastReady = true;
      } catch (_) {}
    }
  }

  /**
   * Intenta proyectar directamente por Cast o abre el asistente modal multicanal.
   * @param {Object} video - Metadata del video en reproducción
   */
  proyectar(video) {
    if (!video || !video.id) return;
    this.abrirModalProyeccion(video);
  }

  /**
   * Abre el modal interactivo con todas las opciones de proyección a TV.
   * @param {Object} video
   */
  abrirModalProyeccion(video) {
    let modalOverlay = document.getElementById('modalTvCastOverlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'modalTvCastOverlay';
      modalOverlay.className = 'modal-tvcast-overlay';
      document.body.appendChild(modalOverlay);
    }

    const videoTitle = this._sanitizarHtml(video.title);
    const videoId = encodeURIComponent(video.id);

    modalOverlay.innerHTML = `
      <div class="modal-tvcast-card" role="dialog" aria-modal="true" aria-labelledby="tvcastTitle">
        
        <!-- Cabecera del Modal -->
        <div class="modal-tvcast-header">
          <div class="modal-tvcast-title-group">
            <span class="modal-tvcast-icon">${ICONS.CAST}</span>
            <div>
              <h2 id="tvcastTitle" class="modal-tvcast-title">Proyectar a Smart TV</h2>
              <p class="modal-tvcast-subtitle">Transmite "${videoTitle}" a tu televisor</p>
            </div>
          </div>
          <button type="button" class="btn-close-modal" id="btnCerrarModalTv" title="Cerrar ventana">
            ${ICONS.CLOSE}
          </button>
        </div>

        <!-- Cuerpo con Opciones de Transmisión -->
        <div class="modal-tvcast-body">
          
          <!-- Opción 1: Transmisión Inalámbrica Directa (Chromecast / Google Cast / DLNA) -->
          <div class="tvcast-option-card" id="optionDirectCast">
            <div class="tvcast-option-content">
              <span class="tvcast-badge badge-recommended">Recomendado</span>
              <h3 class="tvcast-option-title">1. Transmisión Inalámbrica (Chromecast / Smart TV)</h3>
              <p class="tvcast-option-desc">
                Conecta directamente con televisores en tu misma red Wi-Fi (Chromecast, Google TV, Android TV o pantallas inalámbricas).
              </p>
              <button type="button" class="btn-tvcast-action btn-tvcast-primary" id="btnIniciarCastNativo">
                <span class="btn-icon">${ICONS.CAST}</span>
                <span>Buscar televisores en tu red</span>
              </button>
            </div>
          </div>

          <!-- Opción 2: Abrir en la app de YouTube para transmitir -->
          <div class="tvcast-option-card">
            <div class="tvcast-option-content">
              <h3 class="tvcast-option-title">2. Abrir en la App de YouTube de tu teléfono</h3>
              <p class="tvcast-option-desc">
                Si tienes la app de YouTube en tu celular, ábrelo allí y toca el icono de transmitir a la TV de tu sala.
              </p>
              <a
                href="https://www.youtube.com/watch?v=${videoId}"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-tvcast-action btn-tvcast-secondary"
                id="btnAbrirAppYoutube"
              >
                <span class="btn-icon">${ICONS.EXTERNAL_LINK}</span>
                <span>Abrir video para transmitir</span>
              </a>
            </div>
          </div>

          <!-- Opción 3: Vincular con Código de TV (100% de compatibilidad) -->
          <div class="tvcast-option-card">
            <div class="tvcast-option-content">
              <h3 class="tvcast-option-title">3. Vincular con Código de TV (Samsung, LG, Roku, Sony)</h3>
              <p class="tvcast-option-desc">
                En tu televisor, entra a <strong>YouTube > Configuración > Vincular con código de TV</strong> e ingrésalo en la página de vinculación oficial:
              </p>
              <a
                href="https://www.youtube.com/pair"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-tvcast-action btn-tvcast-secondary"
              >
                <span class="btn-icon">${ICONS.TV}</span>
                <span>Ir a vincular TV (youtube.com/pair)</span>
              </a>
            </div>
          </div>

          <!-- Opción 4: Guía rápida AirPlay (iPhone, iPad, Mac) -->
          <div class="tvcast-info-box">
            <h4 class="tvcast-info-title">¿Estás en un iPhone o iPad con Apple TV / AirPlay?</h4>
            <p class="tvcast-info-text">
              Desliza desde la esquina superior derecha de tu iPhone para abrir el <strong>Centro de Control</strong> y pulsa en <strong>Duplicar Pantalla</strong> para ver GomezTube en tu Smart TV.
            </p>
          </div>

        </div>

      </div>
    `;

    modalOverlay.classList.add('visible');

    // Configurar eventos del modal
    const btnCerrar = document.getElementById('btnCerrarModalTv');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => this.cerrarModalProyeccion());
    }

    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        this.cerrarModalProyeccion();
      }
    });

    // Acción para buscar pantallas inalámbricas
    const btnCastNativo = document.getElementById('btnIniciarCastNativo');
    if (btnCastNativo) {
      btnCastNativo.addEventListener('click', () => {
        this._ejecutarCastNativo(video);
      });
    }

    // Tecla Escape para cerrar
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.cerrarModalProyeccion();
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('keydown', onKeyDown);
  }

  /**
   * Intenta invocar la API de Cast nativa o Presentation API.
   * @param {Object} video
   */
  async _ejecutarCastNativo(video) {
    // 1. Google Cast Framework
    if (this.isCastReady && this.castContext) {
      try {
        await this.castContext.requestSession();
        return;
      } catch (err) {
        console.warn('[TvCastService]: Sesión Google Cast cancelada o no disponible:', err);
      }
    }

    // 2. Presentation API (W3C Standard)
    if ('PresentationRequest' in window) {
      try {
        const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?autoplay=1&playsinline=1`;
        const presentationRequest = new PresentationRequest([embedUrl]);
        await presentationRequest.start();
        return;
      } catch (err) {
        console.warn('[TvCastService]: Presentation API no seleccionó pantalla:', err);
      }
    }

    // 3. Fallback: Si no hay selector directo de hardware, informar al usuario
    alert('No se detectó un receptor Chromecast activo en el navegador. Puedes usar la opción 2 o 3 para conectar tu televisor (Samsung, LG, Roku o código de TV).');
  }

  cerrarModalProyeccion() {
    const modalOverlay = document.getElementById('modalTvCastOverlay');
    if (modalOverlay) {
      modalOverlay.classList.remove('visible');
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

// Instancia singleton para desacoplar y orquestar
export const tvCastService = new TvCastService();
