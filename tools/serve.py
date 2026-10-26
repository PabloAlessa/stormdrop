"""Servidor local con tipos MIME correctos (en Windows, .js puede servirse como text/plain).

Uso: python tools/serve.py [puerto] [carpeta]   ·   p. ej. python tools/serve.py 8125 dist
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Segundo argumento opcional: carpeta a servir (p. ej. dist para probar el build de producción)
if len(sys.argv) > 2:
    ROOT = os.path.join(ROOT, sys.argv[2])


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'Stormdrop en http://localhost:{PORT}')
    httpd.serve_forever()
