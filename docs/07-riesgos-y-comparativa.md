# 07 · Riesgos y comparativa con Stormdrop

## 1. Riesgos del proyecto original (2017–2018)

| ID | Riesgo | Prob. | Impacto | Mitigación aplicada |
|---|---|---|---|---|
| R-01 | Competidor ya establecido en el género | Alta | Alta | Gratuito, multiplataforma y diferenciado por la construcción |
| R-02 | Servidores desbordados por un crecimiento explosivo | Alta | Alta | Escalado en la nube, colas de acceso, rediseño de bases de datos tras las caídas de 2018 |
| R-03 | Construcción demasiado difícil para jugadores nuevos | Media | Media | La construcción es opcional para empezar; isla previa para practicar; modo Playground |
| R-04 | Trampas (aimbots, wallhacks) | Alta | Alta | Servidor autoritativo, antitrampas en cliente, denuncias, demandas a creadores de trampas |
| R-05 | Rendimiento insuficiente en consola y móvil | Media | Alta | Escalado gráfico, LOD, resolución dinámica, objetivo de 30 FPS |
| R-06 | Desequilibrio de armas o del metajuego | Alta | Media | Telemetría, configuración remota, retirada temporal de armas (*vaulting*) |
| R-07 | Pérdida de interés tras el pico inicial | Media | Alta | Temporadas, pase de batalla, eventos en directo y modos temporales |
| R-08 | Conflictos con las plataformas sobre juego cruzado y pagos | Media | Media | Negociación por fases (PlayStation se abrió en septiembre de 2018) |
| R-09 | Riesgos legales y regulatorios (menores, privacidad, monetización) | Media | Alta | Sin cajas de botín en BR, controles parentales, RGPD y COPPA |
| R-10 | Robo de cuentas y fraude con V-Bucks | Media | Media | 2FA incentivado, detección de fraude, soporte |

## 2. Comparativa: Fortnite BR (2017–2018) frente a Stormdrop

> Esta tabla describe el estado previo a la v1.1.0. El estado actual, requisito a requisito, está en [08 · Trazabilidad](08-trazabilidad.md).

Leyenda: ✅ implementado · 🟡 parcial o simplificado · ❌ no implementado.

| Área | Fortnite BR 2017–2018 | Stormdrop hoy | Estado |
|---|---|---|---|
| Jugadores por partida | 100 humanos en línea | 1 jugador + hasta 49 bots, sin conexión | 🟡 |
| Modos | Solo, Dúos, Escuadras, temporales | Solo contra bots | 🟡 |
| Multijugador en red | Servidor dedicado autoritativo | No | ❌ |
| Isla previa | Sí | No (lobby 3D y emparejamiento simulado) | ❌ |
| Autobús, caída libre y planeador | Sí | Dirigible, caída libre, planeador automático y manual | ✅ |
| Tormenta por fases | 9 fases (≈20 min) | 7 fases, más cortas (≈8–10 min) | ✅ |
| Mapa | ≈2,5 km, 20+ POI | 1,4 km, 8 POI, lago, montaña y caminos | 🟡 |
| Armas | 15–20 tipos, 5 rarezas | 5 tipos, 5 rarezas | 🟡 |
| Explosivos y arrojables | Granadas, cohetes, lanzagranadas | No | ❌ |
| Consumibles | 6 tipos | 4 tipos | 🟡 |
| Construcción: piezas | Muro, suelo, escalera, techo | Muro, suelo, rampa | 🟡 |
| Construcción: edición | Sí | No | ❌ |
| Integridad estructural | Sí | No (las piezas pueden flotar) | ❌ |
| Recolección y punto débil | Sí | Sí | ✅ |
| Destrucción del entorno | Casi total | Árboles, rocas, coches, paredes, cajas, contenedores | ✅ |
| Derribos (DBNO) y reanimación | En dúos y escuadras | No (no hay equipos) | ❌ |
| Botín: suelo, cofres, munición | Sí | Sí | ✅ |
| Entregas de suministros, llamas, expendedoras | Sí | No | ❌ |
| Vehículos (2018) | Carrito, avión | No | ❌ |
| Movimiento extra | — | Deslizamiento y escalada de bordes (no existían en 2017–2018) | ✅ |
| HUD, mapa y registro de bajas | Sí | Sí | ✅ |
| Visualización de sonido | Sí (2018) | No | ❌ |
| Repeticiones | Sí (2018) | No | ❌ |
| Cuentas, amigos y voz | Sí | No; estadísticas locales | ❌ |
| Tienda, V-Bucks y pase de batalla | Sí | No; casillero con atuendos gratuitos | ❌ |
| Plataformas | PC, consolas y móvil | Navegador (escritorio y móvil táctil) | 🟡 |
| Antitrampas | Sí | No aplica sin conexión | — |

## 3. Prioridades recomendadas para acercar Stormdrop

1. **Construcción completa:** añadir el techo piramidal, la edición de piezas e integridad estructural. Es el pilar diferencial del género.
2. **Más arsenal:** escopeta táctica, rifle con mira, pistola pesada, granadas y lanzacohetes, con daño a estructuras.
3. **Mapa y partida:** subir a 12–16 POI, alargar la tormenta a ≈15 minutos y añadir una isla previa de práctica.
4. **Equipos con bots:** dúos y escuadras con derribo y reanimación como paso previo al multijugador.
5. **Multijugador:** servidor autoritativo en Node.js o similar con WebSocket o WebRTC, predicción en el cliente y salas de 20–50 jugadores.
6. **Servicio:** cuentas, progresión por temporada y tienda de cosméticos, con un diseño legal y de marca propios.

## 4. Advertencia de propiedad intelectual

Las mecánicas descritas (battle royale, construcción, tormenta, rarezas por color) son ideas de género y se pueden usar.
**No** se deben reproducir:
- Nombres registrados: Fortnite, Battle Bus, V-Bucks, Victory Royale y los nombres de los lugares del mapa.
- Personajes, atuendos, bailes concretos, logotipos, sonidos, música ni diseño del mapa original.

Stormdrop usa nombres, mapa, modelos, audio y textos propios.
