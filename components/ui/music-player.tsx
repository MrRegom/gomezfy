import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat } from 'lucide-react';

// Helper to format time from seconds to MM:SS
const formatTime = (timeInSeconds: number): string => {
  if (isNaN(timeInSeconds)) return '00:00';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Interface for the component props
export interface MusicPlayerProps {
  albumArt: string;
  songTitle: string;
  artistName: string;
  audioSrc: string;
  onNext?: () => void;
  onPrev?: () => void;
}

// The main MusicPlayer component
export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  albumArt,
  songTitle,
  artistName,
  audioSrc,
  onNext,
  onPrev
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLInputElement>(null);

  // Setup MediaSession for background and lockscreen controls (iOS & Android)
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: songTitle,
        artist: artistName,
        album: 'Gomezfy',
        artwork: [
          { src: albumArt, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        setIsPlaying(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        setIsPlaying(false);
      });
      if (onPrev) {
        navigator.mediaSession.setActionHandler('previoustrack', onPrev);
      }
      if (onNext) {
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
      }
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && audioRef.current) {
          audioRef.current.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      });
    }
  }, [songTitle, artistName, albumArt, onNext, onPrev]);

  // Effect to handle audio playback and updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration || 0,
            playbackRate: audio.playbackRate,
            position: audio.currentTime || 0
          });
        } catch (e) {
          // ignore
        }
      }
    };

    const setAudioTime = () => {
      setCurrentTime(audio.currentTime);
      if (progressBarRef.current) {
        const progress = audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
        progressBarRef.current.style.setProperty('--progress', `${progress}%`);
      }
    };

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);

    if (isPlaying) {
      audio.play().then(() => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }).catch(error => console.error("Error playing audio:", error));
    } else {
      audio.pause();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
    
    // Cleanup event listeners
    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
    };
  }, [isPlaying, audioSrc]);

  // Handle seeking through the song
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const togglePlayPause = () => setIsPlaying(!isPlaying);
  const toggleShuffle = () => setIsShuffle(!isShuffle);
  const toggleRepeat = () => setIsRepeat(!isRepeat);

  return (
    <div className="w-full max-w-sm mx-auto bg-[hsl(var(--background,#121212))] text-[hsl(var(--foreground,#f5f5f5))] rounded-3xl shadow-2xl p-6 flex flex-col items-center font-sans border border-white/5 backdrop-blur-xl">
       <style>{`
        .progress-bar {
            --progress: 0%;
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 6px;
            background: hsl(var(--muted, 0 0% 20%));
            border-radius: 9999px;
            outline: none;
            cursor: pointer;
            background-image: linear-gradient(hsl(var(--primary, 142 71% 45%)), hsl(var(--primary, 142 71% 45%)));
            background-size: var(--progress) 100%;
            background-repeat: no-repeat;
            transition: height 0.15s ease;
        }

        .progress-bar:hover {
            height: 8px;
        }

        .progress-bar::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            background: #ffffff;
            border: 2px solid hsl(var(--primary, 142 71% 45%));
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }

        .progress-bar::-moz-range-thumb {
            width: 14px;
            height: 14px;
            background: #ffffff;
            border: 2px solid hsl(var(--primary, 142 71% 45%));
            border-radius: 50%;
            cursor: pointer;
        }

        /* Efecto disco de vinilo elegante */
        .vinyl-grooves {
          background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.4) 41%, transparent 42%, rgba(0,0,0,0.4) 60%, transparent 61%, rgba(0,0,0,0.5) 80%, transparent 81%);
        }
       `}</style>

      {/* HTML5 Audio nativo para soporte 100% background audio en iPhone Lockscreen */}
      <audio
        ref={audioRef}
        src={audioSrc}
        loop={isRepeat}
        preload="auto"
        playsInline
      />
      
      {/* Disco Vinilo / Album Art con animación de rotación continua */}
      <motion.div
        className="relative mb-6 cursor-pointer"
        animate={{ rotate: isPlaying ? 360 : 0 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        onClick={togglePlayPause}
      >
        <div className="w-52 h-52 md:w-60 md:h-60 rounded-full p-2 bg-gradient-to-tr from-neutral-900 via-neutral-800 to-neutral-950 shadow-2xl relative flex items-center justify-center border-4 border-neutral-800/80">
          <div className="absolute inset-0 rounded-full vinyl-grooves pointer-events-none" />
          <img
            src={albumArt}
            alt={`${songTitle} album art`}
            className="w-36 h-36 md:w-44 md:h-44 rounded-full object-cover shadow-inner"
            onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80'; }}
          />
          {/* Eje central de vinilo */}
          <div className="w-8 h-8 rounded-full bg-neutral-950 border-2 border-white/20 absolute shadow-inner flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-white/40" />
          </div>
        </div>
      </motion.div>

      {/* Song Info */}
      <div className="text-center mb-6 w-full px-2">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight truncate text-white">{songTitle}</h2>
        <p className="text-sm font-medium text-neutral-400 truncate mt-1">{artistName}</p>
      </div>

      {/* Progress Bar and Timestamps */}
      <div className="w-full flex items-center gap-x-3 mb-4">
        <span className="text-xs font-mono text-neutral-400 w-10 text-left">{formatTime(currentTime)}</span>
        <input
          ref={progressBarRef}
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="progress-bar flex-grow"
        />
        <span className="text-xs font-mono text-neutral-400 w-10 text-right">{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between w-full px-4 pt-1">
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleShuffle}
          className={`transition-colors p-2 ${isShuffle ? 'text-emerald-400' : 'text-neutral-500 hover:text-white'}`}
          aria-label="Aleatorio"
        >
          <Shuffle size={20} />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={onPrev}
          className="text-neutral-200 hover:text-white p-2"
          aria-label="Pista anterior"
        >
          <SkipBack size={26} />
        </motion.button>
        
        <motion.button
          onClick={togglePlayPause}
          className="bg-emerald-500 hover:bg-emerald-400 text-black w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-transform"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isPlaying ? 'pause' : 'play'}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
            >
              {isPlaying ? <Pause size={28} className="fill-black" /> : <Play size={28} className="ml-1 fill-black" />}
            </motion.div>
          </AnimatePresence>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={onNext}
          className="text-neutral-200 hover:text-white p-2"
          aria-label="Pista siguiente"
        >
          <SkipForward size={26} />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleRepeat}
          className={`transition-colors p-2 ${isRepeat ? 'text-emerald-400' : 'text-neutral-500 hover:text-white'}`}
          aria-label="Repetir"
        >
          <Repeat size={20} />
        </motion.button>
      </div>
    </div>
  );
};
