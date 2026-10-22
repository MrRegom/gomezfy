/**
 * AudioEngine - Motor de Audio Híbrido (HTML5 Audio Nativo + YouTube Fallback).
 * Responsabilidad Única: Controlar el ciclo de vida de reproducción acústica,
 * resolver el stream de audio directo para iPhone (iOS background playback y pantalla de bloqueo)
 * y sincronizar la MediaSession API del sistema operativo.
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
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.audioElement.playsInline = true;
    this.audioElement.setAttribute('playsinline', '');
    this.audioElement.setAttribute('webkit-playsinline', '');

    this.ytPlayer = null;
    this.isUsingNativeAudio = true;
    this.isReady = true;
    this.currentTrack = null;
    this.currentState = PlaybackState.IDLE;
    this.callbacks = new Map();
    this.timerInterval = null;

    this._configurarEventosAudioNativo();
    this._cargarScriptYouTube();
  }

  on(event, callback) {
    this.callbacks.set(event, callback);
  }

  _emit(event, data) {
    if (this.callbacks.has(event)) {
      this.callbacks.get(event)(data);
    }
  }

  _configurarEventosAudioNativo() {
    const audio = this.audioElement;

    audio.addEventListener('play', () => {
      this.currentState = PlaybackState.PLAYING;
      this._iniciarTickTiempo();
      this._actualizarMediaSessionState('playing');
      this._emit('stateChange', this.currentState);
    });

    audio.addEventListener('pause', () => {
      this.currentState = PlaybackState.PAUSED;
      this._detenerTickTiempo();
      this._actualizarMediaSessionState('paused');
      this._emit('stateChange', this.currentState);
    });

    audio.addEventListener('waiting', () => {
      this.currentState = PlaybackState.BUFFERING;
      this._emit('stateChange', this.currentState);
    });

    audio.addEventListener('timeupdate', () => {
      const currentTime = audio.currentTime || 0;
      const duration = audio.duration || 0;
      this._emit('timeUpdate', { currentTime, duration });
      this._actualizarPositionState(currentTime, duration);
    });

    audio.addEventListener('ended', () => {
      this.currentState = PlaybackState.ENDED;
      this._detenerTickTiempo();
      this._emit('ended');
      this._emit('stateChange', this.currentState);
    });

    audio.addEventListener('error', (err) => {
      console.warn('[AudioEngine Nativo Error]:', err);
      // Si el audio nativo falla, intentar YouTube iframe como respaldo
      if (this.currentTrack && this.isUsingNativeAudio) {
        console.info('Intentando fallback con YouTube Iframe Player...');
        this.isUsingNativeAudio = false;
        this._reproducirConYouTube(this.currentTrack.id, this.currentTrack);
      } else {
        this._emit('error', err);
      }
    });
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
        controls: 1,
        disablekb: 0,
        enablejsapi: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          this._emit('ready');
          if (this.pendingVideoId) {
            this._reproducirConYouTube(this.pendingVideoId, this.pendingTrack);
            this.pendingVideoId = null;
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
    if (this.isUsingNativeAudio) return; // Si estamos en audio nativo ignorar eventos de YT

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
      if (!this.isUsingNativeAudio && this.ytPlayer && this.ytPlayer.getCurrentTime) {
        const currentTime = this.ytPlayer.getCurrentTime() || 0;
        const duration = this.ytPlayer.getDuration() || 0;
        this._emit('timeUpdate', { currentTime, duration });
        this._actualizarPositionState(currentTime, duration);
      }
    }, 500);
  }

  _detenerTickTiempo() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Carga y reproduce una pista de audio.
   * Prioriza resolución de stream nativo para iOS Safari (iPhone) garantizando
   * reproducción continua en pantalla bloqueada.
   */
  async loadVideo(videoId, track) {
    this.currentTrack = track;
    this.currentState = PlaybackState.LOADING;
    this._emit('stateChange', this.currentState);
    this._configurarMediaSession(track);

    // Detener cualquier reproducción previa
    if (this.audioElement) {
      this.audioElement.pause();
    }
    if (this.ytPlayer && this.ytPlayer.stopVideo) {
      this.ytPlayer.stopVideo();
    }

    try {
      // 1. Intentar resolver stream de audio directo m4a
      let resp = await fetch(`/api/stream?id=${encodeURIComponent(videoId)}`);
      if (!resp.ok && resp.status === 404) {
        resp = await fetch(`/api/stream.py?id=${encodeURIComponent(videoId)}`);
      }
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'success' && data.stream?.audioUrl) {
          this.isUsingNativeAudio = true;
          this.audioElement.src = data.stream.audioUrl;
          await this.audioElement.play();
          return;
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener stream directo, activando fallback:', e);
    }

    // 2. Si falla stream directo, fallback a YouTube Iframe
    this.isUsingNativeAudio = false;
    this._reproducirConYouTube(videoId, track);
  }

  _reproducirConYouTube(videoId, track) {
    if (!this.ytPlayer || !this.ytPlayer.loadVideoById) {
      this.pendingVideoId = videoId;
      this.pendingTrack = track;
      setTimeout(() => this._reproducirConYouTube(videoId, track), 500);
      return;
    }

    try {
      this.ytPlayer.loadVideoById({
        videoId: videoId,
        startSeconds: 0
      });
      this.ytPlayer.playVideo();
    } catch (e) {
      console.error('Error cargando video con YouTube Iframe:', e);
      this._emit('error', e);
    }
  }

  play() {
    if (this.isUsingNativeAudio && this.audioElement) {
      this.audioElement.play().catch(e => console.warn('Error play audio nativo:', e));
    } else if (this.ytPlayer && this.ytPlayer.playVideo) {
      this.ytPlayer.playVideo();
    }
  }

  pause() {
    if (this.isUsingNativeAudio && this.audioElement) {
      this.audioElement.pause();
    } else if (this.ytPlayer && this.ytPlayer.pauseVideo) {
      this.ytPlayer.pauseVideo();
    }
  }

  seek(seconds) {
    if (this.isUsingNativeAudio && this.audioElement) {
      this.audioElement.currentTime = seconds;
    } else if (this.ytPlayer && this.ytPlayer.seekTo) {
      this.ytPlayer.seekTo(seconds, true);
    }
  }

  getDuration() {
    if (this.isUsingNativeAudio && this.audioElement) {
      return this.audioElement.duration || 0;
    }
    return this.ytPlayer?.getDuration?.() || 0;
  }

  getCurrentTime() {
    if (this.isUsingNativeAudio && this.audioElement) {
      return this.audioElement.currentTime || 0;
    }
    return this.ytPlayer?.getCurrentTime?.() || 0;
  }

  setVolume(volumeFraction) {
    if (this.isUsingNativeAudio && this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, volumeFraction));
    } else if (this.ytPlayer && this.ytPlayer.setVolume) {
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

    // Handlers para pantalla de bloqueo en iPhone iOS
    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.seek(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      const current = this.isUsingNativeAudio ? this.audioElement.currentTime : (this.ytPlayer?.getCurrentTime() || 0);
      this.seek(Math.max(current - skipTime, 0));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      const current = this.isUsingNativeAudio ? this.audioElement.currentTime : (this.ytPlayer?.getCurrentTime() || 0);
      this.seek(current + skipTime);
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
        // Ignorar posibles inconsistencias de microsegundos en Safari
      }
    }
  }
}
