/**
 * AudioEngine - Motor de Audio Híbrido Inteligente con Soporte Nativo para iPhone.
 * Responsabilidad Única: Orquestar reproducción instantánea y priorizar stream nativo
 * HTML5 <audio> (m4a/aac) para garantizar sonido ininterrumpido con la pantalla bloqueada en iOS.
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
    this.isUsingNativeAudio = false;
    this.isReady = false;
    this.currentTrack = null;
    this.currentState = PlaybackState.IDLE;
    this.callbacks = new Map();
    this.timerInterval = null;
    this.pendingVideoId = null;
    this.pendingTrack = null;

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
      if (this.isUsingNativeAudio) {
        const currentTime = audio.currentTime || 0;
        const duration = audio.duration || 0;
        this._emit('timeUpdate', { currentTime, duration });
        this._actualizarPositionState(currentTime, duration);
      }
    });

    audio.addEventListener('ended', () => {
      this.currentState = PlaybackState.ENDED;
      this._detenerTickTiempo();
      this._emit('ended');
      this._emit('stateChange', this.currentState);
    });

    audio.addEventListener('error', (err) => {
      console.warn('[AudioEngine Nativo Error, pasando a YouTube Iframe]:', err);
      if (this.currentTrack) {
        this.isUsingNativeAudio = false;
        this._reproducirConYouTube(this.currentTrack.id, this.currentTrack);
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
            this._reproducirConYouTube(this.pendingVideoId, this.pendingTrack);
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
    if (this.isUsingNativeAudio) return;

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
      if (this.isUsingNativeAudio && this.audioElement) {
        const currentTime = this.audioElement.currentTime || 0;
        const duration = this.audioElement.duration || 0;
        this._emit('timeUpdate', { currentTime, duration });
        this._actualizarPositionState(currentTime, duration);
      } else if (!this.isUsingNativeAudio && this.ytPlayer && this.ytPlayer.getCurrentTime) {
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
   * Carga y reproduce de inmediato sin latencia perceptible.
   * Desbloquea el elemento de audio nativo durante el toque del usuario,
   * y consulta en paralelo el stream nativo .m4a para garantizar reproducción
   * ininterrumpida con pantalla bloqueada en iOS (iPhone).
   */
  async loadVideo(videoId, track) {
    this.currentTrack = track;
    this.currentState = PlaybackState.PLAYING;
    this._emit('stateChange', this.currentState);
    this._configurarMediaSession(track);

    // Desbloquear / preparar canal de audio nativo en iOS durante el evento del usuario
    if (this.audioElement) {
      this.audioElement.pause();
      // Silencio mínimo para autorizar audio en segundo plano en Safari iOS
      if (!this.audioElement.src || this.audioElement.src.startsWith('data:')) {
        this.audioElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        this.audioElement.play().catch(() => {});
      }
    }

    if (this.ytPlayer && this.ytPlayer.stopVideo) {
      this.ytPlayer.stopVideo();
    }

    // Iniciar de inmediato con YouTube Iframe (cero latencia para el usuario)
    this.isUsingNativeAudio = false;
    this._reproducirConYouTube(videoId, track);

    // Elevar la sesión a Audio Nativo (m4a) en segundo plano
    try {
      let audioUrl = null;

      // 1. Intentar mediante endpoint backend /api/stream
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        let resp = await fetch(`/api/stream?id=${encodeURIComponent(videoId)}`, { signal: controller.signal });
        if (!resp.ok && resp.status === 404) {
          resp = await fetch(`/api/stream.py?id=${encodeURIComponent(videoId)}`, { signal: controller.signal });
        }
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          if (data.status === 'success' && data.stream?.audioUrl) {
            audioUrl = data.stream.audioUrl;
          }
        }
      } catch (errBackend) {
        console.warn('[AudioEngine Backend Fetch]:', errBackend.message);
      }

      // 2. Fallback de cliente directo (CORS) para garantizar reproducción en pantalla bloqueada
      if (!audioUrl) {
        try {
          const directResp = await fetch(`https://invidious.f5.si/api/v1/videos/${encodeURIComponent(videoId)}`);
          if (directResp.ok) {
            const dData = await directResp.json();
            const formats = dData.adaptiveFormats || [];
            const best = formats.find(f => (f.type && f.type.includes('audio/mp4')) || f.container === 'm4a')
              || formats.find(f => f.type && f.type.includes('audio'));
            if (best && best.url) {
              audioUrl = best.url;
            }
          }
        } catch (errDirect) {
          console.warn('[AudioEngine Direct Fetch]:', errDirect.message);
        }
      }

      // 3. Promover a elemento <audio> nativo de iOS si obtuvimos el stream
      if (audioUrl && this.currentTrack && this.currentTrack.id === videoId) {
        console.info('[Gomezfy Engine]: Stream m4a nativo activo para reproducción con pantalla bloqueada en iOS.');
        const currentTime = this.ytPlayer?.getCurrentTime?.() || 0;

        this.isUsingNativeAudio = true;
        this.audioElement.src = audioUrl;

        if (currentTime > 1) {
          this.audioElement.addEventListener('loadedmetadata', () => {
            try {
              this.audioElement.currentTime = currentTime;
            } catch (_) {}
          }, { once: true });
        }

        try {
          await this.audioElement.play();
          // Pausar YouTube Iframe una vez que el audio nativo comenzó a sonar
          if (this.ytPlayer && this.ytPlayer.pauseVideo) {
            this.ytPlayer.pauseVideo();
          }
          this._actualizarMediaSessionState('playing');
        } catch (err) {
          console.warn('[AudioEngine]: Fallback a YouTube player:', err);
          this.isUsingNativeAudio = false;
          if (this.ytPlayer && this.ytPlayer.playVideo) {
            this.ytPlayer.playVideo();
          }
        }
      }
    } catch (e) {
      console.warn('[Gomezfy Engine]: Manteniendo reproducción estándar:', e.message);
    }
  }

  _reproducirConYouTube(videoId, track) {
    if (!this.ytPlayer || !this.ytPlayer.loadVideoById) {
      this.pendingVideoId = videoId;
      this.pendingTrack = track;
      return;
    }

    try {
      this.ytPlayer.loadVideoById({
        videoId: videoId,
        startSeconds: 0
      });
      this.ytPlayer.playVideo();
    } catch (e) {
      console.warn('Error en loadVideoById:', e);
    }
  }

  play() {
    this.currentState = PlaybackState.PLAYING;
    this._emit('stateChange', this.currentState);

    if (this.isUsingNativeAudio && this.audioElement) {
      this.audioElement.play().catch(() => {});
    } else if (this.ytPlayer && this.ytPlayer.playVideo) {
      this.ytPlayer.playVideo();
    }
  }

  pause() {
    this.currentState = PlaybackState.PAUSED;
    this._emit('stateChange', this.currentState);

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
