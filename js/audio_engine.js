/**
 * AudioEngine - Motor de Audio Optimizado para Máxima Fluidez y Cero Latencia (Estilo Spotify Mobile).
 * Responsabilidad Única: Orquestar la reproducción instantánea de pistas,
 * mantener activo el hilo de audio en iOS (iPhone) y sincronizar la MediaSession API con la pantalla de bloqueo.
 */

export const PlaybackState = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  BUFFERING: 'BUFFERING',
  ENDED: 'ENDED'
});

export class AudioEngine {
  constructor(containerId = 'yt-player-container') {
    this.containerId = containerId;
    this.ytPlayer = null;
    this.isReady = false;
    this.currentTrack = null;
    this.currentState = PlaybackState.IDLE;
    this.callbacks = new Map();
    this.timerInterval = null;
    this.pendingVideoId = null;
    this.pendingTrack = null;
    this.audioContext = null;

    this._cargarScriptYouTube();
    this._iniciarAudioContextIOS();
  }

  on(event, callback) {
    this.callbacks.set(event, callback);
  }

  _emit(event, data) {
    if (this.callbacks.has(event)) {
      this.callbacks.get(event)(data);
    }
  }

  /**
   * Inicia un contexto de audio Web Audio API casi imperceptible (0.0001 gain)
   * que ancla el hilo de reproducción de Safari iOS para que el sistema reconozca
   * la sesión de audio activa en segundo plano.
   */
  _iniciarAudioContextIOS() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const desbloquearAudio = () => {
      try {
        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        // Micro oscilador silencioso de anclaje
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.00001;
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
      } catch (e) {
        // Ignorar si el navegador no requiere anclaje manual
      }
      window.removeEventListener('touchstart', desbloquearAudio);
      window.removeEventListener('click', desbloquearAudio);
    };

    window.addEventListener('touchstart', desbloquearAudio, { once: true, passive: true });
    window.addEventListener('click', desbloquearAudio, { once: true, passive: true });
  }

  _cargarScriptYouTube() {
    if (window.YT && window.YT.Player) {
      this._inicializarYouTubePlayer();
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      this._inicializarYouTubePlayer();
    };

    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }

  _inicializarYouTubePlayer() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    this.ytPlayer = new window.YT.Player(this.containerId, {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          this.isReady = true;
          this._emit('ready');
          if (this.pendingVideoId) {
            this._ejecutarCargaInmediata(this.pendingVideoId, this.pendingTrack);
            this.pendingVideoId = null;
            this.pendingTrack = null;
          }
        },
        onStateChange: (event) => this._onYouTubeStateChange(event),
        onError: (err) => {
          console.warn('[YouTube Player Error]:', err.data);
          this._emit('error', err);
        }
      }
    });
  }

  _onYouTubeStateChange(event) {
    const YTState = window.YT.PlayerState;
    switch (event.data) {
      case YTState.PLAYING:
        this.currentState = PlaybackState.PLAYING;
        this._iniciarTickTiempo();
        this._actualizarMediaSessionState('playing');
        break;
      case YTState.PAUSED:
        this.currentState = PlaybackState.PAUSED;
        this._detenerTickTiempo();
        this._actualizarMediaSessionState('paused');
        break;
      case YTState.BUFFERING:
        this.currentState = PlaybackState.BUFFERING;
        break;
      case YTState.ENDED:
        this.currentState = PlaybackState.ENDED;
        this._detenerTickTiempo();
        this._emit('ended');
        break;
      default:
        break;
    }
    this._emit('stateChange', this.currentState);
  }

  _iniciarTickTiempo() {
    this._detenerTickTiempo();
    this.timerInterval = setInterval(() => {
      if (this.ytPlayer && this.ytPlayer.getCurrentTime) {
        const currentTime = this.ytPlayer.getCurrentTime() || 0;
        const duration = this.ytPlayer.getDuration() || 0;
        this._emit('timeUpdate', { currentTime, duration });
        this._actualizarPositionState(currentTime, duration);
      }
    }, 400);
  }

  _detenerTickTiempo() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Carga y reproduce de inmediato sin latencia de red.
   * Cero bloqueos de servidor: pasa directo al reproductor Iframe para respuesta instantánea.
   */
  loadVideo(videoId, track) {
    this.currentTrack = track;
    // Estado optimista: el botón cambia de inmediato sin quedarse "pegado"
    this.currentState = PlaybackState.PLAYING;
    this._emit('stateChange', this.currentState);
    this._configurarMediaSession(track);

    if (!this.isReady || !this.ytPlayer || !this.ytPlayer.loadVideoById) {
      this.pendingVideoId = videoId;
      this.pendingTrack = track;
      return;
    }

    this._ejecutarCargaInmediata(videoId, track);
  }

  _ejecutarCargaInmediata(videoId, track) {
    try {
      this.ytPlayer.loadVideoById({
        videoId: videoId,
        startSeconds: 0
      });
      this.ytPlayer.playVideo();
    } catch (e) {
      console.warn('Error en loadVideoById, reintentando con fallback:', e);
      try {
        this.ytPlayer.cueVideoById(videoId, 0);
        this.ytPlayer.playVideo();
      } catch (e2) {
        console.error('Error crítico reproduciendo:', e2);
      }
    }
  }

  play() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    this.currentState = PlaybackState.PLAYING;
    this._emit('stateChange', this.currentState);

    if (this.ytPlayer && this.ytPlayer.playVideo) {
      this.ytPlayer.playVideo();
    }
  }

  pause() {
    this.currentState = PlaybackState.PAUSED;
    this._emit('stateChange', this.currentState);

    if (this.ytPlayer && this.ytPlayer.pauseVideo) {
      this.ytPlayer.pauseVideo();
    }
  }

  seek(seconds) {
    if (this.ytPlayer && this.ytPlayer.seekTo) {
      this.ytPlayer.seekTo(seconds, true);
    }
  }

  getDuration() {
    return this.ytPlayer?.getDuration?.() || 0;
  }

  getCurrentTime() {
    return this.ytPlayer?.getCurrentTime?.() || 0;
  }

  setVolume(volumeFraction) {
    if (this.ytPlayer && this.ytPlayer.setVolume) {
      this.ytPlayer.setVolume(Math.round(volumeFraction * 100));
    }
  }

  _configurarMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || 'Gomezfy',
      album: 'Gomezfy Sessions',
      artwork: [
        { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '128x128', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '192x192', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '384x384', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    // Control directo desde la pantalla de bloqueo de iOS
    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.seek(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      this.seek(Math.max((this.getCurrentTime() || 0) - skipTime, 0));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      this.seek((this.getCurrentTime() || 0) + skipTime);
    });
  }

  _actualizarMediaSessionState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  _actualizarPositionState(currentTime, duration) {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      try {
        if (duration > 0 && currentTime <= duration) {
          navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: 1.0,
            position: Math.min(currentTime, duration)
          });
        }
      } catch (e) {
        // Ignorar microdiferencias de tiempo en iOS
      }
    }
  }
}
