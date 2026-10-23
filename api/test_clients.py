from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yt_dlp

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        clients_to_test = [
            ['web_embedded'],
            ['tv_embedded'],
            ['android_testsuite'],
            ['ios'],
            ['mweb'],
            ['tv']
        ]
        
        results = {}
        for c in clients_to_test:
            c_name = "+".join(c)
            opts = {
                'format': 'bestaudio/best',
                'quiet': True,
                'no_warnings': True,
                'socket_timeout': 5,
                'extractor_args': {'youtube': {'player_client': c}}
            }
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info('yKNxeF4KMsY', download=False)
                    url = info.get('url')
                    results[c_name] = {"success": True, "url_len": len(url) if url else 0}
            except Exception as e:
                results[c_name] = {"success": False, "error": str(e)[:120]}

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(results, indent=2).encode("utf-8"))
