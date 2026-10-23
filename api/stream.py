"""
Módulo Serverless para Vercel: Extracción y resolución de stream de audio directo.
Permite reproducir pistas de audio directamente en un elemento HTML5 <audio> (.m4a / AAC)
para garantizar reproducción ininterrumpida con pantalla bloqueada en iOS (iPhone).
"""
from http.server import BaseHTTPRequestHandler
import json
import logging
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

logger = logging.getLogger(__name__)


class AudioStreamService:
    """Servicio multi-estrategia de resolución de URLs de audio nativo (.m4a / AAC)."""

    _cache: Dict[str, Dict[str, Any]] = {}
    last_error: str = "None"

    @classmethod
    def obtener_url_audio(cls, video_id: str) -> Optional[Dict[str, Any]]:
        if not video_id or not video_id.strip():
            cls.last_error = "Video ID vacío"
            return None

        clean_id = video_id.strip()

        # 1. Caché en memoria (0ms)
        if clean_id in cls._cache:
            return cls._cache[clean_id]

        # 2. Estrategia Primaria: API Invidious de alta velocidad y libre de bloqueos de IP
        resultado = cls._resolver_via_invidious(clean_id)
        if resultado and resultado.get("audioUrl"):
            cls._guardar_en_cache(clean_id, resultado)
            return resultado

        # 3. Estrategia Secundaria: yt-dlp con cliente VisionOS (Apple)
        if yt_dlp:
            resultado_ytdlp = cls._resolver_via_ytdlp(clean_id)
            if resultado_ytdlp and resultado_ytdlp.get("audioUrl"):
                cls._guardar_en_cache(clean_id, resultado_ytdlp)
                return resultado_ytdlp

        return None

    @classmethod
    def _guardar_en_cache(cls, clean_id: str, data: Dict[str, Any]):
        if len(cls._cache) >= 100:
            cls._cache.pop(next(iter(cls._cache)))
        cls._cache[clean_id] = data

    @classmethod
    def _resolver_via_invidious(cls, video_id: str) -> Optional[Dict[str, Any]]:
        instances = [
            "https://invidious.f5.si",
            "https://inv.nadeko.net",
            "https://invidious.nerdvpn.de"
        ]
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            "Accept": "application/json"
        }

        for base in instances:
            try:
                url = f"{base}/api/v1/videos/{video_id}"
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    title = data.get("title", "")
                    formats = data.get("adaptiveFormats", [])

                    # Priorizar m4a / mp4a nativo de Apple para iOS Safari
                    best_audio = None
                    for f in formats:
                        m_type = f.get("type", "")
                        container = f.get("container", "")
                        if "audio/mp4" in m_type or container == "m4a":
                            best_audio = f
                            break

                    if not best_audio:
                        for f in formats:
                            if "audio" in f.get("type", ""):
                                best_audio = f
                                break

                    if best_audio and best_audio.get("url"):
                        return {
                            "id": video_id,
                            "title": title,
                            "audioUrl": best_audio["url"],
                            "duration": data.get("lengthSeconds", 0),
                            "format": best_audio.get("container", "m4a")
                        }
            except Exception as e:
                cls.last_error = f"Invidious {base}: {e}"
                continue

        return None

    @classmethod
    def _resolver_via_ytdlp(cls, video_id: str) -> Optional[Dict[str, Any]]:
        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'cachedir': False,
            'socket_timeout': 6,
            'extractor_args': {
                'youtube': {
                    'player_client': ['visionos', 'android'],
                    'player_skip': ['web', 'mweb', 'web_creator']
                }
            }
        }
        url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info and info.get('url'):
                    return {
                        "id": video_id,
                        "title": info.get('title', ''),
                        "audioUrl": info['url'],
                        "duration": info.get('duration', 0),
                        "format": info.get('ext', 'm4a')
                    }
        except Exception as e:
            cls.last_error = f"yt_dlp: {e}"
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
                "debug": AudioStreamService.last_error
            }, ensure_ascii=False)
            self.send_response(200)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=1800")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
