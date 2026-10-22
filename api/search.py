"""
Endpoint Serverless para Vercel: Búsqueda de pistas reproducibles en YouTube.
Aplica filtros estrictos para descartar videos oficiales con restricciones
de inserción (código 150/101 de discográficas como VEVO/Warner/Sony) y garantizar
que el 100% de los resultados mostrados sean inmediatamente reproducibles.
"""
from http.server import BaseHTTPRequestHandler
import json
import re
import urllib.parse
import urllib.request


class YouTubeSearchEngine:
    """Motor de búsqueda filtrado para entregar únicamente pistas reproducibles."""

    @classmethod
    def buscar(cls, query: str, limite: int = 20) -> list:
        if not query or len(query.strip()) < 2:
            return []

        q_limpio = query.strip()
        resultados = cls._ejecutar_extraccion(q_limpio, limite)

        # Si tras filtrar quedan pocos resultados, complementar buscando con sufijo 'audio'
        if len(resultados) < 10:
            complementarios = cls._ejecutar_extraccion(f"{q_limpio} audio", limite)
            ids_existentes = {r["id"] for r in resultados}
            for comp in complementarios:
                if comp["id"] not in ids_existentes:
                    resultados.append(comp)
                    if len(resultados) >= limite:
                        break

        return resultados[:limite]

    @staticmethod
    def _ejecutar_extraccion(query: str, limite: int) -> list:
        query_codificada = urllib.parse.quote(query)
        url = f"https://www.youtube.com/results?search_query={query_codificada}&sp=EgIQAQ%253D%253D"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
        }

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=6) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
        except Exception:
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
        except Exception:
            return []

        items_render = []
        for sec in secciones:
            if "itemSectionRenderer" in sec:
                items_render.extend(sec["itemSectionRenderer"].get("contents", []))

        resultados = []
        for item in items_render:
            if "videoRenderer" in item:
                v = item["videoRenderer"]
                vid_id = v.get("videoId")
                if not vid_id:
                    continue

                titulo = v.get("title", {}).get("runs", [{}])[0].get("text", "Sin título")

                # Detectar si el canal es un canal oficial de artista verificado
                es_canal_artista_oficial = False
                for badge in v.get("ownerBadges", []):
                    badge_style = badge.get("metadataBadgeRenderer", {}).get("style")
                    if badge_style == "BADGE_STYLE_TYPE_VERIFIED_ARTIST":
                        es_canal_artista_oficial = True
                        break

                # Comprobar si es un videoclip oficial restringido por discográficas
                es_video_oficial_bloqueable = bool(
                    re.search(r"official\s*(music)?\s*video|videoclip\s*oficial", titulo, re.IGNORECASE)
                )

                # FILTRO CRÍTICO: Los canales de artistas oficiales que suben "Official Video"
                # bloquean la inserción (código 150/101). Descartamos estos para garantizar
                # que solo mostremos versiones 100% reproducibles (Audio, Lyrics, Live, HQ).
                if es_canal_artista_oficial and es_video_oficial_bloqueable:
                    continue

                # Extraer nombre del canal / artista
                canal = "Artista"
                runs_canal = (
                    v.get("ownerText", {}).get("runs")
                    or v.get("longBylineText", {}).get("runs")
                )
                if runs_canal:
                    canal = runs_canal[0].get("text", "Artista")

                # Extraer portada
                thumbs = v.get("thumbnail", {}).get("thumbnails", [])
                thumb_url = (
                    thumbs[-1].get("url")
                    if thumbs
                    else f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                )

                # Extraer duración
                duracion = v.get("lengthText", {}).get("simpleText", "0:00")

                resultados.append({
                    "id": vid_id,
                    "title": titulo,
                    "artist": canal,
                    "thumbnail": thumb_url,
                    "duration": duracion,
                })

                if len(resultados) >= limite:
                    break

        return resultados


class handler(BaseHTTPRequestHandler):
    """Manejador HTTP para la función Serverless de Vercel."""

    def do_GET(self):
        partes_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(partes_url.query)
        query = params.get("q", [""])[0]

        resultados = YouTubeSearchEngine.buscar(query)

        respuesta = json.dumps({"status": "success", "results": resultados}, ensure_ascii=False)

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=300")
        self.end_headers()
        self.wfile.write(respuesta.encode("utf-8"))
