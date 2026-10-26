"""Comprobaciones de calidad previas a publicar (se ejecutan en CI y en local).

  1. Sintaxis de todos los módulos JS (node --check).
  2. Todas las importaciones relativas apuntan a archivos existentes.
  3. Los ids que el JS busca con getElementById existen en index.html.
  4. Cada requisito de la matriz de trazabilidad tiene un estado válido.

Uso: python tools/check.py
"""
import os
import re
import subprocess
import sys

# La consola de Windows usa cp1252: forzar UTF-8 para los mensajes
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []
js = []
for base, _, files in os.walk(os.path.join(ROOT, 'js')):
    js += [os.path.join(base, f) for f in files if f.endswith('.js')]

for f in js:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    if r.returncode != 0:
        errors.append(f'Sintaxis: {os.path.relpath(f, ROOT)}\n{r.stderr.strip()}')
    src = open(f, encoding='utf-8').read()
    for imp in re.findall(r"from\s+'(\.[^']+)'", src):
        target = os.path.normpath(os.path.join(os.path.dirname(f), imp))
        if not os.path.exists(target):
            errors.append(f'Importación rota en {os.path.relpath(f, ROOT)}: {imp}')

html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
ids = set(re.findall(r'id="([^"]+)"', html))
for f in js:
    src = open(f, encoding='utf-8').read()
    for i in re.findall(r"getElementById\('([^']+)'\)", src) + re.findall(r"\$\('([^']+)'\)", src):
        if i not in ids:
            errors.append(f'Elemento #{i} usado en {os.path.relpath(f, ROOT)} no existe en index.html')

trace = os.path.join(ROOT, 'docs', '08-trazabilidad.md')
if os.path.exists(trace):
    for line in open(trace, encoding='utf-8'):
        m = re.match(r'\|\s*(R(?:N)?F-[A-Z]+-\d+)\s*\|', line)
        if m and not any(t in line for t in ('✅', '🟡', '❌', '⛔')):
            errors.append(f'Requisito sin estado en la matriz: {m.group(1)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'OK · {len(js)} módulos, {len(ids)} elementos de interfaz comprobados')
