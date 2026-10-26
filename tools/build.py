"""Build de producción de Stormdrop.

Genera dist/ listo para publicar en cualquier hosting estático (GitHub Pages, Netlify, Cloudflare Pages, itch.io…):
  - copia index.html, css/ y js/
  - empaqueta Three.js dentro del juego (vendor/) para no depender del CDN en producción
  - añade manifiesto PWA, icono, service worker (juego sin conexión) y cabeceras de seguridad
  - escribe build.json con versión, fecha y huella del código
  - crea un ZIP para portales de juegos HTML5

Uso:  python tools/build.py            (descarga Three.js la primera vez y la guarda en tools/.cache)
      python tools/build.py --cdn      (no empaqueta Three.js; usa el CDN como en desarrollo)
      python tools/build.py --telemetry https://mi-servidor/eventos   (activa el envío de telemetría)
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.request
import zipfile

# La consola de Windows usa cp1252: forzar UTF-8 para los mensajes
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
CACHE = os.path.join(ROOT, 'tools', '.cache')
THREE = '0.160.0'
CDN = f'https://cdn.jsdelivr.net/npm/three@{THREE}'
ADDONS = [
    'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/UnrealBloomPass.js',
    'postprocessing/ShaderPass.js', 'postprocessing/OutputPass.js', 'shaders/FXAAShader.js',
]


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('  descargando', url)
        req = urllib.request.Request(url, headers={'User-Agent': 'stormdrop-build'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
    return read(path)


def version():
    m = re.search(r"export const VERSION = '([^']+)'", read(os.path.join(ROOT, 'js', 'config.js')))
    return m.group(1) if m else '0.0.0'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cdn', action='store_true', help='no empaquetar Three.js')
    ap.add_argument('--telemetry', default='', help='URL que recibe los eventos de telemetría (POST JSON)')
    args = ap.parse_args()

    ver = version()
    print(f'Stormdrop {ver} → dist/')
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    shutil.copytree(os.path.join(ROOT, 'css'), os.path.join(DIST, 'css'))
    shutil.copytree(os.path.join(ROOT, 'js'), os.path.join(DIST, 'js'))

    # Three.js empaquetado: las builds ESM de jsDelivr importan "/npm/three@x/+esm"; se reescribe a ruta local.
    if not args.cdn:
        vend = os.path.join(DIST, 'vendor', 'three')
        core = fetch(f'{CDN}/+esm', 'three.module.js')
        write(os.path.join(vend, 'three.module.js'), core)
        exports = []
        for a in ADDONS:
            name = a.split('/')[-1]
            code = fetch(f'{CDN}/examples/jsm/{a}/+esm', name)
            code = code.replace(f'"/npm/three@{THREE}/+esm"', '"./three.module.js"')
            if re.search(r'(from|import)\s*"/npm/', code):
                sys.exit(f'Dependencia inesperada en {a}: revisa el empaquetado')
            write(os.path.join(vend, name), code)
            cls = re.search(r'export\s*\{[^}]*\bas\s+(\w+)\s*\}', code)
            exports.append((name, cls.group(1) if cls else name[:-3]))
        write(os.path.join(DIST, 'js', 'lib', 'three.js'), "// Three.js empaquetado en vendor/ (build de producción)\nexport * from '../../vendor/three/three.module.js';\n")
        write(os.path.join(DIST, 'js', 'lib', 'addons.js'), '// Complementos de Three.js empaquetados (build de producción)\n' + ''.join(
            f"export {{ {n[:-3]} }} from '../../vendor/three/{n}';\n" for n, _ in exports))

    # Huella del código para invalidar cachés
    h = hashlib.sha256()
    for base, _, files in os.walk(DIST):
        for fn in sorted(files):
            with open(os.path.join(base, fn), 'rb') as f:
                h.update(f.read())
    build = {'version': ver, 'hash': h.hexdigest()[:12], 'date': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
             'sw': True, 'telemetry': args.telemetry}
    write(os.path.join(DIST, 'build.json'), json.dumps(build, indent=2))

    # index.html con la información del build, manifiesto y sin preload del CDN
    html = read(os.path.join(ROOT, 'index.html'))
    if not args.cdn:
        html = re.sub(r'<link rel="modulepreload"[^>]*>\n', '', html)
    html = html.replace('<link rel="stylesheet" href="css/style.css">',
                        '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="css/style.css">')
    html = html.replace('<script type="module" src="js/main.js"></script>',
                        f'<script>window.STORMDROP_BUILD = {json.dumps(build)};</script>\n<script type="module" src="js/main.js?v={build["hash"]}"></script>')
    write(os.path.join(DIST, 'index.html'), html)

    write(os.path.join(DIST, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#0b1430"/>'
          '<path d="M140 330c40 40 200 40 230-20 26-56-60-70-120-80-60-10-80-60-40-90 40-30 140-20 170 10" fill="none" stroke="#ffe14d" stroke-width="56" stroke-linecap="round"/>'
          '<path d="M256 96l40 70h-80z" fill="#2aa8ff"/></svg>')
    write(os.path.join(DIST, 'manifest.webmanifest'), json.dumps({
        'name': 'Stormdrop', 'short_name': 'Stormdrop', 'start_url': './', 'display': 'fullscreen', 'orientation': 'landscape',
        'background_color': '#0b1430', 'theme_color': '#0b1430', 'lang': 'es',
        'icons': [{'src': 'icon.svg', 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any maskable'}],
    }, indent=2, ensure_ascii=False))

    # Service worker: caché por versión; index y build.json en red primero para recibir actualizaciones
    files = []
    for base, _, fs in os.walk(DIST):
        for fn in fs:
            rel = os.path.relpath(os.path.join(base, fn), DIST).replace(os.sep, '/')
            if rel != 'sw.js':
                files.append('./' + rel)
    write(os.path.join(DIST, 'sw.js'), f"""// Service worker generado por tools/build.py — {ver} ({build['hash']})
const CACHE = 'stormdrop-{build['hash']}';
const FILES = {json.dumps(sorted(files + ['./']))};
self.addEventListener('install', (e) => {{ e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', (e) => {{ e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', (e) => {{
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const fresh = url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('build.json'));
  if (fresh) {{ e.respondWith(fetch(e.request).then((r) => {{ const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }}).catch(() => caches.match(e.request))); return; }}
  e.respondWith(caches.match(e.request, {{ ignoreSearch: true }}).then((hit) => hit || fetch(e.request).then((r) => {{
    if (r.ok && (url.origin === location.origin || url.host.endsWith('gstatic.com') || url.host.endsWith('googleapis.com'))) {{ const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); }}
    return r;
  }})));
}});
""")

    # Cabeceras para Netlify / Cloudflare Pages (en GitHub Pages se ignoran sin efecto)
    csp = ("default-src 'self'; script-src 'self' 'unsafe-inline'" + ('' if not args.cdn else ' https://cdn.jsdelivr.net') +
           "; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; "
           "connect-src 'self'" + (f' {args.telemetry}' if args.telemetry else '') + " https://fonts.googleapis.com https://fonts.gstatic.com" +
           ('' if not args.cdn else ' https://cdn.jsdelivr.net') + "; worker-src 'self' blob:; frame-ancestors *")
    write(os.path.join(DIST, '_headers'), f"""/*
  Content-Security-Policy: {csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/build.json
  Cache-Control: no-cache
/vendor/*
  Cache-Control: public, max-age=31536000, immutable
""")

    # ZIP para portales HTML5 (itch.io, CrazyGames, Poki…)
    zpath = os.path.join(DIST, f'stormdrop-{ver}.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, fs in os.walk(DIST):
            for fn in fs:
                full = os.path.join(base, fn)
                if full == zpath:
                    continue
                z.write(full, os.path.relpath(full, DIST))
    size = sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(DIST) for f in fs)
    print(f'Listo: {build["hash"]} · {len(files)} archivos · {size / 1e6:.1f} MB (incluye ZIP)')


if __name__ == '__main__':
    main()
