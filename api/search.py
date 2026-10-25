"""
Módulo Serverless para Vercel: Búsqueda y Feed de Videos de YouTube para GomezTube.
Extrae metadatos ricos: ID, título, canal, avatar del canal, miniatura HQ,
duración, conteo de reproducciones y fecha relativa de publicación.
"""
from http.server import BaseHTTPRequestHandler
import json
import logging
import re
import urllib.parse
import urllib.request
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class YouTubeSearchService:
    """Servicio de búsqueda y extracción de metadatos de videos de YouTube."""

    DEFAULT_TRENDING_QUERY = "tendencias"
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    }

    @classmethod
    def buscar(cls, query: str, limite: int = 24) -> List[Dict[str, Any]]:
        """
        Ejecuta la búsqueda en YouTube. Si el query está vacío,
        devuelve videos en tendencia en español.
        """
        q_limpio = query.strip() if query else cls.DEFAULT_TRENDING_QUERY
        if not q_limpio:
            q_limpio = cls.DEFAULT_TRENDING_QUERY

        return cls._extraer_videos(q_limpio, limite)

    @classmethod
    def _extraer_videos(cls, query: str, limite: int) -> List[Dict[str, Any]]:
        query_encoded = urllib.parse.quote(query)
        # sp=EgIQAQ%253D%253D filtra exclusivamente por videos (descarta canales y listas vacías)
        url = f"https://www.youtube.com/results?search_query={query_encoded}&sp=EgIQAQ%253D%253D"

        req = urllib.request.Request(url, headers=cls.HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            logger.error(f"Error HTTP consultando YouTube: {e}")
            return []

        patron = r"var ytInitialData = ({.*?});</script>"
        coincidencia = re.search(patron, html)
        if not coincidencia:
            patron = r"ytInitialData\s*=\s*({.+?});"
            coincidencia = re.search(patron, html)

        if not coincidencia:
            return []

        try:
            datos = json.loads(coincidencia.group(1))
            secciones = (
                datos.get("contents", {})
                .get("twoColumnSearchResultsRenderer", {})
                .get("primaryContents", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
        except Exception as e:
            logger.error(f"Error parseando JSON de YouTube: {e}")
            return []

        items_render = []
        for sec in secciones:
            if "itemSectionRenderer" in sec:
                items_render.extend(sec["itemSectionRenderer"].get("contents", []))

        resultados: List[Dict[str, Any]] = []
        for item in items_render:
            if "videoRenderer" not in item:
                continue

            v = item["videoRenderer"]
            vid_id = v.get("videoId")
            if not vid_id:
                continue

            # 1. Título
            titulo = v.get("title", {}).get("runs", [{}])[0].get("text", "Sin título")

            # 2. Canal
            canal = "Canal"
            runs_canal = (
                v.get("ownerText", {}).get("runs")
                or v.get("longBylineText", {}).get("runs")
            )
            if runs_canal:
                canal = runs_canal[0].get("text", "Canal")

            # 3. Avatar del Canal
            avatar_url = ""
            channel_thumbs = (
                v.get("channelThumbnailSupportedRenderers", {})
                .get("channelThumbnailWithLinkRenderer", {})
                .get("thumbnail", {})
                .get("thumbnails", [])
            )
            if channel_thumbs:
                avatar_url = channel_thumbs[0].get("url", "")

            # 4. Miniatura del Video
            thumbs = v.get("thumbnail", {}).get("thumbnails", [])
            thumb_url = (
                thumbs[-1].get("url")
                if thumbs
                else f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
            )

            # 5. Duración
            duracion = v.get("lengthText", {}).get("simpleText", "0:00")

            # 6. Vistas y Fecha de Publicación
            vistas = v.get("viewCountText", {}).get("simpleText", "")
            if not vistas:
                short_views = v.get("shortViewCountText", {}).get("simpleText", "")
                vistas = short_views if short_views else "Video"

            publicado = v.get("publishedTimeText", {}).get("simpleText", "")

            resultados.append({
                "id": vid_id,
                "title": titulo,
                "channel": canal,
                "channelAvatar": avatar_url,
                "thumbnail": thumb_url,
                "duration": duracion,
                "views": vistas,
                "published": publicado
            })

            if len(resultados) >= limite:
                break

        return resultados


YouTubeSearchEngine = YouTubeSearchService


class handler(BaseHTTPRequestHandler):
    """Manejador HTTP Serverless para Vercel Functions."""

    def do_GET(self):
        partes_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(partes_url.query)
        query = params.get("q", [""])[0]

        resultados = YouTubeSearchService.buscar(query)

        respuesta = json.dumps(
            {"status": "success", "results": resultados},
            ensure_ascii=False
        )

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=300")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
