"""
Servidor local de desarrollo para Gomezfy Music.
Sirve archivos estáticos y enruta las peticiones de /api/search y /api/lyrics.
"""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
import sys
import urllib.parse

# Importar motores directamente
sys.path.insert(0, os.path.dirname(__file__))
from api.search import YouTubeSearchEngine
from api.lyrics import LyricsService
from api.stream import AudioStreamService

PORT = 3000

class LocalDevHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url_parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(url_parsed.query)

        # 1. Endpoint /api/search
        if url_parsed.path in ('/api/search', '/api/search.py'):
            query = params.get('q', [''])[0]
            resultados = YouTubeSearchEngine.buscar(query)
            respuesta = json.dumps({"status": "success", "results": resultados}, ensure_ascii=False)
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(respuesta.encode("utf-8"))
            return

        # 2. Endpoint /api/lyrics
        elif url_parsed.path in ('/api/lyrics', '/api/lyrics.py'):
            track = params.get('track', [''])[0]
            artist = params.get('artist', [''])[0]
            resultado = LyricsService.obtener_letra(track, artist)
            respuesta = json.dumps(resultado, ensure_ascii=False)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(respuesta.encode("utf-8"))
            return

        # 3. Endpoint /api/stream (Stream de audio nativo m4a/aac para reproducción en pantalla bloqueada)
        elif url_parsed.path in ('/api/stream', '/api/stream.py'):
            video_id = params.get('id', [''])[0]
            resultado = AudioStreamService.obtener_url_audio(video_id)
            if resultado and resultado.get('audioUrl'):
                respuesta = json.dumps({"status": "success", "stream": resultado}, ensure_ascii=False)
                self.send_response(200)
            else:
                respuesta = json.dumps({"status": "error", "message": "No se pudo extraer el flujo de audio."}, ensure_ascii=False)
                self.send_response(404)

            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(respuesta.encode("utf-8"))
            return

        # 4. Archivos estáticos normales (index.html, css, js, icons)
        else:
            return super().do_GET()

if __name__ == '__main__':
    os.chdir(os.path.dirname(__file__))
    # 0.0.0.0 permite conectarse desde la misma PC (127.0.0.1) o desde el iPhone en la misma red Wi-Fi
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, LocalDevHandler)
    print(f"Servidor activo en http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
