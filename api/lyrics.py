"""
Endpoint Serverless para Vercel: Consulta de letras sincronizadas y planas.
Aplica Clean Architecture: orquesta la obtención y normalización de letras vía LRCLIB.
"""
from http.server import BaseHTTPRequestHandler
import json
import re
import urllib.parse
import urllib.request


class LyricsService:
    """Servicio de obtención y limpieza de metadatos de letras musicales."""

    @staticmethod
    def limpiar_titulo(titulo: str) -> str:
        """Remueve sufijos típicos de YouTube para maximizar coincidencias."""
        limpio = re.sub(
            r"\(.*?(official|video|audio|lyric|remastered|hd|4k|videoclip|en vivo).*?\)",
            "",
            titulo,
            flags=re.IGNORECASE,
        )
        limpio = re.sub(
            r"\[.*?(official|video|audio|lyric|remastered|hd|4k|videoclip|en vivo).*?\]",
            "",
            limpio,
            flags=re.IGNORECASE,
        )
        limpio = re.sub(r"ft\.?|feat\.?", " ", limpio, flags=re.IGNORECASE)
        return limpio.strip()

    @classmethod
    def obtener_letra(cls, titulo: str, artista: str = "") -> dict:
        titulo_limpio = cls.limpiar_titulo(titulo)

        # 1. Intento por búsqueda directa (mayor tasa de éxito que coincidencia estricta)
        termino = f"{titulo_limpio} {artista}".strip()
        url = f"https://lrclib.net/api/search?q={urllib.parse.quote(termino)}"

        req = urllib.request.Request(url, headers={"User-Agent": "GomezfyMusicPlayer/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    coincidencias = json.loads(resp.read().decode("utf-8"))
                    if coincidencias and isinstance(coincidencias, list):
                        primera = coincidencias[0]
                        return {
                            "found": True,
                            "plainLyrics": primera.get("plainLyrics") or "",
                            "syncedLyrics": primera.get("syncedLyrics") or "",
                            "trackName": primera.get("trackName") or titulo_limpio,
                            "artistName": primera.get("artistName") or artista,
                        }
        except Exception:
            pass

        return {
            "found": False,
            "plainLyrics": "Letra no disponible para esta canción.",
            "syncedLyrics": "",
            "trackName": titulo,
            "artistName": artista,
        }


class handler(BaseHTTPRequestHandler):
    """Manejador HTTP para la función Serverless de Vercel."""

    def do_GET(self):
        partes = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(partes.query)
        track = params.get("track", [""])[0]
        artist = params.get("artist", [""])[0]

        resultado = LyricsService.obtener_letra(track, artist)

        respuesta = json.dumps(resultado, ensure_ascii=False)

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
