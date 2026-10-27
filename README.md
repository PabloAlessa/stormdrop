# STORMDROP · Battle Royale 3D para navegador

Battle royale en tercera persona con construcción, hecho con Three.js (r160) y JavaScript puro, sin paso de compilación.
Todos los modelos, animaciones, texturas, sonidos y música se generan por código: no hay archivos de arte externos.

> **Nota legal.** Es un juego original del mismo género (salto desde el aire, saqueo, tormenta que se cierra, construcción).
> No usa nombres, logotipos, personajes, mapas, sonidos ni ningún otro recurso de Fortnite/Epic Games.
> Antes de lanzarlo con fines comerciales, verifica que el nombre "Stormdrop" esté libre como marca en tus mercados.

## Documentación de referencia

En [docs/](docs/README.md) está la documentación base del battle royale de referencia (2017–2018): visión, objetivos, alcance,
requisitos funcionales y no funcionales, diseño de juego, arquitectura técnica, riesgos y una comparativa con Stormdrop.

## Novedades 1.3.0

- **Disparo**: cajas de impacto animadas (cabeza, torso y piernas siguen al modelo: agachado, derribado, nadando),
  patrón fijo de perdigones en escopetas y búfer de clic para semiautomáticas.
- **Bots**: puntería que se corrige al rastrear, adelanto y caída de bala, ráfagas y ritmo de tiro, comprobación de la línea
  de tiro, muros de cobertura al recargar, rotación a tiempo con la tormenta y mejor elección de objetivo.
- **Ritmo de partida**: un director regula las bajas entre bots para seguir una curva de ≈16 minutos (antes casi todos
  morían en 4 minutos).
- **Tensión**: pasos enemigos audibles a más distancia, tiroteos lejanos por todo el mapa, latido y sonido apagado con
  poca vida y un zumbido grave cuando un rival cercano te busca o quedan pocos.
- **Audio** menos agresivo: ecualización general, compresión suave y disparos más graves.
- Nombres, vida y escudo sobre los compañeros; cambio de material con clic derecho, Tab o rueda, con aviso.

## Novedades 1.2.0

- **Post-procesado nuevo**: oclusión ambiental en pantalla, rayos de sol, contornos suaves, dispersión atmosférica hacia el sol,
  tonemapping ACES propio con gradación (vibrancia, sombras frías y luces cálidas), nitidez adaptativa, grano de película y aberración de lente.
- **Cabezas esculpidas**: cráneo con mandíbula, mentón, pómulos y arco ciliar; ojos con párpado y pestañas, nariz y labios nuevos.
  El pelo y los gorros se ciñen a esa forma.

## Novedades 1.1.0

- Modos **Dúos** y **Escuadras** con compañeros bot, derribo, arrastre, reanimación y sin fuego amigo.
- **Isla previa** de 20 s para practicar antes del dirigible; tormenta de **9 fases** (≈16 min).
- Construcción completa: **techo** (V), **edición** con T (puerta, ventana, media pared, girar rampa) e **integridad estructural**.
- Armas nuevas: escopeta táctica, rifle con mira, cañón de mano, **lanzacohetes** y **granadas**; consumibles **zumo** y **bidón**.
- **Entregas de suministros** con globo y **cápsulas** de suministros.
- Accesibilidad: **visualización de sonido** y **modo daltónico**.
- Producción: build con dependencias empaquetadas, juego sin conexión (service worker), app instalable, cabeceras de seguridad, CI/CD y telemetría opcional. Ver [docs/09-despliegue.md](docs/09-despliegue.md).

## Ejecutar en local

```bash
python tools/serve.py
```

Abre <http://localhost:8123>. Sirve cualquier servidor estático, siempre que entregue los `.js` como `text/javascript`
(el `http.server` de Python en Windows a veces los envía como `text/plain` y el navegador los rechaza; `tools/serve.py` lo corrige).
Abrir `index.html` con doble clic (`file://`) no funciona: los módulos ES necesitan HTTP.

## Publicar

La carpeta es un juego HTML5 estático. Para itch.io, CrazyGames, Poki, GitHub Pages o Netlify:
comprime `index.html`, `css/` y `js/` en un ZIP y súbelo como juego HTML5 (pantalla 16:9, botón de pantalla completa activado).

Dependencias externas (versiones fijadas): Three.js 0.160.0 desde jsDelivr y las fuentes Anton y Rubik desde Google Fonts.
Si el portal exige funcionar sin conexión, descarga esas URL de `js/lib/three.js` y `js/lib/addons.js` a la carpeta del juego y cambia las rutas.

## Controles

| Acción | PC | Móvil |
|---|---|---|
| Moverse / mirar | WASD / ratón | joystick izquierdo / arrastrar a la derecha |
| Disparar / colocar pieza | clic izquierdo (mantener = construcción continua) | botón rojo |
| Apuntar / cambiar material | clic derecho | ADS / MAT |
| Saltar / desplegar planeador | Espacio | ⤒ |
| Esprintar | Shift | automático con el joystick al máximo |
| Agacharse / deslizarse | C (esprintando = deslizamiento) | ⤓ |
| Recargar / rotar rampa | R | R |
| Recoger / abrir cofre (mantener) | E | USAR |
| Pico / ranuras | 1 o F / 2–6 / rueda | tocar el inventario |
| Muro / suelo / rampa / techo | Q / Z / X / V (F1–F4) | ▮ ▬ ◢ ▲ |
| Editar pieza (mirándola) | T | EDIT |
| Reanimar compañero (mantener) | E | USAR |
| Soltar · Baile · Mapa · Pausa | G · B · M · Esc | MAPA · II |

Ctrl no se usa a propósito: Ctrl+W cierra la pestaña y el navegador no deja bloquearlo.

## Qué incluye

- **Partida completa**: lobby 3D con casillero de 10 atuendos, emparejamiento, dirigible que cruza la isla, caída libre, planeador,
  aterrizaje, saqueo, tormenta en 7 fases, eliminaciones, espectador, pantalla de victoria/derrota y estadísticas guardadas.
- **Isla procedural**: 1,4 km con montaña nevada, lago, playas, caminos, 8 lugares con nombre (pueblos, puerto, granja, fuerte, cabañas),
  más de 1.100 árboles, rocas, arbustos, coches, contenedores, vallas y hierba animada por viento.
- **Todo es destructible y recolectable**: árboles, rocas, coches, paredes de casas, cajas. El pico da madera/piedra/metal y tiene
  punto débil azul (golpe crítico = doble daño y doble material).
- **Construcción en rejilla**: muros, suelos y rampas de madera, piedra o metal; aparecen con progreso de construcción, tienen vida,
  bloquean balas y se rompen. Funciona el "ramp rush" y los bots levantan muros de pánico.
- **Armas**: rifle de asalto, subfusil, escopeta de corredera (recarga cartucho a cartucho), francotirador de cerrojo (proyectil con caída)
  y pistola, en 5 rarezas. Dispersión, "bloom", precisión del primer disparo, daño por distancia, disparos a la cabeza, retroceso de cámara.
- **Consumibles**: vendas, botiquín, poción pequeña y poción de escudo, con tiempos de uso y límites de curación.
- **Movimiento**: aceleración por suelo/aire, tiempo de coyote y búfer de salto, deslizamiento con inercia en pendientes, escalada de bordes,
  nado, subida de escalones, ajuste al bajar rampas, daño por caída.
- **Modelos detallados**: personajes con ojos con iris y brillo, cejas, boca, orejas, peinados con volumen, torso torneado,
  correas, cremallera, cinturón con hebilla, guantes con dedos, rodilleras y botas con suela; 10 atuendos y 4 tipos de mochila.
  Cada personaje tiene una versión ligera que se usa a más de 30 m. Las armas tienen rieles, miras con lente luminosa,
  cargadores curvos, cartuchos laterales y franjas de rareza que brillan; también el pico, el planeador a rayas y los consumibles.
  Material con luz de contorno estilizada. Pinos de cuatro niveles, árboles frondosos de dos tonos, arbustos con flores y rocas con musgo.
- **Animación procedural** de todas las acciones: reposo, caminar, correr con giro de cadera, agacharse, deslizarse, saltar, caer, aterrizar,
  escalar, nadar, caída libre, planeo, pico, recarga, corredera/cerrojo, cambio de arma, curarse (vendas/poción/botiquín), construir,
  baile, celebración de victoria, impacto y muerte con desintegración. Las manos sujetan cada arma con IK de dos huesos.
- **Post-procesado**: oclusión ambiental (Alta y Épica), rayos de sol, contornos, dispersión atmosférica, tone mapping ACES, bloom,
  gradación de color, nitidez, grano, viñeta, tinte de tormenta, viñeta de daño con aberración cromática, FXAA, sombras suaves estabilizadas (sin parpadeo), niebla atmosférica, cielo y reflejos de entorno coherentes.
- **IA de bots**: eligen dónde caer repartiéndose, saquean cofres y suelo, eligen arma por distancia, se mueven lateralmente, saltan,
  se agachan, se retiran a curarse, oyen disparos, huyen de la tormenta, esquivan agua y obstáculos, y detectan cuando se atascan.
- **HUD**: vida/escudo, inventario con rareza, munición, materiales, minimapa con zona y ruta, brújula, mapa grande con marcador,
  registro de bajas, números de daño, marcador de impacto, indicadores de dirección del daño, avisos de tormenta y mira dinámica.
- **Audio 100% sintetizado**: al cargar se graba un banco de 57 efectos con 123 variaciones (OfflineAudioContext, ~1 s),
  con reverberación de exterior, sonido binaural (HRTF) para lo cercano, filtrado y eco del paisaje para disparos lejanos,
  compresor y limitador. Disparos por capas (chasquido, cuerpo saturado, golpe grave, cola), recargas por partes según el arma,
  pasos por superficie, impactos de bala por material, pico con golpe crítico, construcción y destrucción por material,
  ambiente (pájaros, olas cerca de la costa, truenos dentro de la tormenta) y música con batería, bajo, acordes y arpegio.
  Si el navegador no admite renderizado offline, las mismas recetas se sintetizan en tiempo real.

## Casos límite contemplados

- `dt` acotado a 50 ms: sin saltos al volver de otra pestaña. Pausa automática al perder el foco o el puntero.
- Sub-pasos de física según velocidad: no se atraviesan paredes ni a velocidad de caída. Red de seguridad que devuelve al terreno.
- Comprobación de techo antes de levantarse; la cámara no atraviesa paredes ni se mete bajo el terreno.
- Picos de `movementX` filtrados (fallo conocido de Chrome); espera obligatoria antes de volver a capturar el ratón tras Esc.
- Si el navegador no permite capturar el ratón (iframes restringidos), el juego sigue con el ratón libre y lo explica en pausa.
- Teclas soltadas al perder el foco (sin "teclas pegadas"); sin Ctrl; F1–F3 sin abrir la ayuda del navegador.
- Recargar se cancela al cambiar de arma; disparar interrumpe la recarga de cartuchos; esprintar se corta al disparar.
- Curarse se cancela al cambiar de ranura o esprintar; no deja usar curas que no harían nada.
- Inventario lleno: intercambia con la ranura actual; los objetos lanzados no se recogen al instante.
- Objetos que vuelven a caer si se destruye el suelo bajo ellos.
- Daño sólo durante la partida; la tormenta ignora el escudo; sin daño por caída al aterrizar con planeador.
- Bots que dejan de perseguir objetivos inalcanzables y rompen lo que les bloquea con el pico.
- Pérdida del contexto WebGL avisada; WebGL 2 no disponible con mensaje claro; errores capturados sin cerrar el juego.
- `localStorage` protegido (modo incógnito o bloqueado no rompe nada) y ajustes saneados al cargar.
- Nombres de jugador escapados en el registro de bajas (sin inyección de HTML).
- Sin fugas entre partidas: geometrías y materiales compartidos y cacheados; verificado con contadores de memoria.
- Recorte por bloques espaciales y por distancia de vegetación, botín y cofres; LOD de animación para personajes lejanos.

## Arquitectura

```
index.html            Interfaz (lobby, HUD, pausa, fin de partida, controles táctiles)
css/style.css         Estilos de toda la UI
js/main.js            Arranque por etapas, máquina de estados, bucle y eventos de partida
js/config.js          Armas, consumibles, rarezas, materiales, fases de tormenta, atuendos
js/lib/               Puntos únicos de importación de Three.js y complementos
js/core/              Matemáticas y ruido, entrada, audio sintetizado, ajustes persistentes
js/render/            Renderizador y post-procesado, cielo/luces/sombras, utilidades de geometría
js/world/             Terreno, física y raycast, mundo y destructibles, construcción, botín, tormenta, dirigible
js/entities/          Esqueleto y animación, piezas de personaje (cerca/lejos), modelos de objetos, personaje compartido, jugador y cámara, IA de bots
js/combat/            Disparos, daño y recolección; efectos con pools (partículas, escombros, trazadoras…)
js/ui/                HUD, menús, lobby 3D, controles táctiles
tools/serve.py        Servidor local con tipos MIME correctos
```

Jugador y bots comparten la misma clase `Character`: los controladores sólo rellenan una "intención" (moverse, apuntar, disparar…),
así ambos obedecen exactamente las mismas reglas de física y combate.

## Calidad gráfica

Baja (sin sombras ni post-procesado, ideal para móvil), Media, Alta y Épica. Se elige en Ajustes y se aplica al instante.
En móvil se activa la interfaz táctil y la calidad baja por defecto; el juego se juega en horizontal.

## Depuración

`window.__game` expone el estado. `__game.debugStep(dt, n)` avanza la simulación `n` pasos y `__game.debugFreeze = true`
detiene el bucle para inspeccionar. Se usaron para las pruebas automáticas de movimiento, armas, construcción, cofres,
recolección, muerte, victoria y una partida completa simulada.

## Qué faltaría para un lanzamiento comercial

- Multijugador real: servidor autoritativo, predicción y reconciliación, emparejamiento y anti-trampas. Hoy los rivales son bots.
- Arte y animación de un equipo artístico (modelos esculpidos, captura de movimiento) y sonido grabado en estudio, si se busca un acabado AAA.
- Edición de piezas, conos/techos, más armas, objetos arrojables y vehículos.
- Pruebas en una gama amplia de dispositivos reales, telemetría, accesibilidad (remapeo de teclas, daltonismo) y más idiomas.
