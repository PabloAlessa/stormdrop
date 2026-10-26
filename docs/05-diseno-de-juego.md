# 05 · Diseño de juego (GDD resumido)

Los valores son aproximados (≈) porque cambiaron en muchos parches de 2017–2018.

## 1. Bucle de juego

```
Lobby → Emparejamiento → Isla previa → Autobús → Caída y planeo → Saqueo
   ↑                                                                      ↓
Recompensas ← Fin de partida ← Combate y construcción ← Rotación por la tormenta
```

Duración objetivo: ≈20 minutos. La mayoría de las eliminaciones ocurren en la caída y al final de la partida.

## 2. Movimiento

| Parámetro | Valor (≈) |
|---|---|
| Altura de salida del autobús | Muy por encima de los edificios más altos; ≈1 min hasta el suelo |
| Despliegue automático del planeador | A baja altura sobre el terreno |
| Daño por caída | A partir de ≈3 pisos; aumenta con la altura |
| Agacharse | Reduce la dispersión del arma y el ruido de los pasos |

## 3. Vida, escudo y consumibles

| Objeto | Efecto | Tiempo de uso | Límite | Pila |
|---|---|---|---|---|
| Vendas | +15 de vida | 3,5 s | Hasta 75 de vida | 15 |
| Botiquín | Vida completa | 10 s | 100 | 3 |
| Poción pequeña de escudo | +25 de escudo | 2 s | Hasta 50 de escudo | 10 |
| Poción de escudo | +50 de escudo | 5 s | 100 | 2 |
| Zumo (Slurp, 2018) | +75 de vida o escudo en el tiempo | 2 s + 37,5 s | 100 / 100 | 2 |
| Bidón (Chug Jug) | Vida y escudo completos | 15 s | 100 / 100 | 1 |

## 4. Armas (selección 2017–2018)

Rareza: **C** común (gris) · **PC** poco común (verde) · **R** rara (azul) · **É** épica (morada) · **L** legendaria (dorada).

| Arma | Rarezas | Daño por impacto (≈) | Cadencia | Cargador | Notas |
|---|---|---|---|---|---|
| Rifle de asalto (M4) | C–R | 30–33 | ≈5,5/s | 30 | Munición media; el arma base del juego |
| Rifle de asalto (SCAR) | É–L | 35–36 | ≈5,5/s | 30 | Muy buscado |
| Rifle con mira | R–É | 23–24 | ≈3,5/s | 20 | Mira telescópica corta |
| Rifle de ráfaga | C–L | 27–30 | Ráfagas de 3 | 30 | |
| Escopeta de corredera | PC–R (É–L después) | ≈80–95 (cuerpo) | ≈0,7/s | 5 | Gran daño a la cabeza; recarga cartucho a cartucho |
| Escopeta táctica | C–R | ≈67–74 | ≈1,5/s | 8 | |
| Escopeta pesada (2018) | É–L | ≈74–77 | ≈1/s | 7 | |
| Subfusil y subfusil con silenciador | C–É | 17–19 | ≈9–12/s | 30 | Munición ligera; corta distancia |
| Ametralladora ligera | R–É | 23–25 | ≈8/s | 100 | |
| Pistola y pistola con silenciador | C–É | 23–28 | ≈6,7/s | 16 | |
| Revólver y cañón de mano | C–L | 54–78 | Lenta | 6–7 | Munición pesada |
| Francotirador de cerrojo | R–L | 105–116 | 1 disparo | 1 | ×2,5 en la cabeza; caída de bala |
| Rifle de caza | PC–R | ≈86–90 | 1 disparo | 1 | Sin mira |
| Lanzacohetes | R–L | 110–121 | Lenta | 1 | Daño en área y destrucción de estructuras |
| Lanzagranadas | R–L | ≈100–110 | | 6 | |
| Granada / granada de impulso / bomba de baile | — | 100 / 0 / 0 | Arrojable | Pila | Explosión, empuje y baile forzado |
| Minigun (2018) | É–L | ≈18–19 | Muy alta | Sin cargador (se calienta) | Destruye estructuras muy rápido |

Reglas generales:
- La dispersión ("bloom") aumenta con cada disparo y al moverse, saltar o no apuntar.
- Agacharse y apuntar reducen la dispersión.
- Los disparos a la cabeza multiplican el daño entre ×1,5 y ×2,5 según el arma.
- Cada salto de rareza sube el daño en ≈5 % y reduce el tiempo de recarga.

### 4.1 Munición
| Tipo | Armas | Caja de munición típica |
|---|---|---|
| Ligera | Subfusiles y pistolas | ≈18 |
| Media | Rifles de asalto | ≈10 |
| Pesada | Francotiradores y revólver | ≈6 |
| Cartuchos | Escopetas | ≈4 |
| Cohetes | Lanzacohetes y lanzagranadas | ≈1–2 |

## 5. Construcción

| Material | Vida máxima (≈) | Tiempo hasta vida máxima | Vida al colocar | Notas |
|---|---|---|---|---|
| Madera | 150 (muro) | Rápido (≈5 s) | Baja | Se construye antes; el material más común |
| Ladrillo | 300 | Medio | Media | |
| Metal | 400–500 | Lento | Muy baja al inicio | El más resistente cuando termina |

- **Rejilla:** las casillas miden 512 unidades de motor (≈5 m) y un piso de muro mide ≈4 m de alto.
- **Piezas:** muro, suelo, escalera y techo (pirámide). Cada una cuesta 10 de material.
- **Edición:** una rejilla de 3×3 en muros y de 2×2 en suelos y techos; se seleccionan casillas para abrir puertas, ventanas, medias paredes, arcos y rampas giradas.
- **Integridad estructural:** si se destruye la pieza que conecta con el suelo, cae todo lo que dependía de ella.
- **Recolección:** el pico hace ≈50 de daño a objetos y 20 a jugadores. El punto débil azul dobla el daño y el material obtenido.

## 6. Tormenta (estructura típica 2017–2018)

| Fase | Espera antes de cerrar (≈) | Cierre (≈) | Daño/s fuera |
|---|---|---|---|
| 1 | 3 min 20 s | 3 min | 1 |
| 2 | 2 min | 2 min | 1 |
| 3 | 1 min 30 s | 1 min 30 s | 2 |
| 4 | 1 min 20 s | 1 min 10 s | 5 |
| 5 | 50 s | 1 min | 10 |
| 6–9 | 30–45 s | 30–60 s | 10 |

El último círculo se cierra por completo. El daño de la tormenta ignora el escudo.

## 7. Mapa

- Isla de ≈2,5 × 2,5 km con una rejilla de coordenadas A–J × 1–10.
- **20 a 24 POI** con nombre: pueblos residenciales, zona comercial, fábrica, zona industrial, puerto, prisión, cantera, granja, campo de tiro, montañas, lago y una zona urbana alta añadida en 2018.
- Cada temporada cambiaba algo del mapa: un meteorito, nuevos biomas (desierto, selva y nieve), estructuras flotantes, etc.
- Densidad de botín alta en los POI y baja en campo abierto. Cofres en casas y edificios.

## 8. Progresión y economía

| Elemento | Funcionamiento |
|---|---|
| Nivel de temporada | Se sube con experiencia por partida (tiempo vivo, eliminaciones, posición, cofres) |
| Pase de batalla | 70–100 niveles; versión gratuita y de pago (950 V-Bucks); se pagaba con V-Bucks recuperables jugando |
| Desafíos semanales | 7 desafíos por semana que dan estrellas de batalla para subir niveles |
| Tienda | Rotación diaria y destacada; atuendos de 800 a 2.000 V-Bucks |
| Cosméticos | Atuendos, mochilas, picos, planeadores, emoticonos, estelas de caída, envoltorios (2018) y música (2018) |
| Regla de oro | Ningún cosmético afecta al juego |

## 9. Audio

- El sonido es información de juego: pasos, cofres, disparos con dirección y distancia, construcción y planeadores.
- Música en el lobby y en el autobús; en partida, sólo efectos y aviso de tormenta.
- Visualización de sonido (2018) para jugadores sordos o con hipoacusia.

## 10. Estilo visual

- Estilo caricaturesco, colores saturados y siluetas legibles.
- Sin sangre: los eliminados se desintegran.
- Rareza, escudo y tormenta se reconocen sólo por el color.
- Tono humorístico: bailes, objetos absurdos y eventos en directo.
