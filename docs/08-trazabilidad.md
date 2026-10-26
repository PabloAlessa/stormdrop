# 08 · Matriz de trazabilidad (Stormdrop v1.1.0)

Estado de cada requisito de [03 · Requisitos funcionales](03-requisitos-funcionales.md) y [04 · Requisitos no funcionales](04-requisitos-no-funcionales.md) en el juego actual.

| Símbolo | Significado |
|---|---|
| ✅ | Cumplido |
| 🟡 | Cumplido parcialmente o adaptado al navegador sin servidor |
| ❌ | Pendiente: se puede hacer en el cliente, no está hecho aún |
| ⛔ | Requiere infraestructura o cuentas externas (servidores de juego, cuentas, pagos, tiendas de apps) |

`tools/check.py` verifica en CI que ningún requisito quede sin estado.

## Requisitos funcionales

| ID | Estado | Implementación / motivo |
|---|---|---|
| RF-PAR-01 | 🟡 | Selector Solo/Dúos/Escuadras en el lobby; el emparejamiento es local y los rivales son bots (`ui/menu.js`, `main.js`) |
| RF-PAR-02 | 🟡 | Hasta 50 jugadores por partida (bots); sin regiones ni plataformas porque no hay red |
| RF-PAR-03 | ✅ | Isla previa de 20 s sin daño, con materiales para practicar; se limpia al subir al dirigible (`startWarmup`, `startBus`) |
| RF-PAR-04 | ✅ | Dirigible con ruta aleatoria (`world/bus.js`) |
| RF-PAR-05 | ✅ | Salto voluntario y expulsión al final de la ruta |
| RF-PAR-06 | ✅ | Victoria individual o por equipo con estadísticas |
| RF-PAR-07 | ✅ | Espectar a compañeros o al eliminador, volver al lobby |
| RF-PAR-08 | 🟡 | Estadísticas de carrera guardadas en el navegador; sin XP ni desafíos (requieren progresión en servidor) |
| RF-MOV-01 | ✅ | Caminar, correr, esprintar, saltar, agacharse, deslizarse, trepar y nadar (`entities/character.js`) |
| RF-MOV-02 | ✅ | Caída libre con picado y planeador automático o manual |
| RF-MOV-03 | ✅ | Daño por caída por encima de ≈3 pisos |
| RF-MOV-04 | ✅ | Tercera persona sobre el hombro, apuntado y vista de mira telescópica (`entities/player.js`) |
| RF-MOV-05 | ✅ | Colisión y movimiento sobre muros, suelos, rampas y techos (`world/physics.js`) |
| RF-COM-01 | ✅ | Impacto instantáneo con dispersión, bloom y precisión del primer disparo (`combat/combat.js`) |
| RF-COM-02 | ✅ | Francotirador con proyectil y caída de bala |
| RF-COM-03 | ✅ | Multiplicador de cabeza por arma |
| RF-COM-04 | ✅ | Escudo hasta 100 que absorbe antes que la vida |
| RF-COM-05 | ✅ | Recarga por cargador o cartucho a cartucho; tiempo de equipamiento |
| RF-COM-06 | 🟡 | Granadas con rebote y lanzacohetes con daño en área y a estructuras; falta lanzagranadas |
| RF-COM-07 | ✅ | Números de daño, marcador de impacto e indicador de dirección |
| RF-COM-08 | ✅ | Derribo en Dúos y Escuadras con sangrado, arrastre, reanimación de 8 s y eliminación del equipo entero |
| RF-COM-09 | ✅ | Sin fuego amigo (`Character.isAlly`) |
| RF-CON-01 | ✅ | Muro, suelo, rampa y techo piramidal (`world/building.js`) |
| RF-CON-02 | ✅ | Madera, piedra y metal con vida y tiempo de construcción distintos |
| RF-CON-03 | ✅ | 10 por pieza, máximo 999 |
| RF-CON-04 | ✅ | La vida crece durante la construcción; daño y destrucción |
| RF-CON-05 | 🟡 | Edición con la tecla T por variantes (puerta, ventana, media pared, giro de rampa); sin selección libre de casillas |
| RF-CON-06 | ✅ | Integridad estructural: lo que queda sin apoyo se derrumba en cascada (`checkIntegrity`) |
| RF-CON-07 | ✅ | Recolección con pico y punto débil ×2 |
| RF-CON-08 | ✅ | Vista previa azul o roja |
| RF-CON-09 | ✅ | Construcción continua manteniendo el botón |
| RF-BOT-01 | ✅ | 5 ranuras más el pico; munición y materiales aparte |
| RF-BOT-02 | ✅ | Suelo, cofres, entregas de suministros con globo y cápsulas de suministros (`world/loot.js`) |
| RF-BOT-03 | ✅ | Cinco rarezas con color |
| RF-BOT-04 | ✅ | Recogida automática de munición y materiales |
| RF-BOT-05 | ✅ | Intercambio con la ranura actual y soltar objetos (G) |
| RF-BOT-06 | ✅ | Al morir se suelta todo |
| RF-BOT-07 | ❌ | Máquinas expendedoras pendientes |
| RF-TOR-01 | ✅ | Aviso y temporizador antes de cada cierre (`world/storm.js`) |
| RF-TOR-02 | ✅ | Círculos anidados sobre tierra firme |
| RF-TOR-03 | ✅ | 9 fases, daño creciente que ignora el escudo |
| RF-TOR-04 | ✅ | Muro de tormenta visible desde lejos |
| RF-UI-01 | ✅ | HUD completo (`ui/hud.js`) |
| RF-UI-02 | ✅ | Mapa con zona actual y siguiente, ruta del dirigible y marcador |
| RF-UI-03 | ✅ | Registro de bajas, derribos y reanimaciones |
| RF-UI-04 | ✅ | Visualización de sonido en Ajustes (disparos, pasos, cofres) |
| RF-UI-05 | 🟡 | Ajustes de sensibilidad, gráficos, audio y modo daltónico; los controles no se pueden reasignar |
| RF-UI-06 | 🟡 | Un baile (B); sin rueda de emoticonos |
| RF-SOC-01 | ⛔ | Cuentas: requiere servicio de identidad |
| RF-SOC-02 | ⛔ | Amigos, grupos y voz: requiere servidor |
| RF-SOC-03 | ✅ | Los bots rellenan la escuadra y siguen al jugador |
| RF-SOC-04 | ⛔ | Denuncias: requiere servidor y moderación |
| RF-SOC-05 | ⛔ | Juego y progresión cruzados: requiere cuentas y servidor |
| RF-SOC-06 | ❌ | Repeticiones pendientes (posible en el cliente grabando los estados) |
| RF-TIE-01 | ⛔ | Tienda: requiere backend de inventario y pagos |
| RF-TIE-02 | ⛔ | Compra de moneda: requiere pasarela de pago o tiendas de apps |
| RF-TIE-03 | 🟡 | Casillero con 10 atuendos; mochila y peinado van incluidos en el atuendo |
| RF-TIE-04 | ⛔ | Pase de batalla: requiere progresión y compras en servidor |
| RF-TIE-05 | ✅ | Ningún cosmético afecta al juego |
| RF-TIE-06 | 🟡 | Estadísticas locales; sin niveles de cuenta |

## Requisitos no funcionales

| ID | Estado | Implementación / motivo |
|---|---|---|
| RNF-REN-01 | ✅ | 60 FPS en PC de escritorio (≈8–10 ms por fotograma medidos); calidad baja para equipos modestos |
| RNF-REN-02 | 🟡 | Sin pruebas en el hardware mínimo de referencia |
| RNF-REN-03 | ✅ | Cuatro preajustes: resolución, sombras, post-procesado, hierba y distancia |
| RNF-REN-04 | ✅ | Instanciado por bloques, recorte por distancia, LOD de personajes y de animación |
| RNF-REN-05 | ✅ | Carga completa en ≈5–6 s |
| RNF-REN-06 | 🟡 | Memoria no medida en móviles de 3 GB |
| RNF-RED-01 | ⛔ | Requiere servidor dedicado autoritativo |
| RNF-RED-02 | ⛔ | Tick rate: no aplica sin red |
| RNF-RED-03 | ⛔ | Predicción y latencia: no aplica sin red |
| RNF-RED-04 | ⛔ | Replicación por relevancia: no aplica sin red |
| RNF-RED-05 | ⛔ | Reconexión: no aplica sin red |
| RNF-RED-06 | ⛔ | Regiones de servidores |
| RNF-ESC-01 | ⛔ | Escalado de servidores de partida |
| RNF-ESC-02 | ⛔ | Servicios de plataforma escalables |
| RNF-ESC-03 | ⛔ | Colas de acceso |
| RNF-ESC-04 | 🟡 | La disponibilidad depende del hosting estático elegido (GitHub Pages, Netlify o Cloudflare) |
| RNF-ESC-05 | ✅ | Despliegue estático sin cortes; el service worker actualiza por versión (`tools/build.py`) |
| RNF-SEG-01 | ⛔ | Validación en servidor: no hay servidor |
| RNF-SEG-02 | ⛔ | Antitrampas: sin partidas en línea no aplica |
| RNF-SEG-03 | ⛔ | Expulsiones y denuncias |
| RNF-SEG-04 | ⛔ | 2FA: no hay cuentas |
| RNF-SEG-05 | ⛔ | Protección de compras: no hay compras |
| RNF-SEG-06 | ✅ | No se recogen datos personales; telemetría anónima, opcional y desactivada por defecto; CSP y cabeceras de seguridad |
| RNF-USA-01 | ✅ | Se juega sin tutorial; consejos en la carga y lista de controles |
| RNF-USA-02 | ✅ | Rareza, vida y escudo por color y por forma |
| RNF-USA-03 | ✅ | Modo daltónico (protanopía, deuteranopía, tritanopía) y visualización de sonido |
| RNF-USA-04 | ❌ | Reasignación de controles pendiente |
| RNF-USA-05 | 🟡 | Textos escalados para móvil; no hay diálogos que subtitular |
| RNF-LOC-01 | 🟡 | Sólo español |
| RNF-LOC-02 | ⛔ | Precios regionales: no hay tienda |
| RNF-CAL-01 | 🟡 | Captura de errores con recuperación y envío por telemetría si se configura un endpoint; sin servicio de informes propio |
| RNF-CAL-02 | 🟡 | CI/CD lista (`.github/workflows/deploy.yml`); la cadencia de contenido es tarea de operación |
| RNF-CAL-03 | 🟡 | Equilibrio centralizado en `js/config.js`; sin configuración remota |
| RNF-CAL-04 | ✅ | Telemetría de inicio y fin de partida, rendimiento y errores (`js/core/telemetry.js`) |
| RNF-LEG-01 | ✅ | Sin sangre; los eliminados se desintegran |
| RNF-LEG-02 | ⛔ | Certificación de tiendas de consolas y apps |
| RNF-LEG-03 | ✅ | Sin cajas de botín ni pagos |
| RNF-LEG-04 | ❌ | Términos de uso y política de privacidad pendientes de redactar (necesitan datos legales del titular) |

## Resumen

| Estado | Funcionales | No funcionales |
|---|---|---|
| ✅ | 42 | 12 |
| 🟡 | 9 | 8 |
| ❌ | 2 | 2 |
| ⛔ | 7 | 16 |
| **Total** | **60** | **38** |

Todo lo que se puede hacer en el cliente está cumplido o parcial, salvo 4 pendientes: expendedoras, repeticiones, reasignación de controles y textos legales.
Los ⛔ forman un bloque aparte: servidor multijugador, cuentas, tienda y certificaciones. Su plan está en [09 · Despliegue y operación](09-despliegue.md#5-fase-siguiente-servicios-en-línea).
