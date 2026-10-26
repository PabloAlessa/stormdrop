# 09 · Despliegue y operación

Cubre el ciclo completo de Stormdrop: desarrollo, comprobaciones, build, publicación, actualización, monitorización y vuelta atrás.

## 1. Entornos

| Entorno | Cómo se obtiene | Dependencias | Para qué |
|---|---|---|---|
| Desarrollo | `python tools/serve.py` → <http://localhost:8123> | Three.js desde jsDelivr | Programar y probar |
| Build local | `python tools/build.py` y `python tools/serve.py 8125 dist` | Todo empaquetado | Probar exactamente lo que se publica |
| Producción | GitHub Pages (automático desde `main`), Netlify o Cloudflare Pages | Todo empaquetado | Jugadores |
| Portales HTML5 | Subir `dist/stormdrop-<versión>.zip` | Todo empaquetado | itch.io, CrazyGames, Poki… |

## 2. Pipeline

```
push / PR ──▶ tools/check.py ──▶ tools/build.py ──▶ (main) GitHub Pages
                 │                    │
                 │                    └─ artefacto stormdrop-html5.zip
                 └─ sintaxis JS, importaciones, ids de interfaz, matriz de trazabilidad
```

- **`tools/check.py`** falla si un módulo no compila, una importación apunta a un archivo inexistente, el JS usa un elemento que no está en `index.html` o un requisito de la matriz no tiene estado.
- **`tools/build.py`** genera `dist/`:
  - Three.js 0.160.0 empaquetado en `vendor/` (el juego no depende del CDN).
  - `build.json` con versión, fecha y huella del código.
  - `manifest.webmanifest` e icono: el juego se puede instalar como aplicación.
  - `sw.js`: caché por versión. Funciona sin conexión tras la primera visita y se actualiza solo al publicar una versión nueva.
  - `_headers`: CSP, `nosniff`, política de *referrer*, permisos y caché inmutable para `vendor/`.
  - `stormdrop-<versión>.zip`: el paquete para portales.
- **`.github/workflows/deploy.yml`**: en cada PR ejecuta comprobación y build; en `main`, además, publica en GitHub Pages.
- **`netlify.toml`**: alternativa equivalente para Netlify.

## 3. Publicar una versión (checklist)

1. Subir `VERSION` en `js/config.js` (semver: corrección = parche, contenido nuevo = menor).
2. `python tools/check.py` sin errores.
3. `python tools/build.py`, y después `python tools/serve.py 8125 dist`, y jugar una partida en Solo y otra en Escuadras.
4. Revisar la consola del navegador: sin errores.
5. Actualizar [08 · Trazabilidad](08-trazabilidad.md) si cambió algún requisito.
6. Hacer merge a `main`: el flujo publica solo. Para portales, subir el ZIP del artefacto.
7. Comprobar en producción que la etiqueta de versión del lobby muestra la huella nueva.

**Primera vez en GitHub:** el proyecto aún no es un repositorio git.
1. Crea el repositorio y súbelo.
2. En *Settings → Pages*, elige **GitHub Actions** como origen.
3. Opcional: crea la variable `TELEMETRY_URL` en *Settings → Variables* para activar la telemetría.

## 4. Operación

| Tema | Cómo |
|---|---|
| Telemetría | Desactivada por defecto. Con `--telemetry https://…` (o la variable `TELEMETRY_URL`), el juego envía por `sendBeacon` lotes JSON con `match_start`, `match_end`, `perf` (FPS por minuto) y `error`. Sólo lleva un identificador de sesión aleatorio, sin datos personales. El receptor puede ser cualquier endpoint HTTPS que acepte POST: una función serverless, Supabase o similar. |
| Errores | Se capturan globalmente, el juego se recupera y se avisa al jugador con un mensaje discreto; si hay telemetría, también se envían. |
| Equilibrio | Armas, rarezas, consumibles, tormenta y modos están en `js/config.js`: se cambia ahí y se publica. |
| Vuelta atrás | Revertir el commit en `main` (el flujo republica la versión anterior) o volver a subir el ZIP anterior. El service worker toma la versión nueva al recargar. |
| Caché | `index.html`, `sw.js` y `build.json` sin caché; `vendor/` inmutable; el resto lleva la huella en la URL del módulo principal. |

## 5. Fase siguiente: servicios en línea

Lo marcado con ⛔ en la matriz necesita infraestructura y cuentas que no se pueden crear desde el código del juego.

| Bloque | Propuesta | Qué hace falta de tu parte |
|---|---|---|
| Multijugador | Servidor autoritativo en Node.js (WebSocket) que ejecute la misma simulación (`physics`, `combat`, `storm`) a 30 Hz; el cliente envía la intención (`intent`) y predice su propio movimiento | Hosting de servidores (Fly.io, Hetzner, AWS…) y presupuesto |
| Cuentas y amigos | Proveedor de identidad (Supabase Auth, Firebase, Auth0) y base de datos de perfiles | Proyecto en el proveedor y claves |
| Progresión y tienda | Inventario en servidor, pase de temporada y compras de cosméticos (Stripe o las tiendas de apps) | Cuenta de pagos, datos fiscales y textos legales |
| Antitrampas | Validación en servidor (velocidad, cadencia, línea de visión) y denuncias | Viene con el servidor |
| Móvil nativo y consolas | Empaquetar con Capacitor o Electron; consolas requieren kits de desarrollo y certificación | Cuentas de desarrollador de cada tienda |
