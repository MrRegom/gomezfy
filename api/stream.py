"""
Módulo de servicio para extracción y resolución de stream de audio directo.
Permite reproducir pistas de YouTube directamente en un elemento HTML5 <audio>
para habilitar reproducción en segundo plano y controles en la pantalla de bloqueo de iOS (iPhone).
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

logger = logging.getLogger(__name__)


class AudioStreamService:
    """Servicio de resolución de URLs de audio nativo (m4a/aac/mp3)."""

    _cache: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def obtener_url_audio(cls, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Extrae la URL directa del flujo de audio del video especificado.
        Utiliza caché en memoria para minimizar tiempos de respuesta.
        """
        if not video_id or not video_id.strip():
            return None

        clean_id = video_id.strip()

        # Verificar caché en memoria
        if clean_id in cls._cache:
            return cls._cache[clean_id]

        if not yt_dlp:
            logger.error("yt_dlp no está instalado en el entorno.")
            return None

        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'cachedir': False,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'web', 'ios']
                }
            }
        }

        url = f"https://www.youtube.com/watch?v={clean_id}"

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return None

                audio_url = info.get('url')
                duration = info.get('duration', 0)
                title = info.get('title', '')
                thumbnail = info.get('thumbnail', '')

                resultado = {
                    "id": clean_id,
                    "title": title,
                    "audioUrl": audio_url,
                    "duration": duration,
                    "thumbnail": thumbnail,
                    "format": info.get('ext', 'm4a')
                }

                # Guardar en caché (máximo 100 elementos)
                if len(cls._cache) > 100:
                    cls._cache.pop(next(iter(cls._cache)))
                cls._cache[clean_id] = resultado

                return resultado
        except Exception as e:
            logger.exception("Error al resolver URL de audio para el video %s: %s", clean_id, e)
            return None


class handler(BaseHTTPRequestHandler):
    """Manejador Serverless para Vercel."""

    def do_GET(self):
        partes_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(partes_url.query)
        video_id = params.get("id", [""])[0]

        resultado = AudioStreamService.obtener_url_audio(video_id)
        if resultado and resultado.get("audioUrl"):
            respuesta = json.dumps({"status": "success", "stream": resultado}, ensure_ascii=False)
            self.send_response(200)
        else:
            respuesta = json.dumps({"status": "error", "message": "No se pudo extraer flujo de audio."}, ensure_ascii=False)
            self.send_response(404)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=1800")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
