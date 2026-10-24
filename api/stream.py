"""
Módulo Serverless para Vercel: Extracción y resolución de stream de audio directo.
Permite reproducir pistas de audio directamente en un elemento HTML5 <audio> (.m4a / AAC)
para garantizar reproducción ininterrumpida con pantalla bloqueada en iOS (iPhone).
"""
from http.server import BaseHTTPRequestHandler
import json
import logging
import os
import shutil
from pathlib import Path
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

try:
    from .cookies_data import YOUTUBE_COOKIES_TEXT
except ImportError:
    try:
        from cookies_data import YOUTUBE_COOKIES_TEXT
    except ImportError:
        try:
            from api.cookies_data import YOUTUBE_COOKIES_TEXT
        except ImportError:
            YOUTUBE_COOKIES_TEXT = ""

logger = logging.getLogger(__name__)


class AudioStreamService:
    """Servicio multi-estrategia de resolución de URLs de audio nativo (.m4a / AAC)."""

    _cache: Dict[str, Dict[str, Any]] = {}
    ytdlp_error: str = "None"
    invidious_error: str = "None"
    cookie_info: str = "None"

    @classmethod
    def obtener_url_audio(cls, video_id: str) -> Optional[Dict[str, Any]]:
        if not video_id or not video_id.strip():
            cls.ytdlp_error = "Video ID vacío"
            return None

        clean_id = video_id.strip()

        # 1. Caché en memoria (0ms)
        if clean_id in cls._cache:
            return cls._cache[clean_id]

        # 2. Estrategia Primaria: yt-dlp con android_vr y cookies
        if yt_dlp:
            resultado_ytdlp = cls._resolver_via_ytdlp(clean_id)
            if resultado_ytdlp and resultado_ytdlp.get("audioUrl"):
                cls._guardar_en_cache(clean_id, resultado_ytdlp)
                return resultado_ytdlp

        # 3. Estrategia Secundaria: Fallback resiliente a Invidious
        resultado_invidious = cls._resolver_via_invidious(clean_id)
        if resultado_invidious and resultado_invidious.get("audioUrl"):
            cls._guardar_en_cache(clean_id, resultado_invidious)
            return resultado_invidious

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
                with urllib.request.urlopen(req, timeout=1.5) as resp:
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
                cls.invidious_error = f"Invidious {base}: {e}"
                continue

        return None

    @classmethod
    def _obtener_ruta_cookies(cls) -> Optional[str]:
        """Prepara las cookies en /tmp (único directorio con permisos de escritura en Vercel/AWS Lambda)."""
        tmp_dir = "/tmp" if os.path.exists("/tmp") else os.environ.get("TEMP", "/tmp")
        tmp_cookie = os.path.join(tmp_dir, "youtube_cookies.txt")
        if os.path.exists(tmp_cookie) and os.path.getsize(tmp_cookie) > 100:
            cls.cookie_info = f"Existing tmp cookie, size={os.path.getsize(tmp_cookie)}"
            return tmp_cookie

        if YOUTUBE_COOKIES_TEXT:
            try:
                with open(tmp_cookie, "w", encoding="utf-8") as f:
                    f.write(YOUTUBE_COOKIES_TEXT)
                cls.cookie_info = f"Wrote tmp cookie, size={len(YOUTUBE_COOKIES_TEXT)}"
                return tmp_cookie
            except Exception as e:
                cls.cookie_info = f"Error writing cookie: {e}"
                logger.warning(f"Error escribiendo cookies a {tmp_cookie}: {e}")
        else:
            cls.cookie_info = "YOUTUBE_COOKIES_TEXT is empty or not imported"

        return None

    @classmethod
    def _resolver_via_ytdlp(cls, video_id: str) -> Optional[Dict[str, Any]]:
        cookie_path = cls._obtener_ruta_cookies()
        ydl_opts = {
            'format': 'ba/b',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'cachedir': False,
            'socket_timeout': 6,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android_vr', 'android', 'web'],
                    'player_skip': ['web_creator']
                }
            }
        }
        if cookie_path:
            ydl_opts['cookiefile'] = cookie_path

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
                        "format": info.get('ext', 'mp4')
                    }
        except Exception as e:
            cls.ytdlp_error = f"yt_dlp: {e}"
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
                "debug": {
                    "ytdlp": AudioStreamService.ytdlp_error,
                    "invidious": AudioStreamService.invidious_error,
                    "cookie": AudioStreamService.cookie_info
                }
            }, ensure_ascii=False)
            self.send_response(200)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=1800")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
