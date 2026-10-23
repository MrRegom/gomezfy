"""
Módulo de servicio para extracción y resolución de stream de audio directo.
Permite reproducir pistas de YouTube directamente en un elemento HTML5 <audio>
para habilitar reproducción ininterrumpida con pantalla bloqueada en iOS (iPhone).
"""
from http.server import BaseHTTPRequestHandler
import json
import logging
import urllib.parse
from typing import Dict, Any, Optional

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

try:
    from api.youtube_auth import obtener_ruta_cookies
except ImportError:
    from youtube_auth import obtener_ruta_cookies

logger = logging.getLogger(__name__)


class AudioStreamService:
    """Servicio de resolución de URLs de audio nativo (m4a/mp4/aac)."""

    _cache: Dict[str, Dict[str, Any]] = {}
    last_error: str = "None"

    @classmethod
    def obtener_url_audio(cls, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Extrae la URL directa del flujo de audio del video especificado.
        Utiliza el cliente móvil oficial de YouTube autenticado para evadir desafíos JS en Vercel.
        """
        if not video_id or not video_id.strip():
            cls.last_error = "Video ID empty"
            return None

        clean_id = video_id.strip()

        # Caché en memoria para respuesta instantánea (0ms)
        if clean_id in cls._cache:
            return cls._cache[clean_id]

        if not yt_dlp:
            cls.last_error = "yt_dlp no esta instalado en Vercel"
            logger.error("yt_dlp no está instalado en el entorno.")
            return None

        ruta_cookies = obtener_ruta_cookies()

        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'cachedir': False,
            'socket_timeout': 8,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios']
                }
            }
        }

        if ruta_cookies:
            ydl_opts['cookiefile'] = ruta_cookies

        url = f"https://www.youtube.com/watch?v={clean_id}"

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    cls.last_error = "extract_info devolvio None"
                    return None

                audio_url = info.get('url')
                duration = info.get('duration', 0)
                title = info.get('title', '')
                thumbnail = info.get('thumbnail', '')

                if not audio_url:
                    cls.last_error = "No se encontro audio_url en info"
                    return None

                resultado = {
                    "id": clean_id,
                    "title": title,
                    "audioUrl": audio_url,
                    "duration": duration,
                    "thumbnail": thumbnail,
                    "format": info.get('ext', 'm4a')
                }

                # Limitar tamaño de caché a 100 elementos FIFO
                if len(cls._cache) >= 100:
                    cls._cache.pop(next(iter(cls._cache)))
                cls._cache[clean_id] = resultado

                return resultado
        except Exception as e:
            cls.last_error = f"{type(e).__name__}: {str(e)}"
            logger.exception("Error al resolver stream para el video %s: %s", clean_id, e)
            return None


class handler(BaseHTTPRequestHandler):
    """Manejador Serverless para Vercel Functions."""

    def do_GET(self):
        partes_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(partes_url.query)
        video_id = params.get("id", [""])[0]

        resultado = AudioStreamService.obtener_url_audio(video_id)
        if resultado and resultado.get("audioUrl"):
            respuesta = json.dumps({"status": "success", "stream": resultado}, ensure_ascii=False)
            self.send_response(200)
        else:
            respuesta = json.dumps({
                "status": "error",
                "message": "No se pudo extraer flujo de audio.",
                "debug": AudioStreamService.last_error,
                "yt_dlp_available": yt_dlp is not None
            }, ensure_ascii=False)
            self.send_response(200)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=1800")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
